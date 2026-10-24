#Requires -Version 5.1
# Optional smoke: runtime and OpenCode user paths are both isolated.
# Gercek kullanici config'ine dokunmaz.

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot

# Gecici temiz runtime dizini (temiz makine simulasyonu)
$cleanRoot = Join-Path $env:TEMP ("aitest-clean-install-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
$previousEnvironment = @{}
$environmentNames = @("LOCALAPPDATA", "USERPROFILE", "AITEST_CONFIG", "AITEST_DB_PATH", "AITEST_WORKER_ENABLED", "AITEST_PROFILE", "AITEST_SMOKE_COMMAND_JSON")
foreach ($name in $environmentNames) { $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, "Process") }
$env:LOCALAPPDATA = $cleanRoot
$env:USERPROFILE = Join-Path $cleanRoot "user"
# install.ps1 LOCALAPPDATA altina "ai-test-engineering" ekler:
$cleanAppRoot = Join-Path $cleanRoot "ai-test-engineering"
$env:AITEST_CONFIG = Join-Path $cleanAppRoot "config/config.json"
$env:AITEST_DB_PATH = Join-Path $cleanAppRoot "state.db"
$env:AITEST_WORKER_ENABLED = "0"
$env:AITEST_PROFILE = "v1"
Remove-Item Env:AITEST_SMOKE_COMMAND_JSON -ErrorAction SilentlyContinue
Write-Host "[temiz-kurulum] LOCALAPPDATA override: $cleanRoot"

try {
  # install.ps1'i gecici dizinle calistir
  & node (Join-Path $PSScriptRoot "install.mjs")
  $installExit = $LASTEXITCODE

  # dogrulama
  $ok = $true
  if (-not (Test-Path (Join-Path $cleanAppRoot "config\config.json"))) { Write-Host "EKSIK: config olusturulmadi"; $ok = $false }
  if (-not (Test-Path (Join-Path $cleanAppRoot "blobs"))) { Write-Host "EKSIK: blobs yok"; $ok = $false }
  if (-not (Test-Path (Join-Path $RepoRoot "dist\mcp\stdio-entry.js"))) { Write-Host "EKSIK: dist uretilmedi"; $ok = $false }

  # BOM kontrolu (temiz makine bulgusu)
  $bytes = [System.IO.File]::ReadAllBytes((Join-Path $cleanAppRoot "config\config.json"))
  if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    Write-Host "HATA: config BOM'lu"; $ok = $false
  } else {
    Write-Host "OK: config BOM'suz UTF-8"
  }

  # gercek server smoke: temiz config ile 4 arac
  & node (Join-Path $PSScriptRoot "mcp-handshake-smoke.mjs")
  if ($LASTEXITCODE -ne 0) { $ok = $false }

  if ($ok -and $installExit -eq 0) {
    Write-Host "TEMIZ KURULUM KANITI: GECTI"
    exit 0
  } else {
    Write-Host "TEMIZ KURULUM KANITI: EKSIKLER VAR"
    exit 1
  }
} finally {
  foreach ($name in $environmentNames) { [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], "Process") }
  $target = [System.IO.Path]::GetFullPath($cleanRoot)
  $tempPrefix = [System.IO.Path]::GetFullPath($env:TEMP).TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
  if (-not $target.StartsWith($tempPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $target) -notlike "aitest-clean-install-*") { throw "Unsafe cleanup path" }
  # temizlik: yalniz urunun gecici dizini
  if (Test-Path $cleanRoot) {
    Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction SilentlyContinue
  }
}
