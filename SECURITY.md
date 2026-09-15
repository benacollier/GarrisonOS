# Security Policy

GarrisonOS takes security vulnerabilities seriously. We appreciate the responsible disclosure of security issues by researchers and contributors.

---

## 1. Supported Versions

Security updates are actively applied to the following versions of GarrisonOS:

| Version | Supported          |
| ------- | ------------------ |
| `main`            | :white_check_mark: |
| Latest Release    | :white_check_mark: |
| Older Versions    | :x:                |

---

## 2. Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues, discussions, or pull requests.**

If you discover a security vulnerability in GarrisonOS, please report it via one of the following channels:

* **GitHub Security Advisory**: Use the [Private Vulnerability Reporting](https://github.com/benacollier/GarrisonOS/security/advisories/new) tab on GitHub.
* **Email**: Send an encrypted or plain-text email to `security@garrisonos.org` (or the project maintainer).

### What to Include in Your Report
To help us triage and resolve the issue quickly, please include:
1. **Description**: A clear overview of the potential vulnerability and its impact.
2. **Steps to Reproduce**: Detailed reproduction steps, including sample HTTP requests, payloads, or proof-of-concept code.
3. **Affected Component**: Affected API endpoints, backend modules, or PHP presentation templates.
4. **Environment**: Node.js and PHP versions, deployment model (e.g. systemd + Nginx/Caddy).

---

## 3. Vulnerability Response SLA & Process

1. **Initial Acknowledgment**: We will acknowledge receipt of your report within **48 hours**.
2. **Assessment & Verification**: Our core maintainers will reproduce and assess the severity within **5 business days**.
3. **Remediation & Patching**: A fix will be developed, reviewed, and tested in a private advisory fork.
4. **Public Disclosure**: Once a patch is released, a coordinated public security advisory will be published crediting the reporter (if desired).

---

## 4. Core Security Principles in GarrisonOS
 
 GarrisonOS enforces strict architectural controls across the engine and presentation tiers:
 
 * **Zero External Runtime Dependencies**: Eliminates supply chain attacks and transitive dependency vulnerabilities.
 * **Strict Tenant Isolation**: Implicit tenant scoping via `AsyncLocalStorage` and compound database indexes.
 * **Zero Outbound Telemetry**: Offline-first design with no unsolicited outbound external network requests or tracking.
 * **Cryptographic Standards**: Native `scrypt` password hashing, signed HMAC-SHA256 session tokens, and constant-time equality comparisons (`node:crypto.timingSafeEqual`).
 * **Presentation Layer Hygiene**: Mandatory CSRF protection on state mutations, contextual output escaping (`htmlspecialchars`), and strict Content Security Policy (CSP).
 * **Path Traversal & Storage Security**: Attachments stored outside the web root (`STORAGE_PATH`), validated against MIME/extension whitelists and path traversal vectors.

---

## 5. Scope & Vulnerability Classifications

### In-Scope Vulnerabilities
We actively investigate reports regarding:
* Cross-tenant data leakage or unauthorized multi-tenant access.
* Authentication and authorization bypass.
* Remote code execution (RCE) or SQL injection.
* Cross-Site Request Forgery (CSRF) or Cross-Site Scripting (XSS).
* Path traversal in file upload and storage handlers.
* Cryptographic flaws or timing side-channel leaks.

### Out-of-Scope
The following scenarios are considered out of scope:
* Denial-of-service (DoS) against local loopback ports (`127.0.0.1:3000`).
* Attacks requiring physical access, root compromise, or local shell control of the host machine.
* Vulnerabilities in third-party reverse proxies (Nginx, Caddy) or PHP runtime versions themselves.
* Social engineering or physical attacks against host operators.

