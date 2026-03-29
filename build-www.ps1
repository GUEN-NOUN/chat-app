# =============================================================================
# build-www.ps1
#
# PURPOSE
#   Copies all web source files from the project root into the www/ output
#   directory, which Capacitor uses as its webDir.
#   After copying it runs `npx cap sync` (resolves plugins and copies www into
#   Android / iOS native asset folders) and `npx cap copy` (re-copies assets
#   without the plugin-resolution step, useful for quick iterations).
#
# USAGE
#   npm run build         â€” full build + sync
#   npx cap copy          â€” fast re-copy without plugin resolution
#   npx cap sync          â€” full plugin resolution + copy
# =============================================================================

$ErrorActionPreference = "Stop"   # treat any error as fatal

# â”€â”€ Enforce UTF-8 console output â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# On Windows PowerShell 5.x the console code page defaults to the system OEM
# code page (e.g. 850 or 1252).  Setting both OutputEncoding and
# [Console]::OutputEncoding to UTF-8-without-BOM ensures that any Arabic text
# written via Write-Host / Write-Output reaches the terminal correctly, and
# that any byte content piped through PowerShell is not re-encoded.
$utf8NoBomConsole = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $utf8NoBomConsole
$OutputEncoding           = $utf8NoBomConsole

$root = $PSScriptRoot
$www  = Join-Path $root "www"

# ── 0. Strip UTF-8 BOM from all source files ─────────────────────────────────
# A BOM (EF BB BF) at the start of any HTML/JS/CSS file causes Android WebView
# to mis-decode Arabic bytes as "????" because it disrupts encoding detection
# before the <meta charset="UTF-8"> is parsed.  This step runs first, before
# www/ is populated, so every file copied below is guaranteed BOM-free.
Write-Host "==> [Step 0] Stripping UTF-8 BOM from source files..." -ForegroundColor Cyan
$stripScript = Join-Path $root "strip-bom.ps1"
if (Test-Path $stripScript) {
    & $stripScript
} else {
    Write-Host "    (strip-bom.ps1 not found - skipping BOM removal)" -ForegroundColor DarkYellow
}

# â”€â”€ 1. Recreate www/ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# FIX: always start clean so stale files never confuse Capacitor.
Write-Host "==> Cleaning www/ ..." -ForegroundColor Cyan
if (Test-Path $www) { Remove-Item -Recurse -Force $www }
New-Item -ItemType Directory -Path $www | Out-Null

# ── 2. Build React chat SPA → www/chat/ ─────────────────────────────────────
# The React Vite app in client/ builds directly into www/chat/.
# This step MUST run after cleaning www/ so the output lands in the fresh folder.
Write-Host "==> Building React chat SPA (client/) ..." -ForegroundColor Cyan
$clientDir = Join-Path $root "client"
if (Test-Path $clientDir) {
    Push-Location $clientDir
    npm run build
    Pop-Location
    Write-Host "    React SPA built → www/chat/" -ForegroundColor DarkGreen
} else {
    Write-Host "    (client/ not found — skipping React build)" -ForegroundColor DarkYellow
}

# ── 3. Copy HTML source files ────────────────────────────────────────────────
# FIX: every *.html at the repo root is a page of the app.
#      index.html becomes www/index.html — that is what Capacitor (and GitHub
#      Pages via the gh-pages branch) serves as the entry point.
Write-Host "==> Copying HTML files ..." -ForegroundColor Cyan
Get-ChildItem -Path $root -Filter "*.html" -File | ForEach-Object {
    Copy-Item $_.FullName -Destination $www
}

# â”€â”€ 3. Copy asset folders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# FIX: create the destination sub-folders explicitly so the copy never fails
#      with ENOENT even if a source folder is temporarily empty.
Write-Host "==> Copying css/ js/ assets/ ..." -ForegroundColor Cyan
foreach ($folder in @("css", "js", "assets")) {
    $src = Join-Path $root $folder
    $dst = Join-Path $www $folder
    if (Test-Path $src) {
        # -Force creates the destination tree automatically
        Copy-Item -Recurse -Force $src -Destination $www
    } else {
        # FIX: guarantee the folder exists in www/ even when empty,
        #      preventing ENOENT during cap sync / cap copy.
        New-Item -ItemType Directory -Path $dst -Force | Out-Null
        Write-Host "    (created empty $folder/ placeholder)" -ForegroundColor DarkYellow
    }
}

# â”€â”€ 4. Copy service-worker & version manifest â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Host "==> Copying sw.js & version.json ..." -ForegroundColor Cyan
foreach ($file in @("sw.js", "version.json")) {
    $src = Join-Path $root $file
    if (Test-Path $src) {
        Copy-Item $src -Destination $www
    }
}

# â”€â”€ 5. Add .nojekyll â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# FIX: GitHub Pages runs Jekyll by default, which ignores files/folders that
#      start with an underscore (e.g. _capacitor*, _app*).
#      An empty .nojekyll file at the root of the deployed folder disables
#      Jekyll so every file is served as-is.
$nojekyll = Join-Path $www ".nojekyll"
if (-not (Test-Path $nojekyll)) {
    New-Item -ItemType File -Path $nojekyll | Out-Null
    Write-Host "==> Created www/.nojekyll (disables Jekyll on GitHub Pages)" -ForegroundColor Cyan
}

# â”€â”€ 6. Guarantee Android assets directory structure â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# FIX: `npx cap sync` writes into android/app/src/main/assets/public/.
#      If that path doesn't exist the sync throws ENOENT and aborts.
#      We create the full tree here so the first-ever sync always succeeds.
$androidAssets = Join-Path $root "android\app\src\main\assets"
$androidPublic  = Join-Path $androidAssets "public"
foreach ($dir in @($androidAssets, $androidPublic)) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "==> Created $dir" -ForegroundColor Cyan
    }
}

# â”€â”€ 7. Guarantee capacitor.plugins.json stub â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# FIX: Capacitor reads android/app/src/main/assets/capacitor.plugins.json
#      before it has a chance to generate it on a fresh clone, causing ENOENT.
#      We seed an empty-array stub; `npx cap sync` will overwrite it with the
#      real plugin list.
#
#      ENCODING NOTE: We use [System.IO.File]::WriteAllText with an explicit
#      UTF-8-without-BOM encoder instead of Set-Content -Encoding UTF8.
#      On Windows PowerShell 5.x, `Set-Content -Encoding UTF8` produces a
#      UTF-8 WITH BOM file (EF BB BF prefix).  A BOM inside a JSON file is
#      harmless for this ASCII-only stub, but the pattern is wrong: if this
#      line ever wrote a file consumed by the WebView or a JSON parser that
#      does not strip the BOM, it would cause a parse error or encoding
#      mismatch.  The explicit encoder is safe on all PowerShell versions.
$pluginsJson = Join-Path $androidAssets "capacitor.plugins.json"
if (-not (Test-Path $pluginsJson)) {
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false   # $false = no BOM
    [System.IO.File]::WriteAllText($pluginsJson, '[]', $utf8NoBom)
    Write-Host "==> Created stub $pluginsJson (cap sync will populate it)" -ForegroundColor Cyan
}

# â”€â”€ 8. Run Capacitor sync â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# cap sync = cap copy + plugin resolution.
# This copies www/ into every registered native platform and regenerates
# capacitor.plugins.json with the real plugin list.
Write-Host ""
Write-Host "==> www/ is ready. Running: npx cap sync" -ForegroundColor Green
Set-Location $root
npx cap sync

# â”€â”€ 9. Run Capacitor copy (fast path for subsequent runs) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# cap copy alone skips plugin resolution â€” useful when only web assets changed.
Write-Host ""
Write-Host "==> Running: npx cap copy" -ForegroundColor Green
npx cap copy

Write-Host ""
Write-Host "==> Build complete." -ForegroundColor Green
Write-Host "    Android : npx cap open android" -ForegroundColor White
Write-Host "    iOS     : npx cap open ios" -ForegroundColor White
Write-Host "    Deploy  : npm run deploy  (pushes www/ to gh-pages branch)" -ForegroundColor White

# â”€â”€ 10. Encoding integrity verification â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Run the byte-level audit immediately after the build to confirm that
# www/ and android assets are identical and contain their Arabic content.
Write-Host ""
Write-Host "==> Running encoding integrity check ..." -ForegroundColor Cyan
$verifyScript = Join-Path $root "verify-encoding.ps1"
if (Test-Path $verifyScript) {
    & $verifyScript
} else {
    Write-Host "    (verify-encoding.ps1 not found - skipping check)" -ForegroundColor DarkYellow
}
