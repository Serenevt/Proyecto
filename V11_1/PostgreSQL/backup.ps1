$ErrorActionPreference = 'Stop'
if (-not $env:DATABASE_URL) { throw 'Define DATABASE_URL in the process environment' }
$backupPath = Join-Path $PSScriptRoot ('backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.dump')
& pg_dump --dbname=$env:DATABASE_URL --format=custom --file=$backupPath
if ($LASTEXITCODE -ne 0) { throw 'Backup failed' }
Write-Output $backupPath
