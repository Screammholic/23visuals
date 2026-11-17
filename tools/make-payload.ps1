# make-payload.ps1 - builds base.zip and client-<version>.zip for GitHub Releases.
# Run from the launcher repo:
#   .\tools\make-payload.ps1 -Version 0.3.1
param(
   [string]$Version = '0.3.1',
   [switch]$SkipBase
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$toolsDir = $PSScriptRoot
$launcherRoot = Split-Path $toolsDir -Parent
$projectRoot = Split-Path $launcherRoot -Parent
$clientDir = Join-Path $projectRoot 'client'
$distDir = Join-Path $launcherRoot 'dist'
$stageDir = Join-Path $distDir '.stage'

if (-not (Test-Path $clientDir)) {
   throw "Client folder not found: $clientDir"
}
New-Item -ItemType Directory -Force -Path $distDir | Out-Null
Remove-Item $stageDir -Recurse -Force -ErrorAction SilentlyContinue

function Invoke-Robocopy([string[]]$Arguments) {
   & robocopy @Arguments | Out-Null
   if ($LASTEXITCODE -ge 8) {
      throw "robocopy failed with code $LASTEXITCODE"
   }
}

function New-Zip([string]$SourceDir, [string]$ZipPath) {
   if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
   [System.IO.Compression.ZipFile]::CreateFromDirectory(
      $SourceDir, $ZipPath, [System.IO.Compression.CompressionLevel]::Optimal, $false
   )
}

$baseZip = Join-Path $distDir 'base.zip'
if (-not $SkipBase -or -not (Test-Path $baseZip)) {
   Write-Output '[..] Staging runtime (Java, assets, libraries, natives)'
   $baseStage = Join-Path $stageDir 'base'
   New-Item -ItemType Directory -Force -Path $baseStage | Out-Null
   Invoke-Robocopy @(
      (Join-Path $clientDir 'runtime'), (Join-Path $baseStage 'runtime'),
      '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/R:1', '/W:1'
   )
   Write-Output '[..] Packing base.zip'
   New-Zip $baseStage $baseZip
   Remove-Item $baseStage -Recurse -Force
} else {
   Write-Output '[--] base.zip already exists, skipping'
}

Write-Output '[..] Staging game payload'
$gameStage = Join-Path $stageDir 'client'
New-Item -ItemType Directory -Force -Path $gameStage | Out-Null

$excludeDirs = @(
   (Join-Path $clientDir 'game\saves'),
   (Join-Path $clientDir 'game\logs'),
   (Join-Path $clientDir 'game\downloads'),
   (Join-Path $clientDir 'game\.fabric'),
   (Join-Path $clientDir 'game\_IAS_ACCOUNTS_DO_NOT_SEND_TO_ANYONE'),
   (Join-Path $clientDir 'game\crash-reports'),
   (Join-Path $clientDir 'game\debug')
)
$excludeFiles = @(
   '23visuals-license.properties',
   '23visuals-license-session.json',
   'options.txt',
   'servers.dat',
   'servers.dat_old',
   'command_history.txt',
   'usercache.json'
)

$rc = @(
   (Join-Path $clientDir 'game'), (Join-Path $gameStage 'game'),
   '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/R:1', '/W:1'
)
if ($excludeDirs.Count -gt 0) { $rc += '/XD'; $rc += $excludeDirs }
if ($excludeFiles.Count -gt 0) { $rc += '/XF'; $rc += $excludeFiles }
Invoke-Robocopy $rc

$configDir = Join-Path $gameStage 'game\config'
New-Item -ItemType Directory -Force -Path $configDir | Out-Null
$hashPath = Join-Path $configDir '23visuals-build.sha256'
$hashValue = if (Test-Path $hashPath) { Get-Content $hashPath -Raw } else { '' }
Get-ChildItem $configDir -File -ErrorAction SilentlyContinue |
   Where-Object { $_.Name -ne '23visuals-build.sha256' } |
   Remove-Item -Force -ErrorAction SilentlyContinue
if ($hashValue.Trim()) {
   Set-Content -Path $hashPath -Value $hashValue.Trim() -Encoding ASCII
}

$clientZip = Join-Path $distDir "client-$Version.zip"
Write-Output '[..] Packing client.zip'
New-Zip $gameStage $clientZip
Remove-Item $gameStage -Recurse -Force
Remove-Item $stageDir -Recurse -Force -ErrorAction SilentlyContinue

$info = @()
foreach ($zip in @($baseZip, $clientZip)) {
   if (Test-Path $zip) {
      $item = Get-Item $zip
      $info += [pscustomobject]@{
         file = $item.Name
         size = $item.Length
         sha256 = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
      }
   }
}
$info | ConvertTo-Json -Depth 3 | Set-Content (Join-Path $distDir 'payload-info.json') -Encoding UTF8

Write-Output ''
$info | Format-Table -AutoSize
Write-Output ''
Write-Output 'Upload both files to the GitHub release:'
Write-Output "  https://github.com/Screammholic/23visuals/releases/new"
Write-Output "  tag: v$Version"