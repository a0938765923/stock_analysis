# Chart AI Copilot - Extension Packaging Script
# Usage: .\package.ps1
# Output: ..\chart-ai-copilot-v0.2.0.zip

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ---------- Config ----------
$ExtVersion  = '0.2.0'
$ExtName     = 'chart-ai-copilot'
$ScriptDir   = $PSScriptRoot
$OutputDir   = Split-Path $ScriptDir -Parent
$ZipName     = "$ExtName-v$ExtVersion.zip"
$ZipPath     = Join-Path $OutputDir $ZipName

# Files/folders to exclude
$ExcludePatterns = @(
    '.DS_Store',
    'Thumbs.db',
    'desktop.ini',
    '*.md',
    '*.ps1',
    '*.sh',
    '*.log',
    '.git',
    '.gitignore',
    '.vscode',
    'node_modules',
    'package.json',
    'package-lock.json',
    '*.test.js',
    '__tests__'
)

# ---------- Pre-check ----------
Write-Host ""
Write-Host "=== Chart AI Copilot Packager ===" -ForegroundColor Cyan
Write-Host "Version : $ExtVersion"
Write-Host "Source  : $ScriptDir"
Write-Host "Output  : $ZipPath"
Write-Host ""

# Verify manifest exists
$ManifestPath = Join-Path $ScriptDir 'manifest.json'
if (-not (Test-Path $ManifestPath)) {
    Write-Error "manifest.json not found in $ScriptDir. Are you running this from the extension root?"
}

# Verify manifest version matches
$Manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json
if ($Manifest.version -ne $ExtVersion) {
    Write-Warning "manifest.json version ($($Manifest.version)) does not match script version ($ExtVersion). Continuing anyway..."
}

# Remove old zip if exists
if (Test-Path $ZipPath) {
    Remove-Item $ZipPath -Force
    Write-Host "Removed existing $ZipName" -ForegroundColor Yellow
}

# ---------- Collect Files ----------
Write-Host "Collecting files..." -ForegroundColor Gray

$AllFiles = Get-ChildItem -Path $ScriptDir -Recurse -File

$FilesToPack = $AllFiles | Where-Object {
    $file = $_
    $excluded = $false

    foreach ($pattern in $ExcludePatterns) {
        # Match by name or by pattern
        if ($file.Name -like $pattern) {
            $excluded = $true
            break
        }
        # Match parent folder names
        $relativeParts = ($file.FullName.Substring($ScriptDir.Length + 1)) -split '\\'
        foreach ($part in $relativeParts) {
            if ($part -like $pattern) {
                $excluded = $true
                break
            }
        }
        if ($excluded) { break }
    }

    -not $excluded
}

Write-Host "Files to pack: $($FilesToPack.Count)" -ForegroundColor Gray
$FilesToPack | ForEach-Object {
    Write-Host "  + $($_.FullName.Substring($ScriptDir.Length + 1))" -ForegroundColor DarkGray
}

# ---------- Create ZIP ----------
Write-Host ""
Write-Host "Creating ZIP archive..." -ForegroundColor Gray

Add-Type -AssemblyName System.IO.Compression.FileSystem

$ZipStream = [System.IO.Compression.ZipFile]::Open($ZipPath, 'Create')

try {
    foreach ($file in $FilesToPack) {
        # Entry path inside zip: use relative path from $ScriptDir, forward slashes
        $entryName = $file.FullName.Substring($ScriptDir.Length + 1).Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $ZipStream,
            $file.FullName,
            $entryName,
            [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
    }
} finally {
    $ZipStream.Dispose()
}

# ---------- Summary ----------
$ZipInfo = Get-Item $ZipPath
$SizeKB  = [math]::Round($ZipInfo.Length / 1KB, 1)

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Green
Write-Host "Output : $ZipPath"
Write-Host "Size   : $SizeKB KB"
Write-Host "Files  : $($FilesToPack.Count)"
Write-Host ""
Write-Host "Next step: Upload to Chrome Web Store Developer Dashboard" -ForegroundColor Cyan
Write-Host "  https://chrome.google.com/webstore/devconsole" -ForegroundColor Cyan
Write-Host ""
