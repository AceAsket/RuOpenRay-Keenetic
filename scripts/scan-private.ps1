$ErrorActionPreference = 'Stop'

$patterns = @(
  'vless://(?!\.\.\.)',
  'vmess://(?!\.\.\.)',
  'trojan://(?!\.\.\.)',
  'ss://(?!\.\.\.)',
  'pbk=',
  'sid=',
  'flow=xtls-rprx-vision',
  'acespace\.tech'
)

$files = @()
$files += (& git ls-files)
$files += (& git ls-files --others --exclude-standard)
$files = $files |
  Where-Object { $_ -and (Test-Path $_) -and -not (Get-Item $_).PSIsContainer } |
  Where-Object { $_ -ne 'scripts/scan-private.ps1' } |
  Sort-Object -Unique

$hits = @()
foreach ($file in $files) {
  $text = Get-Content -Raw -ErrorAction SilentlyContinue -Path $file
  if ($null -eq $text) { continue }
  foreach ($pattern in $patterns) {
    if ($text -match $pattern) {
      $hits += [pscustomobject]@{ file = $file; pattern = $pattern }
    }
  }
}

if ($hits.Count) {
  $hits | Format-Table -AutoSize
  Write-Error "Private server material found in files that Git can see. Move it to .private/, .tmp-xray-tests/, data/, or another ignored path."
  exit 1
}

Write-Host "No private server material found in Git-visible files." -ForegroundColor Green
