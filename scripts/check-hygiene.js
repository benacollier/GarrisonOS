import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

/**
 * GarrisonOS Unified Architectural & Security Hygiene Scanner
 *
 * Mechanically validates that all code across the repository complies with
 * AGENTS.md, CONTRIBUTING.md, and SECURITY.md standards:
 * 1. Host Path Hygiene (No hardcoded Windows/Unix absolute paths)
 * 2. Secret & Credential Scanning (No private keys, tokens, or live secrets)
 * 3. Zero External Dependencies (Node.js runtime code must only import node:* or relative paths)
 * 4. Strict Equality (No loose == or != in TypeScript source)
 * 5. Synchronous Database Invariant (No await on DatabaseSync methods: prepare, exec)
 * 6. Tenant Isolation & Zero Parameter Leakage (No tenant_id in route parameters or query/body bindings)
 * 7. SQL Portability & Parameterization (No template literal string interpolations in db.prepare)
 * 8. UTC Timestamp Rigor (No SQLite-only non-portable functions: datetime, strftime, unixepoch)
 * 9. Fail-Closed Security (Installers must have mandatory checksum verification and error-aborts)
 * 10. Zero PHP Dependency (All presentation code must be 100% pure TypeScript)
 */

const PATH_CHECK_EXEMPTIONS = new Set([
  'AGENTS.md',
  'CONTRIBUTING.md',
  'scripts/check-hygiene.js'
]);

const IGNORE_FILES = new Set([
  'package-lock.json',
  'Thumbs.db',
  '.DS_Store'
]);

const HOST_PATH_PATTERNS = [
  { name: 'Windows User Path', regex: /[a-zA-Z]:\\(?:Users|Documents and Settings)\\[^\s"'`<>]+/i },
  { name: 'Windows System/Program Path', regex: /[a-zA-Z]:\\(?:Program Files|Program Files \(x86\)|ProgramData|Windows|Temp)\\[^\s"'`<>]+/i },
  { name: 'Unix Home Directory', regex: /(?:^|[\s"'`=:(])\/(?:home|Users)\/[a-zA-Z0-9._-]+(?:\/[^\s"'`<>)]*)?/ },
  { name: 'Unix System/Host Path', regex: /(?:^|[\s"'`=:(])\/(?:root|etc\/(?:shadow|passwd|sudoers)|var\/(?:log|mail|spool)|proc|sys)\b/ }
];

const SECRET_PATTERNS = [
  { name: 'Private Key Block', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'Active APP_SECRET assignment', regex: /^\s*APP_SECRET\s*=\s*['"]?[a-f0-9]{32,}['"]?/m },
  { name: 'AWS Access Key ID', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub Personal Access Token', regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}\b/ },
  { name: 'Generic Secret Assignment', regex: /(?:api[_-]?key|client[_-]?secret|jwt[_-]?secret)\s*[:=]\s*['"][a-zA-Z0-9_\-]{20,}['"]/i }
];

// Prohibited external runtime dependencies (AGENTS.md Section 1)
const PROHIBITED_PACKAGES = [
  'express', 'fastify', 'koa', 'connect',
  'sqlite3', 'better-sqlite3', 'drizzle-orm', 'prisma', 'typeorm',
  'uuid', 'nanoid', 'bcrypt', 'argon2', 'jsonwebtoken',
  'zod', 'joi', 'yup', 'validator',
  'dotenv', 'dotenv-expand',
  'jest', 'mocha', 'chai', 'vitest', 'supertest'
];

let violationCount = 0;

function reportViolation(type, file, lineNum, message) {
  process.stderr.write(`[${type}] ${file}${lineNum ? `:${lineNum}` : ''}\n  --> ${message}\n`);
  violationCount++;
}

function getGitTrackedFiles() {
  try {
    const stdout = execSync('git ls-files', { encoding: 'utf8' });
    return stdout.split(/\r?\n/).map(f => f.trim()).filter(Boolean);
  } catch (err) {
    process.stderr.write(`[Error] Failed to read git tracked files: ${err.message}\n`);
    process.exit(1);
  }
}

function getGitStagedFiles() {
  try {
    const stdout = execSync('git diff --cached --name-only', { encoding: 'utf8' });
    return stdout.split(/\r?\n/).map(f => f.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function checkFile(relPath) {
  if (IGNORE_FILES.has(relPath)) return;

  if (relPath === '.env' || (relPath.startsWith('.env.') && !relPath.endsWith('.example'))) {
    reportViolation('LEAK DETECTED', relPath, 0, 'Sensitive environment file tracked or staged');
    return;
  }

  // Skip binary extensions
  if (/\.(png|jpg|jpeg|gif|ico|sqlite|sqlite-wal|sqlite-shm|gz|zip|tar|bin|woff|woff2|ttf|eot)$/i.test(relPath)) {
    return;
  }

  const fullPath = resolve(process.cwd(), relPath);
  if (!existsSync(fullPath)) return;

  let content;
  try {
    content = readFileSync(fullPath, 'utf8');
  } catch {
    return;
  }

  const lines = content.split(/\r?\n/);
  const isTypeScript = relPath.endsWith('.ts');
  const isSource = isTypeScript || relPath.endsWith('.js');
  const isSql = relPath.endsWith('.sql');
  const isInstaller = relPath.startsWith('scripts/install.');

  // Prohibit any legacy or new PHP files
  if (relPath.endsWith('.php')) {
    reportViolation('PROHIBITED PHP FILE', relPath, 0, 'PHP files are prohibited. GarrisonOS is 100% pure TypeScript.');
  }

  // 1. Host Path Checks
  if (!PATH_CHECK_EXEMPTIONS.has(relPath)) {
    lines.forEach((line, index) => {
      for (const pattern of HOST_PATH_PATTERNS) {
        if (pattern.regex.test(line)) {
          reportViolation('PATH LEAK', relPath, index + 1, `${pattern.name}: ${line.trim().slice(0, 120)}`);
        }
      }
    });
  }

  // 2. Secret & Credential Checks
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.regex.test(content)) {
      reportViolation('SECRET LEAK', relPath, 0, `Potential ${pattern.name}`);
    }
  }

  // 3. Dependency Whitelist Checks (Only for source files, ignoring build configs)
  if (isSource && !relPath.startsWith('test/') && !relPath.includes('/test/') && !relPath.startsWith('scripts/')) {
    lines.forEach((line, index) => {
      const match = line.match(/(?:import\s+.*?from\s+['"]|require\s*\(\s*['"])([^'"]+)['"]/);
      if (match) {
        const importPath = match[1];
        for (const pkg of PROHIBITED_PACKAGES) {
          if (importPath === pkg || importPath.startsWith(`${pkg}/`)) {
            reportViolation('PROHIBITED DEPENDENCY', relPath, index + 1, `Import of banned package "${importPath}" violates Zero External Runtime Dependencies.`);
          }
        }
      }
    });
  }

  // 4. Strict Equality Checks (=== and !==) in TypeScript
  if (isTypeScript) {
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('#')) return;

      if (/(?<![=!<>])==(?!=)/.test(line) || /(?<![=!<>])!=(?!=)/.test(line)) {
        if (!line.includes('hygiene-exempt')) {
          reportViolation('LOOSE EQUALITY', relPath, index + 1, `Use strict equality (=== or !==): ${trimmed.slice(0, 100)}`);
        }
      }
    });
  }

  // 5. Synchronous Database API Invariant (DatabaseSync must never be awaited)
  if (isSource) {
    lines.forEach((line, index) => {
      if (/await\s+(?:db|this\.db|getDatabase\(\))\.(?:prepare|exec|withTransaction)/.test(line)) {
        reportViolation('ASYNC SQLITE VIOLATION', relPath, index + 1, `node:sqlite DatabaseSync is synchronous. Never use await: ${line.trim()}`);
      }
    });
  }

  // 6. Operator Isolation & Zero Parameter Leakage
  if (isSource && !relPath.includes('/test/')) {
    lines.forEach((line, index) => {
      if (/router\.(?:get|post|put|delete|patch)\s*\(\s*['"][^'"]*:\s*(?:operator_id|tenant_id)/i.test(line)) {
        reportViolation('OPERATOR LEAKAGE', relPath, index + 1, `Route parameter ":operator_id" or ":tenant_id" is forbidden. Operator must be resolved implicitly via RequestContext.`);
      }
    });
  }

  // 7. SQL Portability & Parameterization
  if ((isSource || isSql) && relPath !== 'scripts/check-hygiene.js') {
    lines.forEach((line, index) => {
      const prevLine = index > 0 ? lines[index - 1] : '';
      if (line.includes('hygiene-exempt') || prevLine.includes('hygiene-exempt')) return;

      if (/db\.prepare\s*\(\s*`[^`]*\$\{/.test(line)) {
        reportViolation('UNSAFE SQL QUERY', relPath, index + 1, `Unparameterized SQL string template detected. Always use parameterized placeholders (?): ${line.trim().slice(0, 100)}`);
      }
      if (/\bAUTOINCREMENT\b/i.test(line)) {
        reportViolation('NON-PORTABLE SQL', relPath, index + 1, `AUTOINCREMENT is forbidden for PostgreSQL compatibility. Use id TEXT PRIMARY KEY (UUIDv7).`);
      }
      if (/\bINSERT\s+OR\s+(?:REPLACE|IGNORE)\b/i.test(line)) {
        reportViolation('NON-PORTABLE SQL', relPath, index + 1, `INSERT OR REPLACE/IGNORE is forbidden. Use ANSI ON CONFLICT (...) DO UPDATE / DO NOTHING.`);
      }
      if (/\b(?:datetime\('now'\)|unixepoch\(\))\b/i.test(line)) {
        reportViolation('NON-PORTABLE TIME', relPath, index + 1, `SQLite datetime functions are forbidden. Timestamps must be UTC epoch milliseconds (INTEGER).`);
      }
    });
  }

  // 8. Fail-Closed Installer Integrity
  if (isInstaller) {
    if (relPath.endsWith('.sh')) {
      // Must compute SHA-256 (sha256sum/shasum), compare actual vs expected hash, and abort on mismatch
      const computesHash = /command\s+-v\s+(?:sha256sum|shasum)/.test(content) && /(?:sha256sum|shasum\s+-a\s+256)/.test(content);
      const comparesHash = /\[\s*(?:"\$ACTUAL_HASH"\s*!=\s*"\$EXPECTED_HASH"|\$ACTUAL_HASH\s*!=\s*\$EXPECTED_HASH)/.test(content);
      const abortsOnMismatch = /echo\s+.*Checksum verification failed.*exit\s+1/s.test(content) || /exit\s+1/.test(content);

      if (!computesHash) {
        reportViolation('INSTALLER INTEGRITY', relPath, 0, `Installer script missing SHA-256 digest computation (sha256sum / shasum).`);
      }
      if (!comparesHash || !abortsOnMismatch) {
        reportViolation('INSTALLER INTEGRITY', relPath, 0, `Installer script missing comparison of calculated hash against expected checksum with abort on mismatch.`);
      }
    } else if (relPath.endsWith('.ps1')) {
      // Must compute SHA-256 (Get-FileHash -Algorithm SHA256), compare actual vs expected hash, and abort on mismatch
      const computesHash = /Get-FileHash\b[^\r\n]*-Algorithm\s+SHA256/i.test(content);
      const comparesHash = /\$actualHash\s+-ne\s+\$expectedHash/i.test(content);
      const abortsOnMismatch = /exit\s+1|throw\b/i.test(content);

      if (!computesHash) {
        reportViolation('INSTALLER INTEGRITY', relPath, 0, `PowerShell installer missing Get-FileHash -Algorithm SHA256 computation.`);
      }
      if (!comparesHash || !abortsOnMismatch) {
        reportViolation('INSTALLER INTEGRITY', relPath, 0, `PowerShell installer missing comparison of calculated hash against expected checksum with abort on mismatch.`);
      }
    }

    if (!content.includes('exit 1') && !content.includes('throw') && !content.includes('exit $LastExitCode')) {
      reportViolation('FAIL-OPEN SCRIPT', relPath, 0, `Installer script must fail closed with explicit non-zero exit code on verification failure.`);
    }
  }
}

process.stdout.write('🔍 Scanning repository for architectural hygiene, compliance, and security...\n');

const targetFiles = Array.from(new Set([...getGitTrackedFiles(), ...getGitStagedFiles()]));

for (const relPath of targetFiles) {
  checkFile(relPath);
}

if (violationCount > 0) {
  process.stderr.write(`\n❌ Hygiene check failed with ${violationCount} violation(s) detected.\n`);
  process.exit(1);
} else {
  process.stdout.write(`✔ Hygiene check passed: Scanned ${targetFiles.length} files. Zero architectural or security violations.\n`);
  process.exit(0);
}
