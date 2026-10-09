#Requires -Version 5.1
# Temiz ortam install smoke: gecici LOCALAPPDATA ile install.ps1 akisini sifirdan dogrular.
# Gercek kullanici config'ine dokunmaz.

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot

# Gecici temiz runtime dizini (temiz makine simulasyonu)
$cleanRoot = Join-Path $env:TEMP ("aitest-clean-install-" + [guid]::NewGuid().ToString("N").Substring(0, 8))
$env:LOCALAPPDATA = $cleanRoot
# install.ps1 LOCALAPPDATA altina "ai-test-engineering" ekler:
$cleanAppRoot = Join-Path $cleanRoot "ai-test-engineering"
Write-Host "[temiz-kurulum] LOCALAPPDATA override: $cleanRoot"

try {
  # install.ps1'i gecici dizinle calistir
  & (Join-Path $PSScriptRoot "install.ps1")
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
  $server = Start-Process -FilePath "node" -ArgumentList (Join-Path $RepoRoot "dist\mcp\stdio-entry.js") -PassThru -WindowStyle Hidden
  Start-Sleep -Seconds 2
  Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue

  if ($ok -and $installExit -eq 0) {
    Write-Host "TEMIZ KURULUM KANITI: GECTI"
    exit 0
  } else {
    Write-Host "TEMIZ KURULUM KANITI: EKSIKLER VAR"
    exit 1
  }
} finally {
  # temizlik: yalniz urunun gecici dizini
  if (Test-Path $cleanRoot) {
    Remove-Item -Recurse -Force $cleanRoot -ErrorAction SilentlyContinue
  }
}
