param([Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$fioRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$fioDestination = [IO.Path]::GetFullPath($Destination)
if ([IO.Path]::GetExtension($fioDestination) -ne '.zip') { throw 'Destination must be a ZIP file.' }
if (Test-Path -LiteralPath $fioDestination) { throw 'Destination already exists; choose a new file.' }
$fioExcluded = @('node_modules','.npm-cache','.git','.vercel','work','dist','dist-server','test-results','playwright-report','.temp','.branches','.package-stage')
function Get-FioFiles([string]$Directory) {
 foreach ($fioItem in Get-ChildItem -LiteralPath $Directory -Force) {
  if (($fioItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Symlink/reparse point is not permitted in the distribution.' }
  if ($fioItem.PSIsContainer) {
   if ($fioItem.Name -notin $fioExcluded) { Get-FioFiles $fioItem.FullName }
  } elseif ($fioItem.Name -notlike '*.zip' -and $fioItem.Name -notlike '*.sha256' -and $fioItem.Name -notlike '*.log' -and ($fioItem.Name -notlike '.env*' -or $fioItem.Name -eq '.env.example')) { $fioItem }
 }
}
$fioFiles = @(Get-FioFiles $fioRoot)
[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($fioDestination)) | Out-Null
$fioArchive = [IO.Compression.ZipFile]::Open($fioDestination,[IO.Compression.ZipArchiveMode]::Create)
try {
 foreach ($fioFile in $fioFiles) {
  $fioRelative = $fioFile.FullName.Substring($fioRoot.Length + 1).Replace('\','/')
  [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($fioArchive,$fioFile.FullName,('fio-saas-v2/' + $fioRelative),[IO.Compression.CompressionLevel]::Optimal) | Out-Null
 }
} finally { $fioArchive.Dispose() }
# Read every entry and compare its decompressed content against the source.
$fioArchive = [IO.Compression.ZipFile]::OpenRead($fioDestination)
try {
 if ($fioArchive.Entries.Count -ne $fioFiles.Count) { throw 'ZIP entry count mismatch.' }
 foreach ($fioEntry in $fioArchive.Entries) {
  if (-not $fioEntry.FullName.StartsWith('fio-saas-v2/') -or ($fioEntry.FullName -split '/') -contains '..') { throw 'Invalid archive entry.' }
  $fioRelative = $fioEntry.FullName.Substring(12)
  $fioSource = Join-Path $fioRoot $fioRelative
  $fioHasher = [Security.Cryptography.SHA256]::Create()
  $fioStream = $fioEntry.Open()
  try { $fioHash = [BitConverter]::ToString($fioHasher.ComputeHash($fioStream)).Replace('-','') }
  finally { $fioStream.Dispose(); $fioHasher.Dispose() }
  if ($fioHash -ne (Get-FileHash -LiteralPath $fioSource -Algorithm SHA256).Hash) { throw ('ZIP content mismatch: '+$fioRelative) }
 }
} finally { $fioArchive.Dispose() }
$fioFinalHash=(Get-FileHash -LiteralPath $fioDestination -Algorithm SHA256).Hash
[IO.File]::WriteAllText(($fioDestination+'.sha256'),($fioFinalHash+'  '+[IO.Path]::GetFileName($fioDestination)+[Environment]::NewLine))
Write-Output ([pscustomobject]@{File=$fioDestination;Entries=$fioFiles.Count;Bytes=(Get-Item -LiteralPath $fioDestination).Length;SHA256=$fioFinalHash;Verified=$true}|ConvertTo-Json)
