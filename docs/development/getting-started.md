# Developer Getting Started Guide

This guide walks through setting up your local development environment for GarrisonOS.

---

## 1. Prerequisites

* **Node.js**: `v22.5.0` or newer (`v24.x LTS` recommended for full standard library support).
* **PHP**: `8.2` or newer with standard built-in extensions:
  * `pdo_sqlite`
  * `curl`
  * `session`
  * `filter`

---

## 2. Installation & Setup

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/garrisonos/garrison-os.git
   cd garrison-os
   ```

2. **Install Dev Dependencies**:
   ```bash
   npm install
   ```
   *(Installs compile-time TypeScript and type declarations. Zero runtime dependencies are installed.)*

3. **Configure Environment Variables**:
   ```bash
   cp .env.example .env
   ```

4. **Build & Initialize the Database**:
   ```bash
   npm run build
   npm run migrate
   ```

5. **Seed Sample Data (Optional)**:
   ```bash
   npm run seed
   ```
   *(Populates a realistic 20-unit residential portfolio with transactions, active leases, and contacts).*

---

## 3. Running Development Servers

### Terminal 1: Core Node.js Engine
```bash
npm run start
```
Starts the REST API server at `http://127.0.0.1:3000`.

### Terminal 2: PHP Presentation Layer
```bash
php -S localhost:8080 -t web web/index.php
```
Access the application web UI at `http://localhost:8080`.

---

## 4. Default Seed Credentials

* **Email**: `operator@garrison.local`
* **Password**: `GarrisonAdmin2026!`
