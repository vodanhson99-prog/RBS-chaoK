param(
  [Parameter(Mandatory=$true)][string]$ImagePath,
  [Parameter(Mandatory=$true)][string]$PrinterName
)

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Drawing.Printing

$img = [System.Drawing.Image]::FromFile($ImagePath)
$doc = New-Object System.Drawing.Printing.PrintDocument
$doc.PrinterSettings.PrinterName = $PrinterName
$doc.DefaultPageSettings.Landscape = ($img.Width -gt $img.Height)
$doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0,0,0,0)

$printed = $false
$doc.add_PrintPage({
  param($sender, $e)
  if ($printed) { $e.HasMorePages = $false; return }
  $printed = $true
  $area = $e.PageBounds
  $scale = [Math]::Min($area.Width / $img.Width, $area.Height / $img.Height)
  $w = [int]($img.Width * $scale)
  $h = [int]($img.Height * $scale)
  $x = [int](($area.Width - $w) / 2)
  $y = [int](($area.Height - $h) / 2)
  $e.Graphics.DrawImage($img, $x, $y, $w, $h)
  $e.HasMorePages = $false
})

$doc.Print()
$img.Dispose()
$doc.Dispose()
Write-Output "OK"
