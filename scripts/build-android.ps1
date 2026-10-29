#Requires -Version 7.0
<#
.SYNOPSIS
  Android APK をローカルビルドする再現スクリプト（Expo prebuild + Gradle）。

.DESCRIPTION
  「寄鳥美鳥地」Expo アプリの Android APK を生成します。
  通常の Windows PC（DSH サンドボックス外）を想定しています。

  前提:
    - Node.js 22 / npm 10
    - JDK 17（JAVA_HOME 設定済み、または -JavaHome 指定）
    - Android SDK（ANDROID_HOME 設定済み、または Android Studio 既定の場所）
      * 不足する platform / build-tools / NDK / CMake は AGP が自動ダウンロードします
        （SDK ディレクトリが書込み可能であること）

  重要 (DSH サンドボックス内では実行不可):
    このリポジトリの検証環境（DSH サンドボックス / workspace-write）では、
    プロセス制約により ninja が子プロセス実行後に終了せずハングするため、
    `:app:configureCMakeDebug` 以降が完了しません。詳細は
    docs/research/production-build.md を参照してください。
    その環境では EAS Build / GitHub Actions を使用してください。

.EXAMPLE
  pwsh -File scripts/build-android.ps1

.EXAMPLE
  pwsh -File scripts/build-android.ps1 -ProjectRoot mobile -Task assembleDebug -Arch arm64-v8a

.EXAMPLE
  # DSH サンドボックス内での準備だけ行う場合（prebuild まで）
  pwsh -File scripts/build-android.ps1 -SkipBuild -Sandbox
#>
[CmdletBinding()]
param(
  # mobile/ の場所（リポジトリルートからの相対、または絶対パス）
  [string]$ProjectRoot = "mobile",

  # Gradle タスク
  [ValidateSet("assembleDebug", "assembleRelease")]
  [string]$Task = "assembleDebug",

  # 対象 ABI（実機は arm64-v8a で十分。全 ABI なら空文字）
  [string]$Arch = "arm64-v8a",

  # prebuild をスキップ（android/ が既に生成済みの場合）
  [switch]$SkipPrebuild,

  # Gradle 実行のみスキップ（prebuild だけ行う）
  [switch]$SkipBuild,

  # DSH サンドボックス向け: GRADLE_USER_HOME / ANDROID_HOME 等をワークスペース内へリダイレクト
  [switch]$Sandbox,

  # sandbox 用ローカルテンプレート tarball（expo-template-bare-minimum@sdk-58 を npm pack したもの）
  [string]$PrebuildTemplate,

  # JDK 17 のパス（既定: $env:JAVA_HOME）
  [string]$JavaHome = $env:JAVA_HOME
)

$ErrorActionPreference = "Stop"
$scriptRoot = $PSScriptRoot
$repoRoot = Split-Path -Parent $scriptRoot

function Write-Step([string]$msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Fail([string]$msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

if (-not [System.IO.Path]::IsPathRooted($ProjectRoot)) {
  $ProjectRoot = Join-Path $repoRoot $ProjectRoot
}
$ProjectRoot = (Resolve-Path $ProjectRoot).Path
$androidDir = Join-Path $ProjectRoot "android"
$apkOutDir = Join-Path $repoRoot ".cache\build"

# ---------------------------------------------------------------- 0. 前提チェック
Write-Step "0. 前提チェック"
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Fail "node が見つかりません（Node.js 22 をインストールしてください）" }
Write-Host ("node: {0}" -f (& node --version))

if (-not $JavaHome -or -not (Test-Path (Join-Path $JavaHome "bin\java.exe"))) {
  Fail "JDK 17 が見つかりません。-JavaHome を指定するか JAVA_HOME を設定してください"
}
$javaVersion = (& (Join-Path $JavaHome "bin\java.exe") -version 2>&1 | Out-String)
if ($javaVersion -notmatch 'version "17') {
  Write-Host "WARNING: JDK 17 以外が指定されています:`n$javaVersion" -ForegroundColor Yellow
}
Write-Host ("JAVA_HOME: {0}" -f $JavaHome)

if (-not $env:ANDROID_HOME -and -not $env:ANDROID_SDK_ROOT) {
  $defaultSdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
  if (Test-Path $defaultSdk) {
    $env:ANDROID_HOME = $defaultSdk
    Write-Host "ANDROID_HOME 未設定のため既定値を採用: $defaultSdk"
  } else {
    Fail "Android SDK が見つかりません。ANDROID_HOME を設定してください"
  }
}
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME

# ---------------------------------------------------------------- 1. 環境変数
Write-Step "1. 環境変数の設定"
$env:CI = "1"
$env:EXPO_NO_TELEMETRY = "1"
$env:EXPO_NO_GIT_STATUS = "1"
$env:PATH = "$JavaHome\bin;$env:PATH"

if ($Sandbox) {
  $env:GRADLE_USER_HOME  = Join-Path $repoRoot ".gradle"
  $env:ANDROID_USER_HOME = Join-Path $repoRoot ".android"
  $env:HOME              = Join-Path $repoRoot "home"
  $env:USERPROFILE       = Join-Path $repoRoot "home"
  $env:npm_config_cache  = Join-Path $repoRoot ".cache\npm"
  New-Item -ItemType Directory -Force -Path $env:GRADLE_USER_HOME, $env:ANDROID_USER_HOME, $env:HOME | Out-Null
  if (-not $env:ANDROID_HOME -or -not $env:ANDROID_HOME.StartsWith($repoRoot)) {
    Write-Host "WARNING: -Sandbox では ANDROID_HOME を書込み可能な SDK に向けてください（例: .build-probe\sdk）" -ForegroundColor Yellow
  }
  Write-Host "GRADLE_USER_HOME=$env:GRADLE_USER_HOME"
  Write-Host "ANDROID_HOME=$env:ANDROID_HOME"
}

# ---------------------------------------------------------------- 2. prebuild
if (-not $SkipPrebuild) {
  Write-Step "2. expo prebuild --platform android --no-install"
  Push-Location $ProjectRoot
  try {
    if ($PrebuildTemplate) {
      if (-not (Test-Path $PrebuildTemplate)) { Fail "テンプレートが見つかりません: $PrebuildTemplate" }
      & node "node_modules/expo/bin/cli" prebuild --platform android --no-install `
          --template $PrebuildTemplate
    } else {
      & npx expo prebuild --platform android --no-install
    }
    if ($LASTEXITCODE -ne 0) { Fail "prebuild が失敗しました (exit $LASTEXITCODE)" }
  } finally {
    Pop-Location
  }
} else {
  Write-Host "prebuild をスキップしました"
}
if (-not (Test-Path (Join-Path $androidDir "gradlew.bat"))) {
  Fail "android/gradlew.bat が見つかりません。prebuild に失敗した可能性があります"
}
if ($SkipBuild) {
  Write-Host "`n-SkipBuild のためここで終了します（android/ は生成済み）" -ForegroundColor Green
  exit 0
}

# ---------------------------------------------------------------- 3. Gradle ビルド
Write-Step "3. gradlew $Task"
$gradleArgs = @($Task, "--no-daemon", "--console=plain")
if ($Arch) { $gradleArgs += "-PreactNativeArchitectures=$Arch" }
# サンドボックス/CI で安定させるための指定（通常 PC でも無害）
$gradleArgs += "-Pkotlin.compiler.execution.strategy=in-process"
$gradleArgs += "-Dorg.gradle.vfs.watch=false"

Push-Location $androidDir
try {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  & .\gradlew.bat @gradleArgs
  $exit = $LASTEXITCODE
  $sw.Stop()
  Write-Host ("gradlew exit={0}  elapsed={1:N1}s" -f $exit, $sw.Elapsed.TotalSeconds)
  if ($exit -ne 0) { Fail "Gradle ビルドが失敗しました (exit $exit)。DSH サンドボックス内の場合は docs/research/production-build.md §5 を参照" }
} finally {
  Pop-Location
}

# ---------------------------------------------------------------- 4. APK 収集
Write-Step "4. APK の収集"
$variant = if ($Task -eq "assembleRelease") { "release" } else { "debug" }
$apk = Get-ChildItem (Join-Path $androidDir "app\build\outputs\apk\$variant") -Filter "*.apk" -ErrorAction SilentlyContinue |
       Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $apk) { Fail "APK が見つかりません（app/build/outputs/apk/$variant）" }

New-Item -ItemType Directory -Force -Path $apkOutDir | Out-Null
$dst = Join-Path $apkOutDir $apk.Name
Copy-Item $apk.FullName $dst -Force
Write-Host ("APK: {0} ({1:N1} MB)" -f $dst, ($apk.Length / 1MB)) -ForegroundColor Green

# 端末が接続されていればインストールを提案
$adb = Get-Command adb -ErrorAction SilentlyContinue
if ($adb) {
  $devices = (& adb devices) 2>&1 | Select-String -Pattern "\sdevice$"
  if ($devices) {
    Write-Host "`n接続端末へインストールする場合:" -ForegroundColor Yellow
    Write-Host "  adb install -r `"$dst`""
  }
}
Write-Host "`n完了しました。" -ForegroundColor Green
