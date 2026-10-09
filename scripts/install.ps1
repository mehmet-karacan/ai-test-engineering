#Requires -Version 5.1
# AI Test Engineering kurulumu: Windows.
# API key repoda veya kurulum ciktilarinda yazilmaz; OpenCode config merge/backup ile eklenir.

$ErrorActionPreference = "Stop"

# $PSScriptRoot EncodedCommand/pipe calistirmada bos kalabilir; repo kokunu garanti yoluna dus.
$scriptRoot = if ($PSScriptRoot) { $PSScriptRoot } elseif ($MyInvocation.MyCommand.Path) { Split-Path -Parent $MyInvocation.MyCommand.Path } else { (Get-Location).Path }
$leaf = Split-Path -Leaf $scriptRoot
if ($leaf -eq "scripts") { $RepoRoot = Split-Path -Parent $scriptRoot } else { $RepoRoot = $scriptRoot }
$AppDataRoot = if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA "ai-test-engineering" } else { throw "LOCALAPPDATA cozumlenemedi" }

function Test-Command($Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Write-Step($Message) {
  Write-Host "[kurulum] $Message"
}

Write-Step "Bolum 1: prerequisite kontrolu"
$prereqs = @()
if (-not (Test-Command "node")) { $prereqs += "Node.js 24+ bulunamadi" }
if (-not (Test-Command "git")) { $prereqs += "Git bulunamadi" }
if (-not (Test-Command "java")) { $prereqs += "Java (JDK) bulunamadi" }
if (-not (Test-Command "mvn") -and -not (Test-Command "mvn.cmd")) { $prereqs += "Maven bulunamadi (mvnw wrapper kabul edilir)" }
if ($prereqs.Count -gt 0) {
  foreach ($p in $prereqs) { Write-Host "  EKSIK: $p" }
  Write-Host "  BLOCKED: prerequisite'leri kurun ve tekrar calistirin."
  exit 2
}
$nodeVersion = (& node --version) -replace "v", ""
$nodeMajor = [int]($nodeVersion.Split(".")[0])
if ($nodeMajor -lt 24) {
  Write-Host "  BLOCKED: Node.js 24+ gerekli (bulunan: $nodeVersion)"
  exit 2
}
Write-Host "  OK: node $nodeVersion"

Write-Step "Bolum 2: urun yukleme"
Push-Location $RepoRoot
try {
  # PS 5.1'de native STDERR + ErrorActionPreference=Stop, "npm notice" ciktisini exception'a cevirir;
  # native komutlarda yerel olarak Continue kullanip exit kodla karar ver.
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $null = & npm.cmd install --no-fund --no-audit 2>&1
    if ($LASTEXITCODE -ne 0) { throw "npm install basarisiz (exit $LASTEXITCODE)" }
    $null = & npm.cmd run build 2>&1
    if ($LASTEXITCODE -ne 0) { throw "npm run build basarisiz (exit $LASTEXITCODE)" }
  } finally {
    $ErrorActionPreference = $prevEap
  }
} finally {
  Pop-Location
}
Write-Host "  OK: bagimliliklar kurulu, dist uretildi"

Write-Step "Bolum 3: runtime dizinleri"
New-Item -ItemType Directory -Force -Path $AppDataRoot | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $AppDataRoot "config") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $AppDataRoot "blobs") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $AppDataRoot "logs") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $AppDataRoot "backups") | Out-Null
Write-Host "  OK: $AppDataRoot"

Write-Step "Bolum 4: config dosyasi (yoksa olustur)"
$configPath = Join-Path $AppDataRoot "config\config.json"
if (-not (Test-Path $configPath)) {
  $config = @{
    schema_version = 1
    storage = @{ root = $AppDataRoot }
    coverage_defaults = @{ metrics = @("LINE", "BRANCH") }
    budgets = @{ max_candidate_iterations = 20; max_repairs_per_candidate = 2; no_progress_window = 3; total_job_minutes = 120 }
    worker_profiles = @()
    allowed_project_roots = @()
  } | ConvertTo-Json -Depth 5
  [System.IO.File]::WriteAllText($configPath, $config, (New-Object System.Text.UTF8Encoding $false))
  Write-Host "  OK: config olusturuldu ($configPath)"
} else {
  Write-Host "  OK: mevcut config korundu"
}

Write-Step "Bolum 5: OpenCode MCP baglantisi (merge, ezme yok)"
$opencodeConfigDir = Join-Path $env:USERPROFILE ".config\opencode"
$opencodeConfigPath = Join-Path $opencodeConfigDir "opencode.json"
New-Item -ItemType Directory -Force -Path $opencodeConfigDir | Out-Null

$backupPath = Join-Path $AppDataRoot ("backups\opencode-config-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".bak.json")
if (Test-Path $opencodeConfigPath) {
  Copy-Item $opencodeConfigPath $backupPath
  Write-Host "  OK: mevcut config yedeklendi ($backupPath)"
}

$entryJs = Join-Path $RepoRoot "dist\mcp\stdio-entry.js"
$serverEntry = @{
  type = "local"
  command = @((Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"), "-NoProfile", "-Command", "node `"$entryJs`"")
}
if (-not (Test-Command "node")) { throw "node bulunamadi" }
$serverEntry = @{ type = "local"; command = @("node", $entryJs) }

$merged = $false
if (Test-Path $opencodeConfigPath) {
  try {
    $existing = Get-Content -Raw $opencodeConfigPath | ConvertFrom-Json
    # mcp=null silici islem KALDIRILDI (D01/F02): mevcut mcp alanini okumadan ezme yok.
    $existingMcp = $existing.PSObject.Properties["mcp"]
    if (-not $existingMcp -or $null -eq $existingMcp.Value) {
      # mevcut mcp yoksa ekle (diger alanlar korunur)
      $existing | Add-Member -MemberType NoteProperty -Name mcp -Value (@{ "ai-test-engineering" = $serverEntry }) -Force
    } else {
      $mcpValue = $existingMcp.Value
      if (-not ($mcpValue.PSObject.Properties["ai-test-engineering"])) {
        $mcpValue | Add-Member -MemberType NoteProperty -Name "ai-test-engineering" -Value $serverEntry
      } else {
        $mcpValue."ai-test-engineering" = $serverEntry
      }
    }
    $existing | ConvertTo-Json -Depth 10 | ForEach-Object { [System.IO.File]::WriteAllText($opencodeConfigPath, $_, (New-Object System.Text.UTF8Encoding $false)) }
    $merged = $true
  } catch {
    Write-Host "  UYARI: mevcut config parse edilemedi; elle merge gerekiyor"
    Write-Host "  Manuel ekleyin: `"mcp`": { `"ai-test-engineering`": { `"type`": `"local`", `"command`": [`"node`", `"$entryJs`"] } }"
  }
} else {
  @{ mcp = @{ "ai-test-engineering" = $serverEntry } } | ConvertTo-Json -Depth 10 | ForEach-Object { [System.IO.File]::WriteAllText($opencodeConfigPath, $_, (New-Object System.Text.UTF8Encoding $false)) }
  $merged = $true
}
if ($merged) { Write-Host "  OK: OpenCode MCP baglantisi eklendi ($opencodeConfigPath)" }

Write-Step "Bolum 6: smoke dogrulama"
Push-Location $RepoRoot
try {
  $prevEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $smokeOutput = & npm.cmd test 2>&1
    $smokeExit = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $prevEap
  }
  $smokeOutput | Select-Object -Last 5 | ForEach-Object { Write-Host "$_" }
  if ($smokeExit -ne 0) { throw "smoke testler basarisiz (exit $smokeExit)" }
} finally {
  Pop-Location
}

Write-Host ""
Write-Host "KURULUM TAMAMLANDI."
Write-Host "Runtime veri: $AppDataRoot"
Write-Host "Kullanim: Java projesinde OpenCode'u acin, dogal dille hedefi soyleyin."
Write-Host "Not: API key bu kurulumla yazilmaz; model erisimi mevcut OpenCode provider ayarlarindan gelir."
