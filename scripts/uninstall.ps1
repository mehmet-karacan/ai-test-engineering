#Requires -Version 5.1
# AI Test Engineering uninstall: yalniz urunun sahipligi bilinen girdilerini kaldirir.
# Kullanicinin diger OpenCode ayarlari, model, tool ve skill tanimlari korunur.

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$AppDataRoot = if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA "ai-test-engineering" } else { throw "LOCALAPPDATA cozumlenemedi" }
$OpencodeConfigPath = Join-Path $env:USERPROFILE ".config\opencode\opencode.json"

Write-Host "[uninstall] Bolum 1: OpenCode MCP girdisi (sadece ai-test-engineering)"
if (Test-Path $OpencodeConfigPath) {
  try {
    $config = Get-Content -Raw $OpencodeConfigPath | ConvertFrom-Json
    $mcp = $config.PSObject.Properties["mcp"]
    if ($mcp -and $null -ne $mcp.Value -and $mcp.Value.PSObject.Properties["ai-test-engineering"]) {
      $mcp.Value.PSObject.Properties.Remove("ai-test-engineering")
      $config | ConvertTo-Json -Depth 10 | Set-Content $OpencodeConfigPath -Encoding UTF8
      Write-Host "  OK: ai-test-engineering girdisi kaldirildi; diger ayarlar korundu"
    } else {
      Write-Host "  NOT: girdi zaten yok"
    }
  } catch {
    Write-Host "  UYARI: config parse edilemedi; elle kontrol edin: $OpencodeConfigPath"
  }
} else {
  Write-Host "  NOT: OpenCode config bulunamadi"
}

Write-Host "[uninstall] Bolum 2: runtime veri (kullanicinin onayi ile)"
if (Test-Path $AppDataRoot) {
  Write-Host "  Runtime veri: $AppDataRoot"
  Write-Host "  Bu dizin DB, blob, log ve config icerir. Silmek icin: Remove-Item -Recurse -Force `"$AppDataRoot`""
  Write-Host "  Guvenlik icin otomatik silinmez."
} else {
  Write-Host "  NOT: runtime dizini yok"
}

Write-Host "[uninstall] Bolum 3: build ciktilari (repo icinde)"
$distPath = Join-Path $RepoRoot "dist"
if (Test-Path $distPath) {
  Remove-Item -Recurse -Force $distPath
  Write-Host "  OK: dist kaldirildi"
}

Write-Host "UNINSTALL TAMAMLANDI (sahipligi bilinen girdiler)."
