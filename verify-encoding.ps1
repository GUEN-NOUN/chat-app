# =============================================================================
# verify-encoding.ps1
#
# PURPOSE
#   Byte-level encoding audit for the Capacitor build pipeline.
#
#   Checks three things:
#     1. Every file in www/ is byte-for-byte identical to its counterpart in
#        android/app/src/main/assets/public/.  A mismatch means cap sync/copy
#        did not finish, or something mutated the Android assets after the sync.
#
#     2. Web source files (HTML, JS, CSS) in www/ contain Arabic UTF-8 byte
#        sequences (0xD8 xx or 0xD9 xx lead bytes) and that those counts match
#        the android assets exactly.
#
#     3. No web source files start with a UTF-8 BOM (EF BB BF).  A BOM in
#        HTML/JS/CSS can cause parse errors or mis-detection on some WebViews.
#
# USAGE
#   npm run verify                     # informational (non-zero exit on error)
#   npm run build:verify               # build then verify in one step
#   powershell -File verify-encoding.ps1 -Strict   # CI: exits 1 on any issue
#
# PARAMETERS
#   -Strict   If set, the script exits with code 1 when any check fails.
#             Without -Strict it prints warnings but exits 0.
# =============================================================================

param(
    [switch]$Strict
)

$ErrorActionPreference = "Stop"

$root          = $PSScriptRoot
$www           = Join-Path $root "www"
$androidPublic = Join-Path $root "android\app\src\main\assets\public"

$issues  = 0
$checked = 0

# â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function Write-Ok   { param($msg) Write-Host "  [OK]  $msg" -ForegroundColor Green  }
function Write-Warn { param($msg) Write-Host "  [WARN] $msg" -ForegroundColor Yellow; $script:issues++ }
function Write-Fail { param($msg) Write-Host "  [FAIL] $msg" -ForegroundColor Red;    $script:issues++ }
function Write-Info { param($msg) Write-Host "        $msg" -ForegroundColor Gray   }

# â”€â”€ 1. File-by-file byte comparison: www/ vs android assets â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Host ""
Write-Host "==> [1/3] Comparing www/ vs android assets byte-by-byte ..." -ForegroundColor Cyan

if (-not (Test-Path $www)) {
    Write-Fail "www/ does not exist â€” run 'npm run build' first."
} elseif (-not (Test-Path $androidPublic)) {
    Write-Fail "android assets directory does not exist: $androidPublic"
} else {
    Get-ChildItem -Path $www -Recurse -File | ForEach-Object {
        $relPath     = $_.FullName.Substring($www.Length).TrimStart('\', '/')
        $androidFile = Join-Path $androidPublic $relPath

        $checked++

        if (-not (Test-Path $androidFile)) {
            Write-Warn "Missing in android assets: $relPath"
            return
        }

        $wwwBytes     = [System.IO.File]::ReadAllBytes($_.FullName)
        $androidBytes = [System.IO.File]::ReadAllBytes($androidFile)

        if ($wwwBytes.Length -ne $androidBytes.Length) {
            Write-Fail "Size mismatch: $relPath  (www=$($wwwBytes.Length) android=$($androidBytes.Length))"
            return
        }

        for ($i = 0; $i -lt $wwwBytes.Length; $i++) {
            if ($wwwBytes[$i] -ne $androidBytes[$i]) {
                Write-Fail "Byte mismatch at offset $i in: $relPath"
                return
            }
        }

        # File is identical â€” only print for text files to keep output readable
        if ($_.Extension -match '\.(html|htm|js|mjs|css|json)$') {
            Write-Ok "$relPath ($($wwwBytes.Length) bytes, identical)"
        }
    }
}

Write-Info "Checked $checked file(s)."

# â”€â”€ 2. Arabic UTF-8 byte count: www/ vs android assets â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Host ""
Write-Host "==> [2/3] Counting Arabic UTF-8 marker bytes (0xD8/0xD9) ..." -ForegroundColor Cyan

$webExtensions = @('.html', '.htm', '.js', '.mjs', '.css')

function Count-ArabicBytes {
    param([string]$Directory)
    $total = 0
    if (-not (Test-Path $Directory)) { return $total }
    Get-ChildItem -Path $Directory -Recurse -File |
        Where-Object { $webExtensions -contains $_.Extension.ToLower() } |
        ForEach-Object {
            $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
            foreach ($b in $bytes) {
                if ($b -eq 0xD8 -or $b -eq 0xD9) { $total++ }
            }
        }
    return $total
}

$wwwArabic     = Count-ArabicBytes $www
$androidArabic = Count-ArabicBytes $androidPublic

Write-Info "www/          Arabic bytes: $wwwArabic"
Write-Info "android/      Arabic bytes: $androidArabic"

if ($wwwArabic -eq 0) {
    Write-Warn "www/ has 0 Arabic bytes â€” did sources lose their Arabic content?"
} elseif ($wwwArabic -eq $androidArabic) {
    Write-Ok "Arabic byte counts match: $wwwArabic"
} else {
    Write-Fail "Arabic byte count mismatch: www=$wwwArabic android=$androidArabic"
}

# â”€â”€ 3. BOM detection in web source files â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Host ""
Write-Host "==> [3/3] Checking for UTF-8 BOM (EF BB BF) in web files ..." -ForegroundColor Cyan

$bom = [byte[]]@(0xEF, 0xBB, 0xBF)

Get-ChildItem -Path $www -Recurse -File |
    Where-Object { $webExtensions -contains $_.Extension.ToLower() } |
    ForEach-Object {
        $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
        if ($bytes.Length -ge 3 -and
            $bytes[0] -eq $bom[0] -and $bytes[1] -eq $bom[1] -and $bytes[2] -eq $bom[2]) {
            $relPath = $_.FullName.Substring($www.Length).TrimStart('\', '/')
            Write-Fail "BOM found: $relPath  â€” remove with: (Get-Content file | Set-Content file -Encoding UTF8NoBOM)"
        }
    }

if ($issues -eq 0) {
    Write-Host ""
    Write-Host "==> All encoding checks PASSED." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "==> $issues issue(s) found." -ForegroundColor $( if ($Strict) { "Red" } else { "Yellow" } )
}

if ($Strict -and $issues -gt 0) {
    exit 1
}
