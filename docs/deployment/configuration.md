# Configuration & Environment Reference

GarrisonOS is configured through standard environment variables loaded from `.env` in the project root.

---

## 1. Environment Variables

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `development` | Environment mode (`development`, `production`, `test`). |
| `PORT` | `3000` | Port for the Node.js REST API server. |
| `HOST` | `127.0.0.1` | Binding interface for Node.js engine. (Use `127.0.0.1` for loopback). |
| `SQLITE_PATH` | `./garrison.sqlite` | File system path for the primary SQLite database. |
| `STORAGE_PATH` | `./storage/uploads` | File system path for uploaded tenant attachments and receipts. |
| `APP_SECRET` | *(Required in production)* | 32+ character random string used for HMAC-SHA256 session signatures. |

---

## 2. Generating a Secure Secret

In production, generate a cryptographically strong 32-byte hexadecimal string:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```
Assign the output to `APP_SECRET` in your production `.env` file.
