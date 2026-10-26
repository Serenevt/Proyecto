function Get-FuelFlowDefaultPrinter {
  $names=@(Get-CimInstance Win32_Printer -ErrorAction Stop | Where-Object Default | Select-Object -ExpandProperty Name)
  if($names.Count -ne 1){throw 'No se pudo identificar una unica impresora predeterminada para conservarla.'}
  return [string]$names[0]
}
function Restore-FuelFlowDefaultPrinter {
  param([string]$OriginalName,[string]$TargetName,[scriptblock]$ReadDefault={Get-FuelFlowDefaultPrinter},[scriptblock]$SetDefault={
    param($name)
    $p=Get-CimInstance Win32_Printer -ErrorAction Stop | Where-Object Name -eq $name
    if(!$p){throw 'La seleccion original ya no existe; no se elige otra impresora.'}
    $result=Invoke-CimMethod -InputObject $p -MethodName SetDefaultPrinter -ErrorAction Stop
    if($result.ReturnValue -ne 0){throw 'Windows no permitio restaurar la seleccion original.'}
  })
  $current=& $ReadDefault
  $restored=$false
  # Undo only Windows selecting the just-used target. Never overwrite a third choice.
  if($OriginalName -and $OriginalName -ne $TargetName -and $current -eq $TargetName){
    & $SetDefault $OriginalName | Out-Null
    $current=& $ReadDefault
    if($current -ne $OriginalName){throw 'No se confirmo la restauracion de la impresora predeterminada.'}
    $restored=$true
  }
  return [pscustomobject]@{original=$OriginalName;after=$current;restored=$restored;preserved=($current -eq $OriginalName)}
}
Export-ModuleMember -Function Get-FuelFlowDefaultPrinter,Restore-FuelFlowDefaultPrinter
