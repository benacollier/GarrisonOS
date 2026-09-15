# Configuration & Environment Reference

GarrisonOS is configured through standard environment variables loaded from `.env` in the project root.

---

## 1. Environment Variables

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `development` | Environment mode (`development`, `production`, `test`). |
| `PORT` | `3000` | Port for the Node.js REST API server (loopback). |
| `HOST` | `127.0.0.1` | Binding interface for Node.js engine. (Use `127.0.0.1` for loopback). |
| `WEB_PORT` | `8080` | Port for the PHP presentation layer in local/standalone mode. |
| `WEB_HOST` | `localhost` | Binding interface for the PHP presentation layer in local mode. |
| `SQLITE_PATH` | `./garrison.sqlite` | File system path for the primary SQLite database. |
| `STORAGE_PATH` | `./storage/uploads` | File system path for uploaded tenant attachments and receipts. |
| `APP_SECRET` | *(Required in production)* | 32+ byte hex string (64 hex characters) used for HMAC-SHA256 session signatures and authentication tokens. |
| `PHP_SESSION_NAME` | `garrison_session` | Cookie name for the PHP session identifier. |

---

## 2. Generating & Validating Cryptographic Secrets

In production, `APP_SECRET` must be a high-entropy cryptographically secure secret (minimum 32 bytes / 256 bits):

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

### Security Considerations

* **HMAC-SHA256 Token Validation**: The Node.js engine signs and validates auth tokens using `APP_SECRET`.
* **PHP Session & CSRF Protection**: The PHP presentation layer generates a cryptographic CSRF token stored in `$_SESSION['_csrf_token']` using `bin2hex(random_bytes(32))` and validates incoming POST/PUT/DELETE requests before proxying commands to the backend engine over loopback.
* **Secret Protection**: Ensure `.env` is never committed to source control and is readable only by the web service user (`chmod 600 .env`).
