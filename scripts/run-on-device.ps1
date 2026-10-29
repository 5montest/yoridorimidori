<#
.SYNOPSIS
    実機（Android）で Expo Go を起動する。D1〜D7 の実機検証用。

.DESCRIPTION
    1) Metro 開発サーバをバックグラウンドで起動（ログ: .cache/metro.log）
    2) adb reverse を設定して端末から PC の Metro へ USB 経由で到達させる
    3) exp:// URL で Expo Go を起動する

    サンドボックス対策:
      - USERPROFILE / HOME を <repo>/home へリダイレクト（~/.expo の EPERM 回避）
      - CI=1 / EXPO_NO_TELEMETRY=1（非対話）
      - Metro は --max-workers 1（ワーカー fork の EPERM 回避）

.PARAMETER Port
    Metro のポート（既定 8081）

.PARAMETER Stop
    Metro を停止する

.PARAMETER SkipMetro
    Metro を起動せず、既存のサーバに接続だけする

.PARAMETER NoLaunch
    Expo Go の起動はせず、Metro と adb reverse だけ行う

.EXAMPLE
    pwsh -File scripts/run-on-device.ps1
    pwsh -File scripts/run-on-device.ps1 -Stop
#>
param(
    [int]$Port = 8081,
    [switch]$Stop,
    [switch]$SkipMetro,
    [switch]$NoLaunch
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$mobile = Join-Path $root 'mobile'
$cacheDir = Join-Path $root '.cache'
$pidFile = Join-Path $cacheDir 'metro.pid'
$logFile = Join-Path $cacheDir 'metro.log'
$errFile = Join-Path $cacheDir 'metro.err.log'

function Stop-MetroServer {
    if (Test-Path $pidFile) {
        $metroPid = Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($metroPid) {
            Stop-Process -Id ([int]$metroPid) -Force -ErrorAction SilentlyContinue
            Write-Host "Metro (PID $metroPid) を停止しました。"
        }
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    }
    # ポートを掴んでいる残存プロセスも掃除
    $conns = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
        Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}

function Wait-Port([int]$p, [int]$timeoutSec = 90) {
    $deadline = (Get-Date).AddSeconds($timeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $client = [System.Net.Sockets.TcpClient]::new()
            $async = $client.BeginConnect('127.0.0.1', $p, $null, $null)
            if ($async.AsyncWaitHandle.WaitOne(500) -and $client.Connected) { $client.Close(); return $true }
            $client.Close()
        } catch { }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

if ($Stop) {
    Stop-MetroServer
    exit 0
}

New-Item -ItemType Directory -Force -Path $cacheDir, (Join-Path $root 'home') | Out-Null

# --- サンドボックス対策の環境変数 ---
$env:USERPROFILE = Join-Path $root 'home'
$env:HOME = $env:USERPROFILE
$env:CI = '1'
$env:EXPO_NO_TELEMETRY = '1'
$env:npm_config_cache = Join-Path $cacheDir 'npm'

# --- 端末接続確認 ---
$devices = (adb devices) | Select-String -Pattern '\s+device$'
if (-not $devices) {
    Write-Warning '接続中の Android 端末がありません（adb devices が空）。USB デバッグを有効にして接続してください。'
}

# --- Metro 起動 ---
if (-not $SkipMetro) {
    if (Wait-Port $Port 1) {
        Write-Host "ポート $Port は既に使用中です。既存の Metro に接続します（停止は -Stop）。"
    } else {
        Write-Host "Metro を起動しています（ログ: $logFile）..."
        $proc = Start-Process -FilePath 'npx.cmd' `
            -ArgumentList @('expo', 'start', '--max-workers', '1', '--port', "$Port") `
            -WorkingDirectory $mobile `
            -RedirectStandardOutput $logFile `
            -RedirectStandardError $errFile `
            -NoNewWindow -PassThru
        Set-Content -Path $pidFile -Value $proc.Id
        if (-not (Wait-Port $Port 90)) {
            Write-Error "Metro が起動しませんでした。$errFile を確認してください。"
            exit 1
        }
        Write-Host "Metro 起動完了（PID $($proc.Id)）。"
    }
}

# --- adb reverse ---
$rev = (adb reverse "tcp:$Port" "tcp:$Port" 2>&1) | Out-String
Write-Host "adb reverse: $($rev.Trim())"

# --- 端末を起こして Expo Go で開く ---
adb shell input keyevent KEYCODE_WAKEUP 2>&1 | Out-Null
if (-not $NoLaunch) {
    $url = "exp://127.0.0.1:$Port"
    adb shell am start -a android.intent.action.VIEW -d $url 2>&1 | Out-Null
    Write-Host "Expo Go で $url を開きました。バンドル完了まで数十秒待ってください。"
    Write-Host "スクリーンショット: adb exec-out screencap -p > .cache/screen.png"
}
Write-Host ''
Write-Host '停止: pwsh -File scripts/run-on-device.ps1 -Stop'
