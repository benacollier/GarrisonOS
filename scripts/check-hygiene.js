import { readFileSync, existsSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import { execSync } from 'node:child_process';

// Patterns that describe path hygiene rules (allowable only in rules/guidelines docs or this script itself)
const PATH_CHECK_EXEMPTIONS = new Set([
  'AGENTS.md',
  'CONTRIBUTING.md',
  'scripts/check-hygiene.js'
]);

// Ignored files (non-source or binary)
const IGNORE_FILES = new Set([
  'package-lock.json',
  'Thumbs.db',
  '.DS_Store'
]);

// Host path leak checks across Windows and Linux / macOS:
// Windows paths:
//   - C:\Users\<name> or C:\Documents and Settings
//   - Specific host root directories: Program Files, Windows, ProgramData, Temp
// Linux / Unix paths:
//   - /home/<user> or /Users/<user>
//   - Sensitive system directories: /root, /etc/shadow, /etc/passwd, /var/log, /proc, /sys
const HOST_PATH_PATTERNS = [
  { name: 'Windows User Path', regex: /[a-zA-Z]:\\(?:Users|Documents and Settings)\\[^\s"'`<>]+/i },
  { name: 'Windows System/Program Path', regex: /[a-zA-Z]:\\(?:Program Files|Program Files \(x86\)|ProgramData|Windows|Temp)\\[^\s"'`<>]+/i },
  { name: 'Unix Home Directory', regex: /(?:^|[\s"'`=:(])\/(?:home|Users)\/[a-zA-Z0-9._-]+(?:\/[^\s"'`<>)]*)?/ },
  { name: 'Unix System/Host Path', regex: /(?:^|[\s"'`=:(])\/(?:root|etc\/(?:shadow|passwd|sudoers)|var\/(?:log|mail|spool)|proc|sys)\b/ }
];

// Secret / Credential patterns
const SECRET_PATTERNS = [
  { name: 'Private Key Block', regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'Active APP_SECRET assignment', regex: /^\s*APP_SECRET\s*=\s*['"]?[a-f0-9]{32,}['"]?/m },
  { name: 'AWS Access Key ID', regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'GitHub Personal Access Token', regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}\b/ },
  { name: 'Generic Secret Assignment', regex: /(?:api[_-]?key|client[_-]?secret|jwt[_-]?secret)\s*[:=]\s*['"][a-zA-Z0-9_\-]{20,}['"]/i }
];

let violationCount = 0;

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
  if (IGNORE_FILES.has(relPath)) {
    return;
  }

  // Guard against committing environment files
  if (relPath === '.env' || (relPath.startsWith('.env.') && !relPath.endsWith('.example'))) {
    process.stderr.write(`[LEAK DETECTED] Sensitive environment file tracked or staged: ${relPath}\n`);
    violationCount++;
    return;
  }

  // Skip binary extensions
  if (/\.(png|jpg|jpeg|gif|ico|sqlite|sqlite-wal|sqlite-shm|gz|zip|tar|bin|woff|woff2|ttf|eot)$/i.test(relPath)) {
    return;
  }

  const fullPath = resolve(process.cwd(), relPath);
  if (!existsSync(fullPath)) {
    return;
  }

  let content;
  try {
    content = readFileSync(fullPath, 'utf8');
  } catch {
    return;
  }

  // 1. Host Path Checks
  if (!PATH_CHECK_EXEMPTIONS.has(relPath)) {
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const pattern of HOST_PATH_PATTERNS) {
        if (pattern.regex.test(line)) {
          process.stderr.write(
            `[PATH LEAK] ${pattern.name} in ${relPath}:${index + 1}\n  --> ${line.trim().slice(0, 120)}\n`
          );
          violationCount++;
        }
      }
    });
  }

  // 2. Secret & Credential Checks
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.regex.test(content)) {
      process.stderr.write(`[SECRET LEAK] Potential ${pattern.name} in ${relPath}\n`);
      violationCount++;
    }
  }
}

process.stdout.write('🔍 Scanning repository files for host path leaks and exposed secrets...\n');

// Combine tracked and staged files into a deduplicated list
const targetFiles = Array.from(new Set([...getGitTrackedFiles(), ...getGitStagedFiles()]));

for (const relPath of targetFiles) {
  checkFile(relPath);
}

if (violationCount > 0) {
  process.stderr.write(`\n❌ Hygiene check failed with ${violationCount} violation(s) detected.\n`);
  process.exit(1);
} else {
  process.stdout.write(`✔ Hygiene check passed: Scanned ${targetFiles.length} files. Zero host paths or credentials exposed.\n`);
  process.exit(0);
}

