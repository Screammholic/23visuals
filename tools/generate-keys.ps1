# generate-keys.ps1 - creates launcher access keys and stores only their SHA-256 hashes.
# Plain keys are printed once and never saved.
param(
   [string]$Note = '',
   [int]$Count = 1
)

$ErrorActionPreference = 'Stop'
$docs = Join-Path (Split-Path $PSScriptRoot -Parent) 'docs'
$keysPath = Join-Path $docs 'keys.json'
New-Item -ItemType Directory -Force -Path $docs | Out-Null

$alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'.ToCharArray()
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()

function New-Key {
   $bytes = New-Object byte[] 20
   $rng.GetBytes($bytes)
   $chars = for ($i = 0; $i -lt 20; $i++) { $alphabet[$bytes[$i] % 32] }
   $raw = -join $chars
   return '23V-' + ($raw -replace '(.{4})(?!$)', '$1-')
}

function Hash-Key([string]$key) {
   $bytes = [Text.Encoding]::UTF8.GetBytes($key)
   $hash = [Security.Cryptography.SHA256]::Create().ComputeHash($bytes)
   return (($hash | ForEach-Object { $_.ToString('x2') }) -join '')
}

$doc = if (Test-Path $keysPath) {
   Get-Content $keysPath -Raw | ConvertFrom-Json
} else {
   [pscustomobject]@{ version = 1; keys = @() }
}
if ($null -eq $doc.keys) {
   $doc | Add-Member -NotePropertyName keys -NotePropertyValue @()
}

$issued = @()
for ($i = 0; $i -lt $Count; $i++) {
   $key = New-Key
   $hash = Hash-Key $key
   $doc.keys += [pscustomobject]@{
      hash = $hash
      prefix = $key.Substring(0, 8)
      note = $Note
      created = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
   }
   $issued += $key
}

[IO.File]::WriteAllText($keysPath, ($doc | ConvertTo-Json -Depth 5), (New-Object Text.UTF8Encoding($false)))

Write-Output '=== KEYS (show once) ==='
$issued | ForEach-Object { Write-Output $_ }
Write-Output ''
Write-Output "Hashes saved to: $keysPath"
Write-Output 'Commit and push docs/keys.json.'