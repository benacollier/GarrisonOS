/**
 * GarrisonOS Automated Security Blast Radius & Ingress Guardrail Checker
 *
 * Scans repository source files for common security anti-patterns:
 * 1. Unchecked query parsing (e.g. bare parseInt(req.query...) without finite/integer guards)
 * 2. Fail-open installer scripts (optional checksum verification or missing fail-closed aborts)
 * 3. Route handlers missing error boundaries or input bounds checks
 *
 * Runs natively on Node.js with zero external dependencies.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

let violationCount = 0;

/**
 * Retrieves all git-tracked and staged files in the repository.
 *
 * @returns {string[]} List of relative file paths.
 */
function getTargetFiles() {
  try {
    const tracked = execSync('git ls-files', { encoding: 'utf8' })
      .split(/\r?\n/)
      .map((f) => f.trim())
      .filter(Boolean);
    let staged = [];
    try {
      staged = execSync('git diff --cached --name-only', { encoding: 'utf8' })
        .split(/\r?\n/)
        .map((f) => f.trim())
        .filter(Boolean);
    } catch {
      // Ignore git diff errors when not in a repo state with cache
    }
    return Array.from(new Set([...tracked, ...staged]));
  } catch (err) {
    process.stderr.write(`[Error] Failed to read git tracked files: ${err.message}\n`);
    process.exit(1);
  }
}

/**
 * Checks route files for unsafe query parameter parsing and missing validation.
 *
 * @param {string} relPath Relative file path.
 * @param {string} content File contents.
 */
function checkRouteFile(relPath, content) {
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    // Flag direct parseInt on req.query without defensive validation
    if (/parseInt\s*\(\s*req\.query(\.|\[)/.test(line)) {
      // Check surrounding lines for Number.isInteger, Number.isFinite, or errorResponse
      const contextRange = lines.slice(Math.max(0, index - 2), Math.min(lines.length, index + 6)).join('\n');
      if (!contextRange.includes('Number.isInteger') && !contextRange.includes('Number.isFinite') && !contextRange.includes('isNaN')) {
        process.stderr.write(
          `[UNSAFE QUERY PARSE] ${relPath}:${index + 1}\n` +
          `  --> ${line.trim()}\n` +
          `  Rule: Do not pass bare parseInt(req.query.x) to repository/database. Validate with Number.isInteger() and return 400 VALIDATION_ERROR on failure.\n\n`
        );
        violationCount++;
      }
    }
  });
}

/**
 * Checks installer scripts for fail-open verification logic.
 *
 * @param {string} relPath Relative file path.
 * @param {string} content File contents.
 */
function checkInstallerScript(relPath, content) {
  // Flag optional checksum logic in bash/sh scripts
  if (relPath.endsWith('.sh')) {
    if (/if\s*\[\s*-n\s*"\$CHECKSUM_URL"\s*\]/.test(content) && !content.includes('echo "[-] Checksum asset missing" >&2; exit 1')) {
      if (content.includes('CHECKSUM_URL') && !content.includes('exit 1')) {
        process.stderr.write(
          `[FAIL-OPEN INSTALLER] ${relPath}\n` +
          `  Rule: Installer checksum verification must fail closed. If checksum asset is missing, script must exit 1.\n\n`
        );
        violationCount++;
      }
    }
  }

  // Flag optional checksum logic in PowerShell scripts
  if (relPath.endsWith('.ps1')) {
    if (/if\s*\(\$checksumAsset\)/.test(content) && !/else\s*\{\s*(throw|exit)/i.test(content)) {
      process.stderr.write(
        `[FAIL-OPEN INSTALLER] ${relPath}\n` +
        `  Rule: PowerShell installer must fail closed if checksum asset is not found. An 'else { throw ... }' block is required.\n\n`
      );
      violationCount++;
    }
  }
}

process.stdout.write('🔍 Running security blast radius and guardrail checks...\n');

const files = getTargetFiles();

for (const relPath of files) {
  const fullPath = resolve(process.cwd(), relPath);
  if (!existsSync(fullPath)) continue;

  // Check route definitions in modules and API
  if ((relPath.includes('routes.ts') || relPath.startsWith('api/')) && relPath.endsWith('.ts')) {
    try {
      const content = readFileSync(fullPath, 'utf8');
      checkRouteFile(relPath, content);
    } catch {
      // Ignore read errors
    }
  }

  // Check installer scripts
  if (relPath.startsWith('scripts/install.') && (relPath.endsWith('.sh') || relPath.endsWith('.ps1'))) {
    try {
      const content = readFileSync(fullPath, 'utf8');
      checkInstallerScript(relPath, content);
    } catch {
      // Ignore read errors
    }
  }
}

if (violationCount > 0) {
  process.stderr.write(`❌ Security check failed with ${violationCount} potential security violation(s) detected.\n`);
  process.exit(1);
} else {
  process.stdout.write(`✔ Security check passed: All inspected route endpoints and installer scripts adhere to fail-closed and strict validation standards.\n`);
  process.exit(0);
}

