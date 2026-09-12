[CmdletBinding()]
param(
  [string]$SourceDirectory = 'C:\Users\Administrator\Desktop\超影系列备份'
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$destinationDir = Join-Path $repoRoot 'apps\web\public\media\super-shadow'
$maxBytes = 100 * 1024 * 1024
$expectedFiles = 1..9 | ForEach-Object { "$_.mp4" }

if (-not (Test-Path -LiteralPath $SourceDirectory -PathType Container)) {
  throw "Source directory not found: $SourceDirectory"
}

$missingFiles = @()
foreach ($fileName in $expectedFiles) {
  $source = Join-Path $SourceDirectory $fileName
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    $missingFiles += $fileName
  }
}

if ($missingFiles.Count -gt 0) {
  throw "Missing source files: $($missingFiles -join ', ')"
}

New-Item -ItemType Directory -Force -Path $destinationDir | Out-Null

foreach ($fileName in $expectedFiles) {
  $source = Join-Path $SourceDirectory $fileName
  $item = Get-Item -LiteralPath $source

  if ($item.Length -ge $maxBytes) {
    throw "Source file exceeds the 100 MB limit: $source ($($item.Length) bytes)"
  }

  $destination = Join-Path $destinationDir $fileName
  Copy-Item -LiteralPath $source -Destination $destination -Force
  Write-Host "$source -> $destination"
}

Write-Host "Copied $($expectedFiles.Count) course videos to $destinationDir"
