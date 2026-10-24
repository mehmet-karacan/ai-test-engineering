#Requires -Version 5.1
# Uyumluluk girisi: standart Windows CMD + Node.js akisina yonlendirir.
$ErrorActionPreference = "Stop"
$entry = Join-Path $PSScriptRoot "uninstall.mjs"
& node $entry @args
exit $LASTEXITCODE
