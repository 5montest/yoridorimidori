#Requires -Version 7.0
<#
.SYNOPSIS
  Expo アプリの Android APK を生成し、任意で実機へインストールするスクリプト。

.DESCRIPTION
  「寄鳥美鳥地」Expo アプリ（mobile/ のスナップショット）を対象に、
  依存インストール → expo prebuild → Gradle assemble → APK 収集 →
  （任意で）adb install / 起動確認 / スクリーンショット までを一括実行する。

  実行可能な環境:
    - 通常の Windows PC（DSH サンドボックス外）
    - DSH の danger-full-access セッション
  実行不可の環境:
    - DSH の workspace-write セッション（子プロセス spawn が EPERM になり、
      ninja のハングで CMake ビルドが完了しない。docs/research/production-build.md §10.2）

  前提:
    - Node.js 22 / npm 10
    - JDK 17（JAVA_HOME 設定済み、または -JavaHome 指定）
    - Android SDK（ANDROID_HOME 設定済み、または Android Studio 既定の場所）
      不足する platform / build-tools / NDK / CMake は AGP が自動導入する（SDK が書込可能なこと）
    - 実機インストールには adb（platform-tools）

  失敗時の挙動:
    各ステップはログを .apk-build\logs\ に残し、致命的な失敗（依存インストール失敗など）が
    発生した場合は後続の依存ステップをスキップして最後にサマリを表示する。
    （「黙って途中で止まる」ことはしない）

.PARAMETER AppDir
  アプリのディレクトリ。既定はリポジトリルートからの `.apk-build\app`
  （mobile/ を Phase 4 実装中に触らないためのスナップショット置き場）。

.PARAMETER Task
  assembleDebug（既定）または assembleRelease。
  本テンプレートの release ビルドは debug 署名で構成されている（プロトタイプ配布向け）。

.PARAMETER Arch
  対象 ABI。既定 arm64-v8a（Pixel 4a など実機はこれで十分）。空文字で全 ABI。

.PARAMETER SkipInstall
  npm install をスキップ（node_modules が既にある場合）。

.PARAMETER SkipPrebuild
  expo prebuild をスキップ（android/ が既にある場合）。

.PARAMETER PrebuildWithInstall
  expo prebuild に `--no-install` を付けない（既定は付けない＝依存は事前 install 済み前提）。

.PARAMETER SkipDeviceInstall
  adb install / 起動確認をスキップ。

.PARAMETER DeviceSerial
  複数端末接続時の adb -s 指定（例: 12231JEC206116）。

.EXAMPLE
  pwsh -File scripts/build-apk.ps1
  # .apk-build\app で debug APK を作り、接続端末へインストール

.EXAMPLE
  pwsh -File scripts/build-apk.ps1 -Task assembleRelease -SkipDeviceInstall

.NOTES
  .ps1 は UTF-8 BOM 付きで保存すること（DSH 環境の PowerShell は BOM 無し UTF-8 を
  ANSI として解釈し、日本語コメントで構文エラーになる）。
#>
[CmdletBinding()]
param(
  [string]$AppDir = ".apk-build\app",

  [ValidateSet("assembleDebug", "assembleRelease")]
  [string]$Task = "assembleDebug",

  [string]$Arch = "arm64-v8a",

  [switch]$SkipInstall,
  [switch]$SkipPrebuild,
  [switch]$PrebuildWithInstall,
  [switch]$SkipDeviceInstall,

  [string]$DeviceSerial = "",

  [string]$JavaHome = $env:JAVA_HOME,

  # npm キャッシュ（未指定なら環境既定）。DSH では <workspace>\.cache\npm を推奨
  [string]$NpmCache = ""
)

$ErrorActionPreference = "Continue"
$repoRoot = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $repoRoot ".apk-build\logs"
$outDir = Join-Path $repoRoot ".cache\build"
New-Item -ItemType Directory -Force -Path $logDir, $outDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$results = [ordered]@{}
$fatal = $false

function Write-Step([string]$msg) {
  Write-Host "`n===== $msg =====" -ForegroundColor Cyan
}

# ネイティブコマンドを実行し、終了コードを記録する。fatal 指定時は失敗でフラグを立てる。
function Invoke-Native {
  param(
    [string]$Name,
    [string]$LogName,
    [scriptblock]$Action,
    [switch]$Fatal
  )
  Write-Step $Name
  $log = Join-Path $logDir "$stamp-$LogName.log"
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    & $Action 2>&1 | Tee-Object -FilePath $log
    $exit = $LASTEXITCODE
  } catch {
    Write-Host "EXCEPTION: $($_.Exception.Message)" -ForegroundColor Red
    $exit = -1
  }
  $sw.Stop()
  $elapsed = [Math]::Round($sw.Elapsed.TotalSeconds, 1)
  $results[$Name] = [pscustomobject]@{
    ExitCode = $exit
    Seconds  = $elapsed
    Log      = $log
  }
  if ($exit -ne 0) {
    Write-Host "FAILED: $Name (exit=$exit, ${elapsed}s) -> $log" -ForegroundColor Red
    if ($Fatal) { $fatal = $true }
  } else {
    Write-Host "OK: $Name (${elapsed}s)" -ForegroundColor Green
  }
  return ($exit -eq 0)
}

# ---------------------------------------------------------------- 0. 前提チェック
Write-Step "0. 前提チェック"
$AppDir = if ([System.IO.Path]::IsPathRooted($AppDir)) { $AppDir } else { Join-Path $repoRoot $AppDir }
if (-not (Test-Path (Join-Path $AppDir "package.json"))) {
  Write-Host "ERROR: $AppDir に package.json がありません。-AppDir を確認してください" -ForegroundColor Red
  exit 2
}
Write-Host "AppDir: $AppDir"

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Write-Host "ERROR: node が見つかりません" -ForegroundColor Red; exit 2 }
Write-Host ("node: {0} / npm: {1}" -f (& node --version), (& npm --version))

if (-not $JavaHome -or -not (Test-Path (Join-Path $JavaHome "bin\java.exe"))) {
  Write-Host "ERROR: JDK 17 が見つかりません（JAVA_HOME または -JavaHome を設定）" -ForegroundColor Red
  exit 2
}
$javaVersion = (& (Join-Path $JavaHome "bin\java.exe") -version 2>&1 | Out-String)
if ($javaVersion -notmatch 'version "17') {
  Write-Host "WARNING: JDK 17 以外が指定されています`n$javaVersion" -ForegroundColor Yellow
}
$env:JAVA_HOME = $JavaHome
$env:PATH = "$JavaHome\bin;$env:PATH"

if (-not $env:ANDROID_HOME) {
  $defaultSdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
  if (Test-Path $defaultSdk) { $env:ANDROID_HOME = $defaultSdk }
}
if (-not $env:ANDROID_HOME) {
  Write-Host "WARNING: ANDROID_HOME が未設定です。Gradle が SDK を見つけられない可能性があります" -ForegroundColor Yellow
} else {
  $env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
  Write-Host "ANDROID_HOME: $env:ANDROID_HOME"
}

$env:CI = "1"
$env:EXPO_NO_TELEMETRY = "1"
$env:EXPO_NO_GIT_STATUS = "1"
if ($NpmCache) { $env:npm_config_cache = $NpmCache }
if ($env:npm_config_cache) { Write-Host "npm cache: $env:npm_config_cache" }

# ---------------------------------------------------------------- 1. 依存インストール
if (-not $SkipInstall) {
  $ok = Invoke-Native -Name "npm install" -LogName "npm-install" -Fatal -Action {
    Push-Location $AppDir
    try { & npm install --no-audit --no-fund } finally { Pop-Location }
  }
  if (-not $ok) { $fatal = $true } else { $fatal = $false }
} else {
  Write-Host "npm install をスキップしました（-SkipInstall）"
  $results["npm install"] = "skipped"
}

if ($fatal) {
  Write-Host "`n致命的エラー（依存インストール失敗）のため中断します。ログを確認してください。" -ForegroundColor Red
  exit 1
}

# ---------------------------------------------------------------- 2. prebuild
$androidDir = Join-Path $AppDir "android"
if (-not $SkipPrebuild) {
  $ok = Invoke-Native -Name "expo prebuild" -LogName "prebuild" -Fatal -Action {
    Push-Location $AppDir
    try {
      if ($PrebuildWithInstall) {
        & npx expo prebuild --platform android
      } else {
        & npx expo prebuild --platform android --no-install
      }
    } finally { Pop-Location }
  }
  if (-not $ok) { $fatal = $true }
} else {
  Write-Host "prebuild をスキップしました（-SkipPrebuild）"
  $results["expo prebuild"] = "skipped"
}

if (-not (Test-Path (Join-Path $androidDir "gradlew.bat"))) {
  Write-Host "`nandroid/gradlew.bat が見つからないため中断します（prebuild 失敗）" -ForegroundColor Red
  exit 1
}

# ---------------------------------------------------------------- 3. Gradle ビルド
if (-not $fatal) {
  $ok = Invoke-Native -Name $Task -LogName ("gradle-" + $Task) -Fatal -Action {
    Push-Location $androidDir
    try {
      $gradleArgs = @($Task, "--no-daemon", "--console=plain")
      if ($Arch) { $gradleArgs += "-PreactNativeArchitectures=$Arch" }
      & .\gradlew.bat @gradleArgs
    } finally { Pop-Location }
  }
  if (-not $ok) { $fatal = $true }
}

if ($fatal) {
  Write-Host "`nGradle ビルドが失敗しました。ログ: $logDir" -ForegroundColor Red
  exit 1
}

# ---------------------------------------------------------------- 4. APK 収集
Write-Step "4. APK の収集"
$variant = if ($Task -eq "assembleRelease") { "release" } else { "debug" }
$apkDir = Join-Path $androidDir "app\build\outputs\apk\$variant"
$apk = Get-ChildItem $apkDir -Filter "*.apk" -ErrorAction SilentlyContinue |
       Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $apk) {
  Write-Host "ERROR: APK が見つかりません: $apkDir" -ForegroundColor Red
  exit 1
}
$dst = Join-Path $outDir $apk.Name
Copy-Item $apk.FullName $dst -Force
Write-Host ("APK: {0} ({1:N1} MB)" -f $dst, ($apk.Length / 1MB)) -ForegroundColor Green
$results["APK"] = [pscustomobject]@{ Path = $dst; SizeMB = [Math]::Round($apk.Length / 1MB, 1) }

# ---------------------------------------------------------------- 5. 端末インストール / 起動確認
if (-not $SkipDeviceInstall) {
  $adb = Get-Command adb -ErrorAction SilentlyContinue
  if (-not $adb) {
    Write-Host "adb が見つからないため端末インストールをスキップします" -ForegroundColor Yellow
    $results["adb install"] = "skipped (adb not found)"
  } else {
    $serialArgs = @()
    if ($DeviceSerial) { $serialArgs = @("-s", $DeviceSerial) }
    $devices = (& adb @serialArgs devices) 2>&1 | Select-String -Pattern "\sdevice$"
    if (-not $devices) {
      Write-Host "接続端末が無いため端末インストールをスキップします" -ForegroundColor Yellow
      $results["adb install"] = "skipped (no device)"
    } else {
      $ok = Invoke-Native -Name "adb install" -LogName "adb-install" -Action {
        & adb @serialArgs install -r $dst
      }
      if ($ok -and $results["adb install"].ExitCode -eq 0) {
        Write-Host "起動確認 (monkey) を実行します..."
        & adb @serialArgs shell monkey -p jp.yoridorimidori.app 1 2>&1 | Tee-Object -FilePath (Join-Path $logDir "$stamp-adb-launch.log")
        Start-Sleep -Seconds 4
        $png = Join-Path $outDir "apk-launch.png"
        # バイナリを壊さないよう cmd のリダイレクトで保存
        & cmd.exe /c "adb $($serialArgs -join ' ') exec-out screencap -p > `"$png`""
        if (Test-Path $png) {
          Write-Host "スクリーンショット: $png" -ForegroundColor Green
          $results["launch screenshot"] = $png
        }
      }
    }
  }
} else {
  Write-Host "端末インストールをスキップしました（-SkipDeviceInstall）"
  $results["adb install"] = "skipped"
}

# ---------------------------------------------------------------- 6. サマリ
Write-Step "6. サマリ"
if ($fatal) {
  Write-Host "結果: 失敗（致命的エラー）" -ForegroundColor Red
  exit 1
}
Write-Host "結果: 成功" -ForegroundColor Green
foreach ($k in $results.Keys) {
  $v = $results[$k]
  if ($v -is [pscustomobject] -and $v.PSObject.Properties.Name -contains "ExitCode") {
    Write-Host ("  {0}: exit={1}, {2}s, log={3}" -f $k, $v.ExitCode, $v.Seconds, $v.Log)
  } else {
    Write-Host ("  {0}: {1}" -f $k, $v)
  }
}
if ($results["APK"]) {
  Write-Host ("`nAPK: {0} ({1} MB)" -f $results["APK"].Path, $results["APK"].SizeMB) -ForegroundColor Green
}
exit 0
