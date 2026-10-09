#Requires -Version 5.1
# AI Test Engineering kurulum dogrulamasi: prerequisite + config + MCP initialize profili.

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$AppDataRoot = if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA "ai-test-engineering" } else { throw "LOCALAPPDATA cozumlenemedi" }

$ok = $true

Write-Host "[verify] prerequisite"
foreach ($cmd in @("node", "git", "java")) {
  if (Get-Command $cmd -ErrorAction SilentlyContinue) { Write-Host "  OK: $cmd" } else { Write-Host "  EKSIK: $cmd"; $ok = $false }
}

Write-Host "[verify] dist"
if (Test-Path (Join-Path $RepoRoot "dist\mcp\stdio-entry.js")) { Write-Host "  OK: stdio-entry.js mevcut" } else { Write-Host "  EKSIK: dist uretilmemis (npm run build)"; $ok = $false }

Write-Host "[verify] runtime dizinleri"
if (Test-Path $AppDataRoot) { Write-Host "  OK: $AppDataRoot" } else { Write-Host "  EKSIK: runtime dizini yok (install.ps1 calistirin)"; $ok = $false }

Write-Host "[verify] config"
$configPath = Join-Path $AppDataRoot "config\config.json"
if (Test-Path $configPath) { Write-Host "  OK: $configPath" } else { Write-Host "  EKSIK: config yok"; $ok = $false }

Write-Host "[verify] testler"
Push-Location $RepoRoot
try {
  & npm.cmd test 2>&1 | Select-Object -Last 4 | Write-Host
  if ($LASTEXITCODE -ne 0) { $ok = $false }
} finally {
  Pop-Location
}

if ($ok) { Write-Host "DOG RULAMA TAMAM"; exit 0 } else { Write-Host "DOG RULAMA EKSIKLERI VAR"; exit 1 }
