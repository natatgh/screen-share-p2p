param(
  [string]$Source = (Join-Path $PSScriptRoot '..\assets\lumen-icon.png'),
  [string]$Destination = (Join-Path $PSScriptRoot '..\assets\lumen-icon.ico')
)

Add-Type -AssemblyName System.Drawing

$image = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $Source).Path)
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$frames = [System.Collections.Generic.List[byte[]]]::new()

try {
  foreach ($size in $sizes) {
    $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $memory = [System.IO.MemoryStream]::new()
    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.DrawImage($image, 0, 0, $size, $size)
      $bitmap.Save($memory, [System.Drawing.Imaging.ImageFormat]::Png)
      $frames.Add($memory.ToArray())
    } finally {
      $memory.Dispose()
      $graphics.Dispose()
      $bitmap.Dispose()
    }
  }
} finally {
  $image.Dispose()
}

$output = [System.IO.File]::Create($Destination)
$writer = [System.IO.BinaryWriter]::new($output)
try {
  $writer.Write([uint16]0)
  $writer.Write([uint16]1)
  $writer.Write([uint16]$sizes.Count)
  $offset = 6 + 16 * $sizes.Count
  for ($index = 0; $index -lt $sizes.Count; $index++) {
    $size = $sizes[$index]
    $writer.Write([byte]($size % 256))
    $writer.Write([byte]($size % 256))
    $writer.Write([byte]0)
    $writer.Write([byte]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]32)
    $writer.Write([uint32]$frames[$index].Length)
    $writer.Write([uint32]$offset)
    $offset += $frames[$index].Length
  }
  foreach ($frame in $frames) { $writer.Write($frame) }
} finally {
  $writer.Dispose()
}
