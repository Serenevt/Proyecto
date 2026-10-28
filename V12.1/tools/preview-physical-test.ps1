param([Parameter(Mandatory=$true)][string]$FixturePath,[Parameter(Mandatory=$true)][string]$OutputPath)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$root=Split-Path -Parent $PSScriptRoot
Add-Type -Path (Join-Path $root 'PrintAgent\ThermalLayout.cs') -ReferencedAssemblies System.Drawing,System.Web.Extensions
$fixture=Get-Content -LiteralPath $FixturePath -Raw -Encoding UTF8 | ConvertFrom-Json
$json=$fixture.receipt | ConvertTo-Json -Compress -Depth 6
$config=Get-Content -LiteralPath (Join-Path $root 'PrintAgent\config.http.local.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$plan=[FuelFlow.ThermalLayout]::Preview($json,$OutputPath,[single]$config.printableWidthMm,[single]$config.printableLeftMm,203)
$plan | ConvertTo-Json -Depth 7 -Compress
