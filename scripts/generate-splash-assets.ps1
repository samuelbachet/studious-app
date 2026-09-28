$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$fontPath = Join-Path $projectRoot 'assets\fonts\SourceSerif4-Variable.ttf'
$outputDirectory = Join-Path $projectRoot 'assets\splash'
$wordmark = 'Studious'

if (-not (Test-Path -LiteralPath $fontPath)) {
  throw "Font not found: $fontPath"
}

New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

$fontCollection = [System.Drawing.Text.PrivateFontCollection]::new()
$fontCollection.AddFontFile($fontPath)
$fontFamily = $fontCollection.Families[0]
if ($fontFamily.Name -ne 'Source Serif 4') {
  throw "Expected Source Serif 4, found $($fontFamily.Name)"
}

$font = [System.Drawing.Font]::new($fontFamily, 150, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$measureBitmap = [System.Drawing.Bitmap]::new(1, 1)
$measureGraphics = [System.Drawing.Graphics]::FromImage($measureBitmap)
$measured = $measureGraphics.MeasureString($wordmark, $font)
$width = [int][Math]::Ceiling($measured.Width + 120)
$height = [int][Math]::Ceiling($measured.Height + 80)
$measureGraphics.Dispose()
$measureBitmap.Dispose()

$format = [System.Drawing.StringFormat]::new()
$format.Alignment = [System.Drawing.StringAlignment]::Center
$format.LineAlignment = [System.Drawing.StringAlignment]::Center
$bounds = [System.Drawing.RectangleF]::new(0, 0, $width, $height)

foreach ($variant in @(
  @{ Name = 'light'; Color = '#20201D' },
  @{ Name = 'dark'; Color = '#F1E8DC' }
)) {
  $bitmap = [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $brush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml($variant.Color))
  $graphics.DrawString($wordmark, $font, $brush, $bounds, $format)
  $destination = Join-Path $outputDirectory "studious-splash-$($variant.Name).png"
  $bitmap.Save($destination, [System.Drawing.Imaging.ImageFormat]::Png)
  $brush.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
  Write-Output "$destination ($width x $height)"
}

$format.Dispose()
$font.Dispose()
$fontCollection.Dispose()
