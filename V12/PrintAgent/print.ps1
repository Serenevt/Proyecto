param([Parameter(Mandatory=$true)][string]$InputPath)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$started=$false;$doc=$null;$measurement=$null;$originalDefault=$null;$reply=$null
try {
  Import-Module (Join-Path $PSScriptRoot 'print-state.psm1') -Force
  Add-Type -AssemblyName System.Drawing
  Add-Type -Path (Join-Path $PSScriptRoot 'ThermalLayout.cs') -ReferencedAssemblies System.Drawing,System.Web.Extensions
  $inputData=Get-Content -LiteralPath $InputPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $cfg=$inputData.config
  if($cfg.paperWidthHundredths -ne 224 -or $cfg.paperHeightHundredths -ne 394 -or $cfg.formatConfirmed -ne $true){throw 'Configura y confirma el formato fijo de 100 mm; no se imprimio.'}
  $queue=Get-Printer -Name $cfg.printerName
  if($queue.Name -cne $cfg.printerName -or $queue.DriverName -cne $cfg.driverName -or $queue.PortName -cne $cfg.portName -or $queue.PortName -notmatch '^USB[0-9]+$'){throw 'La cola, driver o puerto USB no coincide con la A6 configurada.'}
  if($queue.PrinterStatus -ne 'Normal'){throw 'Impresora no disponible; revisa conexion USB, papel y cola.'}
  $originalDefault=Get-FuelFlowDefaultPrinter
  $doc=New-Object System.Drawing.Printing.PrintDocument
  $doc.PrinterSettings.PrinterName=$cfg.printerName
  if(!$doc.PrinterSettings.IsValid){throw 'La impresora configurada no es valida.'}
  $doc.PrintController=New-Object System.Drawing.Printing.StandardPrintController
  $doc.DocumentName=$inputData.job.id
  $doc.PrinterSettings.Copies=1
  $doc.OriginAtMargins=$false
  $page=$doc.DefaultPageSettings
  $page.Landscape=$false;$page.Color=$false
  $page.Margins=New-Object System.Drawing.Printing.Margins(0,0,0,0)
  $page.PaperSize=New-Object System.Drawing.Printing.PaperSize('FuelFlow 57x100mm',224,394)
  function Assert-Geometry($settings) {
    $a=$settings.PrintableArea
    if([Math]::Abs($settings.PaperSize.Width-224) -gt 1 -or [Math]::Abs($settings.PaperSize.Height-394) -gt 1){throw 'El driver rechazo el formato fijo de 100 mm.'}
    if([Math]::Abs($a.Width*0.254-$cfg.printableWidthMm) -gt 0.6 -or [Math]::Abs($a.Height*0.254-$cfg.printableHeightMm) -gt 0.6 -or [Math]::Abs($a.X*0.254-$cfg.printableLeftMm) -gt 0.6 -or [Math]::Abs($a.Y*0.254-$cfg.printableTopMm) -gt 0.6){throw 'Cambio el area imprimible del formato de 100 mm. Repite el probe; no se imprimio.'}
  }
  Assert-Geometry $page
  $receiptJson=$inputData.job.receipt | ConvertTo-Json -Depth 6 -Compress
  $measurement=$doc.PrinterSettings.CreateMeasurementGraphics($page)
  if($cfg.dpi -ne 203 -or $measurement.DpiX -ne 203 -or $measurement.DpiY -ne 203){throw 'Resolucion distinta de 203 DPI; no se imprimio.'}
  $a=$page.PrintableArea
  $bounds=New-Object System.Drawing.RectangleF(($a.X*0.254),($a.Y*0.254),($a.Width*0.254),($a.Height*0.254))
  $paper=New-Object System.Drawing.SizeF(($page.PaperSize.Width*0.254),($page.PaperSize.Height*0.254))
  $plan=[FuelFlow.ThermalLayout]::Build($receiptJson,$measurement,$bounds,$paper)
  $layout=@{requiredHeightMm=[Math]::Round($plan.RequiredHeightMm,2);renderedHeightMm=[Math]::Round($plan.RenderedHeightMm,2);availableHeightMm=[Math]::Round($plan.AvailableHeightMm,2);pages=1;paperHeightMm=$paper.Height}
  if(!$plan.Fits){throw ('El comprobante excede el formato de 100 mm: requiere '+$layout.requiredHeightMm+' mm de contenido y dispone de '+$layout.availableHeightMm+' mm. No se imprimio ni se dividio en paginas.')}
  # Repeat checks on actual print graphics; errors after Print() are UNKNOWN.
  $script:renderError=$null
  $doc.add_QueryPageSettings({param($sender,$e) try{Assert-Geometry $e.PageSettings}catch{$script:renderError=$_.Exception.Message;$e.Cancel=$true}})
  $doc.add_PrintPage({
    param($sender,$e)
    try {
      Assert-Geometry $e.PageSettings
      if($e.Graphics.DpiX -ne 203 -or $e.Graphics.DpiY -ne 203){throw 'El driver cambio la resolucion de 203 DPI; revisar cola.'}
      $actual=$e.PageSettings.PrintableArea
      $rect=New-Object System.Drawing.RectangleF(($actual.X*0.254),($actual.Y*0.254),($actual.Width*0.254),($actual.Height*0.254))
      $size=New-Object System.Drawing.SizeF(($e.PageSettings.PaperSize.Width*0.254),($e.PageSettings.PaperSize.Height*0.254))
      $actualPlan=[FuelFlow.ThermalLayout]::Build($receiptJson,$e.Graphics,$rect,$size)
      if(!$actualPlan.Fits){throw 'La medicion del driver al imprimir excede 100 mm; trabajo cancelado, revisar cola.'}
      $e.Graphics.PageUnit=[System.Drawing.GraphicsUnit]::Millimeter
      $e.Graphics.TranslateTransform((-$e.PageSettings.HardMarginX*0.254),(-$e.PageSettings.HardMarginY*0.254))
      [FuelFlow.ThermalLayout]::Draw($actualPlan,$e.Graphics)
      $e.HasMorePages=$false
    }catch{$script:renderError=$_.Exception.Message;$e.Cancel=$true;$e.HasMorePages=$false}
  })
  $started=$true
  $doc.Print()
  if($script:renderError){throw $script:renderError}
  $reply=@{status='accepted';physicalConfirmed=$false;layout=$layout}
} catch {
  $reply=@{status=$(if($started){'unknown'}else{'retryable'});error=$_.Exception.Message;physicalConfirmed=$false;layout=$layout}
} finally {
  if($measurement){$measurement.Dispose()};if($doc){$doc.Dispose()}
  if($originalDefault){
    try{$reply.printerState=Restore-FuelFlowDefaultPrinter -OriginalName $originalDefault -TargetName $cfg.printerName}
    catch{$reply.printerState=@{original=$originalDefault;preserved=$false;warning=$_.Exception.Message}}
  }
}
$reply | ConvertTo-Json -Compress -Depth 5
