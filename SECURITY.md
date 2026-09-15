# Security Policy

GarrisonOS takes security vulnerabilities seriously. We appreciate the responsible disclosure of security issues by researchers and contributors.

---

## 1. Supported Versions

Security updates are actively applied to the following versions of GarrisonOS:

| Version | Supported          |
| ------- | ------------------ |
| `main` / `master` | :white_check_mark: |
| Latest Release    | :white_check_mark: |
| Older Versions    | :x:                |

---

## 2. Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues, discussions, or pull requests.**

If you discover a security vulnerability in GarrisonOS, please report it via one of the following channels:

* **GitHub Security Advisory**: Use the [Private Vulnerability Reporting](https://github.com/GarrisonOS/GarrisonOS/security/advisories/new) tab on GitHub.
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
* **Cryptographic Standards**: Native `scrypt` password hashing, signed HMAC-SHA256 session tokens, and constant-time equality comparisons (`node:crypto.timingSafeEqual`).
* **Presentation Layer Hygiene**: Mandatory CSRF protection on state mutations, contextual output escaping (`htmlspecialchars`), and strict Content Security Policy (CSP).
