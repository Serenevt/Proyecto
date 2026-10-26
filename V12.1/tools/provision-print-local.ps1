$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$agent=Join-Path $root 'PrintAgent'
$config=Join-Path $agent 'config.http.local.json'
if(Test-Path -LiteralPath $config){throw 'La configuracion HTTP ya existe. No se sobrescribio ningun archivo.'}
& node (Join-Path $agent 'configure.mjs') --printer 'PeriPage A6(1)' --origin 'http://localhost:26081' --origin 'http://127.0.0.1:26081' --out $config --confirm-a6
if($LASTEXITCODE -ne 0){throw 'El probe no permitio configurar el agente. No se imprimio.'}
Write-Output 'HTTP en 127.0.0.1:25443 preparado sin certificados ni cambios de confianza de Windows. No se imprimio.'
