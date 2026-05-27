$root = Split-Path -Parent $PSScriptRoot

$exclude = @(
  'packages\ui\src\brand\Logo.tsx',
  'scripts\rebrand-to-wtf.ps1',
  'pnpm-lock.yaml',
  '.next',
  'node_modules',
  '.git',
  'apps\worker\dist'
)

function ShouldSkip([string]$path) {
  foreach ($ex in $exclude) {
    if ($path -like "*$ex*") { return $true }
  }
  return $false
}

$candidates = Get-ChildItem -Path $root -Recurse -File `
  -Include *.ts,*.tsx,*.js,*.jsx,*.mjs,*.md,*.mdx,*.json,*.yml,*.yaml,*.sh,*.bat,*.example,Caddyfile `
  -ErrorAction SilentlyContinue |
  Where-Object { -not (ShouldSkip $_.FullName) }

$changed = 0
foreach ($file in $candidates) {
  $content = Get-Content -Raw -LiteralPath $file.FullName
  if ($null -eq $content) { continue }

  $new = $content `
    -creplace 'TORUS\.FM','TORUS.WTF' `
    -creplace 'Torus\.FM','Torus.WTF' `
    -creplace 'Torus\.fm','Torus.wtf' `
    -creplace 'torus\.fm','torus.wtf'

  if ($new -ne $content) {
    Set-Content -LiteralPath $file.FullName -Value $new -NoNewline
    Write-Host "rewrote $($file.FullName.Substring($root.Length+1))"
    $changed++
  }
}

Write-Host ""
Write-Host "Done. Updated $changed files."
