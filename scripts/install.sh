#!/usr/bin/env bash
# ==============================================================================
# GarrisonOS Linux / macOS Automated Installer (Method 2: Verified Release Archive)
# ==============================================================================
# Usage:
#   ./scripts/install.sh [options]
# Examples:
#   ./scripts/install.sh --dir /var/www/garrison-os --port 8080 --seed
# ==============================================================================

set -e

PORT=8080
API_PORT=3000
SEED=0
VERSION="latest"
TARGET_DIR="."

print_help() {
    cat << EOF
GarrisonOS Linux / macOS Installer

Usage:
  install.sh [options]

Options:
  --dir <path>       Target directory for installation (default: current directory)
  --port <number>    Frontend Web UI port (default: 8080)
  --api-port <num>   Backend API engine port (default: 3000)
  --seed             Seed the database with a realistic demo portfolio
  --version <tag>    Release tag to install (default: latest)
  --help, -h         Display this help message

Examples:
  ./install.sh
  ./install.sh --dir /var/www/garrison-os --port 8080 --seed
EOF
    exit 0
}

while [ $# -gt 0 ]; do
    case "$1" in
        --port)
            PORT="$2"
            shift 2
            ;;
        --port=*)
            PORT="${1#*=}"
            shift 1
            ;;
        --api-port)
            API_PORT="$2"
            shift 2
            ;;
        --api-port=*)
            API_PORT="${1#*=}"
            shift 1
            ;;
        --dir)
            TARGET_DIR="$2"
            shift 2
            ;;
        --dir=*)
            TARGET_DIR="${1#*=}"
            shift 1
            ;;
        --seed)
            SEED=1
            shift 1
            ;;
        --version)
            VERSION="$2"
            shift 2
            ;;
        --version=*)
            VERSION="${1#*=}"
            shift 1
            ;;
        --help|-h)
            print_help
            ;;
        *)
            echo "Unknown option: $1"
            print_help
            ;;
    esac
done

echo "========================================="
echo "  GarrisonOS Automated Installer         "
echo "========================================="
echo ""

# 1. Verify Prerequisites
echo "[1/4] Verifying system prerequisites..."

if ! command -v node >/dev/null 2>&1; then
    echo "❌ Error: Node.js was not found in PATH."
    echo "   Please install Node.js 22.5.0 or newer: https://nodejs.org/"
    exit 1
fi
echo "  ✔ Found Node.js $(node -v)"

if ! command -v php >/dev/null 2>&1; then
    echo "❌ Error: PHP CLI was not found in PATH."
    echo "   Please install PHP 8.2+ with curl, session, filter, and pdo_sqlite."
    exit 1
fi
echo "  ✔ Found PHP $(php -v | head -n 1)"

# 2. Resolve Installation Directory & Download Release (if needed)
mkdir -p "$TARGET_DIR"
TARGET_DIR=$(cd "$TARGET_DIR" && pwd)

if [ ! -f "$TARGET_DIR/package.json" ]; then
    echo "[2/4] Fetching latest release from GitHub..."
    REPO="garrisonos/GarrisonOS"
    if [ "$VERSION" = "latest" ]; then
        API_URL="https://api.github.com/repos/$REPO/releases/latest"
    else
        API_URL="https://api.github.com/repos/$REPO/releases/tags/$VERSION"
    fi

    TEMP_TAR="/tmp/garrison-release-$$.tar.gz"
    TEMP_CHECKSUM="/tmp/garrison-checksum-$$.txt"
    TAR_URL=$(curl -sSL -H "User-Agent: GarrisonOS-Installer" "$API_URL" | grep '"tarball_url":' | sed -E 's/.*"([^"]+)".*/\1/')
    CHECKSUM_URL=$(curl -sSL -H "User-Agent: GarrisonOS-Installer" "$API_URL" | grep '"browser_download_url":' | grep -i 'sha256' | head -n 1 | sed -E 's/.*"([^"]+)".*/\1/')

    if [ -z "$TAR_URL" ]; then
        echo "❌ Could not find release tarball on GitHub."
        echo "   You can clone the repository with: git clone https://github.com/garrisonos/GarrisonOS.git"
        exit 1
    fi

    echo "  Downloading release from $TAR_URL..."
    curl -sSL -H "User-Agent: GarrisonOS-Installer" -o "$TEMP_TAR" "$TAR_URL"

    # Cryptographic SHA-256 integrity verification if release checksum asset is published
    if [ -n "$CHECKSUM_URL" ]; then
        echo "  Verifying cryptographic SHA-256 checksum from $CHECKSUM_URL..."
        curl -sSL -H "User-Agent: GarrisonOS-Installer" -o "$TEMP_CHECKSUM" "$CHECKSUM_URL"
        EXPECTED_HASH=$(awk '{print $1}' "$TEMP_CHECKSUM" | head -n 1)
        if command -v sha256sum >/dev/null 2>&1; then
            ACTUAL_HASH=$(sha256sum "$TEMP_TAR" | awk '{print $1}')
        elif command -v shasum >/dev/null 2>&1; then
            ACTUAL_HASH=$(shasum -a 256 "$TEMP_TAR" | awk '{print $1}')
        else
            ACTUAL_HASH=""
        fi

        if [ -n "$ACTUAL_HASH" ] && [ -n "$EXPECTED_HASH" ]; then
            if [ "$ACTUAL_HASH" != "$EXPECTED_HASH" ]; then
                echo "❌ Checksum verification failed!"
                echo "   Expected: $EXPECTED_HASH"
                echo "   Actual:   $ACTUAL_HASH"
                rm -f "$TEMP_TAR" "$TEMP_CHECKSUM"
                exit 1
            fi
            echo "  ✔ Cryptographic SHA-256 checksum verified ($ACTUAL_HASH)"
        fi
        rm -f "$TEMP_CHECKSUM"
    fi

    tar -xzf "$TEMP_TAR" --strip-components=1 -C "$TARGET_DIR"
    rm -f "$TEMP_TAR"
    echo "  ✔ Release files extracted to $TARGET_DIR"
else
    echo "[2/4] Found existing GarrisonOS directory at $TARGET_DIR"
fi

# 3. Execute Setup
echo "[3/4] Running setup and database migrations..."
cd "$TARGET_DIR"
SETUP_ARGS="scripts/setup.js"
if [ "$SEED" -eq 1 ]; then
    SETUP_ARGS="$SETUP_ARGS --seed"
fi

node $SETUP_ARGS

# 4. Success Output
echo ""
echo "========================================="
echo "  🎉 GarrisonOS Installed Successfully!  "
echo "========================================="
echo ""
echo "To start GarrisonOS:"
echo "  cd $TARGET_DIR"
echo "  npm start"
if [ "$PORT" != "8080" ]; then
    echo "  # Or with your custom port:"
    echo "  npm start -- --port=$PORT"
fi
echo ""
echo "Access URLs:"
echo "  Web Application: http://localhost:$PORT"
echo "  API Backend:     http://127.0.0.1:$API_PORT"
echo ""

