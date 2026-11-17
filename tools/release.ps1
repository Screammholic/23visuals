# release.ps1 - creates a GitHub release with payload files.
# Requires: gh auth login
param(
   [Parameter(Mandatory = $true)] [string]$Version,
   [string]$Notes = '',
   [string]$Repo = 'Screammholic/23visuals'
)

$ErrorActionPreference = 'Stop'
$dist = Join-Path (Split-Path $PSScriptRoot -Parent) 'dist'
$files = @(
   (Join-Path $dist 'base.zip'),
   (Join-Path $dist "client-$Version.zip")
) | Where-Object { Test-Path $_ }

if ($files.Count -lt 2) {
   throw "Payload files not found in $dist. Run tools\make-payload.ps1 first."
}

$args = @('release', 'create', "v$Version") + $files + @('--repo', $Repo, '--title', "23Visuals $Version")
if ($Notes) { $args += @('--notes', $Notes) } else { $args += @('--generate-notes') }
$args += '--latest'

& gh @args
if ($LASTEXITCODE -ne 0) { throw "gh release failed with code $LASTEXITCODE" }

Write-Output "[OK] Release v$Version published"
Write-Output "Update docs/version.json: version=$Version release=v$Version client=client-$Version.zip"