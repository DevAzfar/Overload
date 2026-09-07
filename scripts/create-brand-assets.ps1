$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $repositoryRoot "public\brand\overload-logo.png"

function Save-SquareAsset([int]$size, [string]$relativeOutputPath) {
  $source = [System.Drawing.Image]::FromFile($sourcePath)
  try {
    $bitmap = New-Object System.Drawing.Bitmap($size, $size)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.DrawImage($source, 0, 0, $size, $size)
      } finally {
        $graphics.Dispose()
      }
      $outputPath = Join-Path $repositoryRoot $relativeOutputPath
      $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally {
      $bitmap.Dispose()
    }
  } finally {
    $source.Dispose()
  }
}

Save-SquareAsset 32 "public\favicon-32.png"
Save-SquareAsset 180 "public\apple-touch-icon.png"
Save-SquareAsset 192 "public\icons\overload-192.png"
Save-SquareAsset 512 "public\icons\overload-512.png"

$source = [System.Drawing.Image]::FromFile($sourcePath)
try {
  $width = 1200
  $height = 630
  $canvas = New-Object System.Drawing.Bitmap($width, $height)
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($canvas)
    try {
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

      $background = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Point(0, 0)),
        (New-Object System.Drawing.Point($width, $height)),
        ([System.Drawing.Color]::FromArgb(255, 18, 19, 27)),
        ([System.Drawing.Color]::FromArgb(255, 42, 22, 63))
      )
      try { $graphics.FillRectangle($background, 0, 0, $width, $height) } finally { $background.Dispose() }

      $logoSize = 480
      $logoLeft = 70
      $logoTop = 75
      $logoRadius = 105
      $logoPath = New-Object System.Drawing.Drawing2D.GraphicsPath
      try {
        $diameter = $logoRadius * 2
        $logoPath.AddArc($logoLeft, $logoTop, $diameter, $diameter, 180, 90)
        $logoPath.AddArc($logoLeft + $logoSize - $diameter, $logoTop, $diameter, $diameter, 270, 90)
        $logoPath.AddArc($logoLeft + $logoSize - $diameter, $logoTop + $logoSize - $diameter, $diameter, $diameter, 0, 90)
        $logoPath.AddArc($logoLeft, $logoTop + $logoSize - $diameter, $diameter, $diameter, 90, 90)
        $logoPath.CloseFigure()
        $graphics.SetClip($logoPath)
        $graphics.DrawImage($source, $logoLeft, $logoTop, $logoSize, $logoSize)
        $graphics.ResetClip()
      } finally {
        $logoPath.Dispose()
      }

      $titleFont = New-Object System.Drawing.Font("Arial", 70, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
      $bodyFont = New-Object System.Drawing.Font("Arial", 28, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
      $eyebrowFont = New-Object System.Drawing.Font("Arial", 18, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
      $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 248, 248, 250))
      $muted = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 203, 198, 214))
      $violet = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 190, 125, 255))
      try {
        $graphics.DrawString("WORKOUT ANALYTICS", $eyebrowFont, $violet, 610, 185)
        $graphics.DrawString("OVERLOAD", $titleFont, $white, 602, 225)
        $graphics.DrawString("Training data, made useful.", $bodyFont, $muted, 610, 325)
        $graphics.DrawString("React | TypeScript | Local-first", $bodyFont, $muted, 610, 375)
      } finally {
        $titleFont.Dispose(); $bodyFont.Dispose(); $eyebrowFont.Dispose()
        $white.Dispose(); $muted.Dispose(); $violet.Dispose()
      }
    } finally {
      $graphics.Dispose()
    }
    $canvas.Save((Join-Path $repositoryRoot "public\og.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $canvas.Dispose()
  }
} finally {
  $source.Dispose()
}

Write-Output "Overload brand assets created from public/brand/overload-logo.png."
