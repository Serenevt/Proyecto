param([Parameter(Mandatory=$true)][string]$PrinterName)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Drawing
$queue=Get-Printer -Name $PrinterName
$doc=New-Object System.Drawing.Printing.PrintDocument
$measurement=$null
try {
  $doc.PrinterSettings.PrinterName=$PrinterName
  if(!$doc.PrinterSettings.IsValid){throw 'Cola invalida'}
  $page=$doc.DefaultPageSettings
  $page.Landscape=$false
  $before=$page.PrintableArea
  $defaultPaper=$page.PaperSize
  $page.Margins=New-Object System.Drawing.Printing.Margins(0,0,0,0)
  # Both dimensions are hundredths of an inch. 394 is ~100.076 mm.
  $page.PaperSize=New-Object System.Drawing.Printing.PaperSize('FuelFlow 57x100mm',224,394)
  $area=$page.PrintableArea
  $measurement=$doc.PrinterSettings.CreateMeasurementGraphics($page)
  [ordered]@{
    printerName=$queue.Name;driverName=$queue.DriverName;port=$queue.PortName;status=[string]$queue.PrinterStatus
    defaultPaperWidthMm=$defaultPaper.Width*0.254;defaultPaperHeightMm=$defaultPaper.Height*0.254;defaultPrintableWidthMm=$before.Width*0.254
    paperWidthMm=$page.PaperSize.Width*0.254;paperHeightMm=$page.PaperSize.Height*0.254
    printableWidthMm=$area.Width*0.254;printableHeightMm=$area.Height*0.254;printableLeftMm=$area.X*0.254;printableTopMm=$area.Y*0.254
    hardMarginXmm=$page.HardMarginX*0.254;hardMarginYmm=$page.HardMarginY*0.254
    dpiX=$measurement.DpiX;dpiY=$measurement.DpiY
    physicalLengthConfirmed=$false
  } | ConvertTo-Json
} finally {if($measurement){$measurement.Dispose()};$doc.Dispose()}
