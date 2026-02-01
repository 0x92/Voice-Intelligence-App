[CmdletBinding()]
param(
  [string]$WhisperUrl = $env:WHISPER_CPP_URL,
  [string]$ModelUrl = $env:WHISPER_MODEL_URL
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$appDir = Resolve-Path (Join-Path $scriptDir "..")
$whisperDir = Join-Path $appDir "whisper"
$modelsDir = Join-Path $appDir "models"

New-Item -ItemType Directory -Force -Path $whisperDir, $modelsDir | Out-Null

if (-not $ModelUrl) {
  $ModelUrl = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin"
}

function Get-WhisperAssetUrl {
  $headers = @{ "User-Agent" = "voice-intelligence-installer" }
  $release = Invoke-RestMethod -Uri "https://api.github.com/repos/ggerganov/whisper.cpp/releases/latest" -Headers $headers
  $assets = $release.assets
  if (-not $assets) {
    throw "No assets found in latest release."
  }
  $pattern = "(whisper|whisper\\.cpp|whisper-cpp).*(win|windows).*(x64|amd64).*\\.zip$"
  $asset = $assets | Where-Object { $_.name -match $pattern } | Select-Object -First 1
  if (-not $asset) {
    $asset = $assets | Where-Object { $_.name -match "(win|windows).*(x64|amd64).*\\.zip$" } | Select-Object -First 1
  }
  if (-not $asset) {
    throw "Could not find a Windows x64 asset. Set WHISPER_CPP_URL or pass -WhisperUrl."
  }
  return $asset.browser_download_url
}

$cliPath = Join-Path $whisperDir "whisper-cli.exe"
if (-not (Test-Path $cliPath)) {
  if (-not $WhisperUrl) {
    $WhisperUrl = Get-WhisperAssetUrl
  }

  $tmpRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("whisper-cpp-" + [System.Guid]::NewGuid().ToString("N"))
  New-Item -ItemType Directory -Force -Path $tmpRoot | Out-Null
  $archivePath = Join-Path $tmpRoot "whisper.zip"

  Write-Host "Downloading whisper.cpp from $WhisperUrl"
  Invoke-WebRequest -Uri $WhisperUrl -OutFile $archivePath

  Write-Host "Extracting whisper.cpp..."
  Expand-Archive -Path $archivePath -DestinationPath $tmpRoot -Force

  $cli = Get-ChildItem -Path $tmpRoot -Recurse -Filter "whisper-cli.exe" | Select-Object -First 1
  if (-not $cli) {
    $cli = Get-ChildItem -Path $tmpRoot -Recurse -Filter "main.exe" | Select-Object -First 1
  }
  if (-not $cli) {
    throw "whisper-cli.exe or main.exe not found in archive."
  }

  $sourceDir = $cli.Directory.FullName
  Copy-Item -Path (Join-Path $sourceDir "*") -Destination $whisperDir -Recurse -Force

  $mainExe = Join-Path $whisperDir "main.exe"
  if ((Test-Path $mainExe) -and -not (Test-Path $cliPath)) {
    Copy-Item -Path $mainExe -Destination $cliPath -Force
  }

  Remove-Item -Path $tmpRoot -Recurse -Force
} else {
  Write-Host "whisper-cli.exe already present in $whisperDir"
}

$modelPath = Join-Path $modelsDir "ggml-base.bin"
if (-not (Test-Path $modelPath)) {
  Write-Host "Downloading model to $modelPath"
  Invoke-WebRequest -Uri $ModelUrl -OutFile $modelPath
} else {
  Write-Host "Model already present at $modelPath"
}

Write-Host "Done."
