# ==============================================================================
# GarrisonOS Windows PowerShell Automated Installer (Method 2: Verified Release Archive)
# ==============================================================================
# Usage:
#   .\scripts\install.ps1 [parameters]
# Examples:
#   .\scripts\install.ps1 -Port 8080 -Seed
#   .\scripts\install.ps1 -InstallDir C:\garrison-os -Port 8080 -Seed
# ==============================================================================

[CmdletBinding()]
param (
    [Parameter(Position = 0)]
    [string]$InstallDir = ".",

    [Parameter()]
    [int]$Port = 8080,

    [Parameter()]
    [int]$ApiPort = 3000,

    [Parameter()]
    [switch]$Seed,

    [Parameter()]
    [string]$Version = "latest",

    [Parameter()]
    [switch]$Help
)

$ErrorActionPreference = "Stop"

if ($Help) {
    Write-Host @"
GarrisonOS Windows Installer

Parameters:
  -InstallDir <string>   Target installation directory (default: current directory)
  -Port <int>            Frontend Web UI port (default: 8080)
  -ApiPort <int>         Backend API engine port (default: 3000)
  -Seed                  Seed the database with a realistic demo portfolio
  -Version <string>      Release version to install (default: latest)
  -Help                  Show this help text

Examples:
  .\install.ps1
  .\install.ps1 -InstallDir C:\garrison-os -Port 8080 -Seed
"@
    exit 0
}

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  GarrisonOS Windows Installer           " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verify Prerequisites
Write-Host "[1/4] Verifying system prerequisites..." -ForegroundColor Yellow

# Check Node.js
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host "❌ Error: Node.js was not found in PATH." -ForegroundColor Red
    Write-Host "   Please install Node.js 22.5.0 or newer from https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

$nodeVersion = & node -v
Write-Host "  ✔ Found Node.js: $nodeVersion" -ForegroundColor Green

# Check PHP
$phpCmd = Get-Command php -ErrorAction SilentlyContinue
if (-not $phpCmd) {
    Write-Host "❌ Error: PHP CLI was not found in PATH." -ForegroundColor Red
    Write-Host "   Please install PHP 8.2+ with curl, session, filter, and pdo_sqlite." -ForegroundColor Yellow
    Write-Host "   Download PHP for Windows: https://windows.php.net/download/" -ForegroundColor Yellow
    exit 1
}

$phpVersion = & php -v | Select-Object -First 1
Write-Host "  ✔ Found PHP: $phpVersion" -ForegroundColor Green

# 2. Resolve Installation Directory & Download Release (if needed)
$targetPath = [System.IO.Path]::GetFullPath($InstallDir)
if (-not (Test-Path $targetPath)) {
    New-Item -ItemType Directory -Path $targetPath -Force | Out-Null
}

$packageJsonPath = Join-Path $targetPath "package.json"
$isExistingRepo = Test-Path $packageJsonPath

if (-not $isExistingRepo) {
    Write-Host "[2/4] Fetching latest release from GitHub..." -ForegroundColor Yellow
    $repo = "garrisonos/GarrisonOS"
    $apiUrl = if ($Version -eq "latest") {
        "https://api.github.com/repos/$repo/releases/latest"
    } else {
        "https://api.github.com/repos/$repo/releases/tags/$Version"
    }

    try {
        $headers = @{ "User-Agent" = "GarrisonOS-Installer" }
        $release = Invoke-RestMethod -Uri $apiUrl -Headers $headers -Method Get
        $zipAsset = $release.assets | Where-Object { $_.name -like "*.zip" } | Select-Object -First 1

        $downloadUrl = if ($zipAsset) { $zipAsset.browser_download_url } else { $release.zipball_url }
        $tempZip = Join-Path $env:TEMP "garrison-release-$($release.tag_name).zip"

        Write-Host "  Downloading $($release.name) ($($release.tag_name))..." -ForegroundColor Gray
        Invoke-WebRequest -Uri $downloadUrl -OutFile $tempZip -Headers $headers

        # Cryptographic SHA-256 integrity verification if release checksum asset is published
        $checksumAsset = $release.assets | Where-Object { $_.name -like "*sha256*" -or $_.name -like "*checksum*" } | Select-Object -First 1
        if ($checksumAsset) {
            Write-Host "  Verifying cryptographic SHA-256 checksum..." -ForegroundColor Gray
            $tempChecksum = Join-Path $env:TEMP "garrison-checksum-$($release.tag_name).txt"
            Invoke-WebRequest -Uri $checksumAsset.browser_download_url -OutFile $tempChecksum -Headers $headers
            $checksumContent = Get-Content $tempChecksum -Raw
            $expectedHash = ($checksumContent -split '\s+')[0].Trim().ToLower()
            $actualHash = (Get-FileHash -Path $tempZip -Algorithm SHA256).Hash.ToLower()

            if ($expectedHash -and ($actualHash -ne $expectedHash)) {
                Remove-Item -Path $tempZip -Force
                Remove-Item -Path $tempChecksum -Force
                Write-Host "[!] Checksum verification failed!" -ForegroundColor Red
                Write-Host "    Expected: $expectedHash" -ForegroundColor Red
                Write-Host "    Actual:   $actualHash" -ForegroundColor Red
                exit 1
            }
            Write-Host "  [+] Cryptographic SHA-256 checksum verified ($actualHash)" -ForegroundColor Green
            Remove-Item -Path $tempChecksum -Force
        }

        Write-Host "  Extracting to $targetPath..." -ForegroundColor Gray
        Expand-Archive -Path $tempZip -DestinationPath $targetPath -Force
        Remove-Item -Path $tempZip -Force
        Write-Host "  [+] Release files extracted" -ForegroundColor Green
    } catch {
        Write-Host "[!] Failed to download release from GitHub: $_" -ForegroundColor Red
        Write-Host "    You can manually clone the repository with: git clone https://github.com/garrisonos/GarrisonOS.git" -ForegroundColor Yellow
        exit 1
    }
} else {
    Write-Host "[2/4] Found existing GarrisonOS directory at $targetPath" -ForegroundColor Green
}

# 3. Execute Node.js Setup
Write-Host "[3/4] Running setup and database migrations..." -ForegroundColor Yellow
Push-Location $targetPath
try {
    $setupArgs = @("scripts/setup.js")
    if ($Seed) {
        $setupArgs += "--seed"
    }
    & node $setupArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Setup failed." -ForegroundColor Red
        exit $LASTEXITCODE
    }
} finally {
    Pop-Location
}

# 4. Display Launch Information
Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  🎉 GarrisonOS Installed Successfully!  " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "To start GarrisonOS, navigate to the folder and run:" -ForegroundColor White
Write-Host "  cd `"$targetPath`"" -ForegroundColor Yellow
Write-Host "  npm start" -ForegroundColor Yellow
if ($Port -ne 8080) {
    Write-Host "  # Or with your custom port:" -ForegroundColor Gray
    Write-Host "  npm start -- --port=$Port" -ForegroundColor Yellow
}
Write-Host ""
Write-Host "Access URLs:" -ForegroundColor White
Write-Host "  Web Application: http://localhost:$Port" -ForegroundColor Cyan
Write-Host "  API Backend:     http://127.0.0.1:$ApiPort" -ForegroundColor Cyan
Write-Host ""

