# =============================================================================
# strip-bom.ps1
#
# PURPOSE
#   Recursively scans all HTML, JS, CSS, and JSON source files in the project
#   and removes the UTF-8 BOM (byte sequence EF BB BF) from any file that
#   starts with it.
#
#   A UTF-8 BOM causes Android WebView to mis-decode Arabic characters as
#   "????" because it disrupts encoding detection before the
#   <meta charset="UTF-8"> tag is parsed.
#
# WHAT THIS SCRIPT DOES
#   - Reads each file as raw bytes
#   - Checks if the first 3 bytes are 0xEF 0xBB 0xBF (UTF-8 BOM)
#   - If yes: writes the file back WITHOUT those 3 bytes (content unchanged)
#   - If no:  leaves the file completely untouched
#
# WHAT THIS SCRIPT DOES NOT DO
#   - Does NOT alter any file content beyond removing the 3 BOM bytes
#   - Does NOT re-encode, transcode, or change line endings
#   - Does NOT touch node_modules, android build outputs, or .git
#
# USAGE
#   powershell -ExecutionPolicy Bypass -File strip-bom.ps1
#   powershell -ExecutionPolicy Bypass -File strip-bom.ps1 -Strict
#
# PARAMETERS
#   -Strict   Exit with code 1 if any BOM was found (useful for CI gates).
# =============================================================================

param([switch]$Strict)

$ErrorActionPreference = "Stop"

# Enforce UTF-8 console output (PowerShell 5.x defaults to OEM codepage)
$utf8NoBom           = New-Object System.Text.UTF8Encoding $false
[Console]::OutputEncoding = $utf8NoBom
$OutputEncoding           = $utf8NoBom

$root = $PSScriptRoot

# Paths containing these strings are skipped entirely
$skipPaths = @(
    "\node_modules\",
    "\.git\",
    "\android\build\",
    "\android\app\build\",
    "\android\app\src\main\assets\",
    "\www\"
)

$extensions = @(".html", ".htm", ".js", ".mjs", ".css", ".json")

Write-Host ""
Write-Host "==> [strip-bom] Scanning source files for UTF-8 BOM (EF BB BF)..." -ForegroundColor Cyan
Write-Host "    Root: $root" -ForegroundColor Gray
Write-Host ""

$scanned = 0
$fixed   = 0

$allFiles = Get-ChildItem -Path $root -Recurse -File

foreach ($file in $allFiles) {
    # Check extension
    if ($extensions -notcontains $file.Extension.ToLower()) { continue }

    # Check excluded paths
    $skip = $false
    foreach ($pattern in $skipPaths) {
        if ($file.FullName.IndexOf($pattern, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
            $skip = $true
            break
        }
    }
    if ($skip) { continue }

    $scanned++
    $bytes = [System.IO.File]::ReadAllBytes($file.FullName)

    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        $stripped = New-Object byte[] ($bytes.Length - 3)
        [System.Array]::Copy($bytes, 3, $stripped, 0, $stripped.Length)
        [System.IO.File]::WriteAllBytes($file.FullName, $stripped)

        $rel = $file.FullName.Substring($root.Length).TrimStart([char]'\', [char]'/')
        Write-Host "  [FIXED] $rel" -ForegroundColor Yellow
        $fixed++
    }
}

Write-Host ""
if ($fixed -gt 0) {
    Write-Host "==> [strip-bom] Removed BOM from $fixed file(s).  Scanned $scanned total." -ForegroundColor Yellow
} else {
    Write-Host "==> [strip-bom] No BOM found.  Scanned $scanned file(s) -- all clean." -ForegroundColor Green
}
Write-Host ""

if ($Strict -and $fixed -gt 0) {
    Write-Host "[strip-bom] Exiting with code 1 (-Strict: BOM was present)." -ForegroundColor Red
    exit 1
}

exit 0
