# Chart AI Copilot - Extension Build & Package Script
# Usage: .\scripts\build.ps1
# Run from the project root directory.

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot

# ---------------------------------------------------------------------------
# 1. Read version from manifest.json
# ---------------------------------------------------------------------------
$ManifestPath = Join-Path $ProjectRoot "manifest.json"
$Manifest     = Get-Content $ManifestPath -Raw | ConvertFrom-Json
$Version      = $Manifest.version
Write-Host "Building Chart AI Copilot v$Version ..." -ForegroundColor Cyan

# ---------------------------------------------------------------------------
# 2. Validate all required files exist
# ---------------------------------------------------------------------------
$RequiredFiles = @(
    "manifest.json",
    "shared/constants.js",
    "shared/schema.js",
    "shared/prompt.js",
    "platform-adapters/tradingview.js",
    "platform-adapters/binance.js",
    "platform-adapters/yahoo-finance.js",
    "platform-adapters/investing.js",
    "platform-adapters/registry.js",
    "content/content.js",
    "content/capture.js",
    "content/draw.js",
    "content/batch-scan.js",
    "content/batch-export.js",
    "content/sidebar.js",
    "content/profile-memory.js",
    "content/alert-watcher.js",
    "content/pine-injector.js",
    "content/content.css",
    "background/service-worker.js",
    "background/telegram.js",
    "background/profile.js",
    "background/pine-generator.js",
    "background/briefing.js",
    "popup/popup.html",
    "popup/popup.js",
    "icons/icon16.png",
    "icons/icon48.png",
    "icons/icon128.png"
)

$MissingFiles = @()
foreach ($RelPath in $RequiredFiles) {
    $FullPath = Join-Path $ProjectRoot ($RelPath -replace "/", "\")
    if (-not (Test-Path $FullPath)) {
        $MissingFiles += $RelPath
    }
}

if ($MissingFiles.Count -gt 0) {
    Write-Host "ERROR: The following required files are missing:" -ForegroundColor Red
    foreach ($f in $MissingFiles) {
        Write-Host "  - $f" -ForegroundColor Red
    }
    exit 1
}

Write-Host "All $($RequiredFiles.Count) required files found." -ForegroundColor Green

# ---------------------------------------------------------------------------
# 3. Prepare dist/ directory
# ---------------------------------------------------------------------------
$DistDir = Join-Path $ProjectRoot "dist"
if (-not (Test-Path $DistDir)) {
    New-Item -ItemType Directory -Path $DistDir | Out-Null
}

$StagingDir = Join-Path $DistDir "staging"
if (Test-Path $StagingDir) {
    Remove-Item $StagingDir -Recurse -Force
}
New-Item -ItemType Directory -Path $StagingDir | Out-Null

# ---------------------------------------------------------------------------
# 4. Copy extension files (exclude .git, scripts, *.md, node_modules, dist)
# ---------------------------------------------------------------------------
$ExcludeDirs  = @(".git", "scripts", "node_modules", "dist")
$ExcludeExts  = @(".md")

$CopiedCount = 0

Get-ChildItem -Path $ProjectRoot -Recurse -File | ForEach-Object {
    $File        = $_
    $RelativePath = $File.FullName.Substring($ProjectRoot.Length + 1)

    # Check if the file lives inside an excluded top-level directory
    $TopLevel = $RelativePath.Split("\")[0]
    if ($ExcludeDirs -contains $TopLevel) { return }

    # Exclude by extension
    if ($ExcludeExts -contains $File.Extension.ToLower()) { return }

    # Copy preserving directory structure
    $Destination = Join-Path $StagingDir $RelativePath
    $DestDir     = Split-Path $Destination -Parent
    if (-not (Test-Path $DestDir)) {
        New-Item -ItemType Directory -Path $DestDir | Out-Null
    }
    Copy-Item $File.FullName -Destination $Destination
    $CopiedCount++
}

Write-Host "Copied $CopiedCount files to staging area." -ForegroundColor Green

# ---------------------------------------------------------------------------
# 5. Create zip archive
# ---------------------------------------------------------------------------
$ZipName = "chart-ai-copilot-v$Version.zip"
$ZipPath = Join-Path $DistDir $ZipName

if (Test-Path $ZipPath) {
    Remove-Item $ZipPath -Force
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($StagingDir, $ZipPath)

# Clean up staging
Remove-Item $StagingDir -Recurse -Force

# ---------------------------------------------------------------------------
# 6. Report
# ---------------------------------------------------------------------------
$ZipSize = [math]::Round((Get-Item $ZipPath).Length / 1KB, 1)

Write-Host ""
Write-Host "Build complete!" -ForegroundColor Green
Write-Host "  Files packaged : $CopiedCount"
Write-Host "  Archive size   : $ZipSize KB"
Write-Host "  Output path    : $ZipPath"
Write-Host ""
Write-Host "To install in Chrome: chrome://extensions -> Load unpacked -> select the project root." -ForegroundColor Yellow
Write-Host "To publish         : upload $ZipName to the Chrome Web Store developer dashboard." -ForegroundColor Yellow
