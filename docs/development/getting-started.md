# Developer Getting Started Guide

This guide walks through setting up your local development environment for GarrisonOS.

---

## 1. Prerequisites

* **Node.js**: `v22.5.0` or newer (`v24.x LTS` recommended for built-in `node:sqlite` support).
* **PHP**: `8.2` or newer with standard built-in extensions:
  * `pdo_sqlite`
  * `curl`
  * `session`
  * `filter`

---

## 2. Automated One-Line Setup

You can install and initialize GarrisonOS directly using the automated installers:

### Windows (PowerShell)
```powershell
irm https://raw.githubusercontent.com/garrisonos/GarrisonOS/main/scripts/install.ps1 | iex
```

Linux / macOS:
```bash
curl -fsSL https://raw.githubusercontent.com/garrisonos/GarrisonOS/main/scripts/install.sh | bash
```

---

## 3. Manual Installation & Setup

If cloning from source:

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/garrisonos/GarrisonOS.git
   cd GarrisonOS
   ```

2. **Install Dev Dependencies**:
   ```bash
   npm install
   ```
   *(Installs compile-time TypeScript and type declarations. Zero runtime dependencies are installed.)*

3. **Run the Preflight & Setup Tool**:
   ```bash
   npm run setup
   # or automatically seed the 20-unit demo portfolio:
   npm run setup -- --seed
   ```
   *(This validates runtime versions, creates `.env` with a secure random `APP_SECRET`, ensures storage directories exist, compiles TypeScript, and executes migrations).*

---

## 4. Running the Application

GarrisonOS includes a cross-platform process runner that manages both the Node.js API engine and the PHP presentation layer concurrently:

```bash
# Start full application (Web UI: http://localhost:8080, API: http://127.0.0.1:3000)
npm start

# Customize ports on the fly:
npm start -- --port=8080 --api-port=3000

# Start in development mode (API engine runs with --watch):
npm run dev
```

Navigate to **`http://localhost:8080`** in your browser.

---

## 5. Demo Seed Credentials

* **Email**: `operator@garrisonos.local`
* **Password**: `Password123!`
* **Tenant ID**: `tenant-demo`

---

## 6. Running Tests

Run the full automated test suite (core + all module-packaged tests):

```bash
npm test
```
