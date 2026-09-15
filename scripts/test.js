import { readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';

const target = process.argv[2]; // e.g. "core", "properties", or empty for all

function getTestFiles(dir) {
  const results = [];
  if (!existsSync(dir)) return results;
  const list = readdirSync(dir);
  for (const file of list) {
    const fullPath = join(dir, file);
    const stat = statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results.push(...getTestFiles(fullPath));
    } else if (file.endsWith('.test.js')) {
      results.push(fullPath);
    }
  }
  return results;
}

let testFiles = [];

if (!target || target === 'all') {
  testFiles = getTestFiles(resolve('dist'));
} else if (target === 'core') {
  testFiles = getTestFiles(resolve('dist/test'));
} else {
  // Automatically resolves any module directory dynamically: dist/modules/<target>/test
  const moduleTestDir = resolve('dist/modules', target, 'test');
  if (!existsSync(moduleTestDir)) {
    process.stderr.write(`[TestRunner] Error: No test directory found for module "${target}" at ${moduleTestDir}\n`);
    process.exit(1);
  }
  testFiles = getTestFiles(moduleTestDir);
}

if (testFiles.length === 0) {
  process.stdout.write(`[TestRunner] No test files found for target: ${target || 'all'}\n`);
  process.exit(0);
}

const child = spawn(process.execPath, ['--test', ...testFiles], { stdio: 'inherit' });
child.on('close', (code) => {
  process.exit(code ?? 0);
});
