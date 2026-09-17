import { readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const isVerbose = args.includes('--verbose') || args.includes('-v');
const target = args.find(a => !a.startsWith('-'));

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

const startTime = Date.now();

if (isVerbose) {
  const child = spawn(process.execPath, ['--test', ...testFiles], { stdio: 'inherit' });
  child.on('close', (code, signal) => {
    if (code === 0) {
      process.exit(0);
    } else {
      process.stderr.write(`\n❌ Test run failed (exit code ${code}, signal ${signal})\n`);
      process.exit(code ?? 1);
    }
  });
} else {
  // Low-token mode: buffer output and report succinct single-line summary on pass
  const child = spawn(process.execPath, ['--test', ...testFiles]);
  let stdoutBuffer = '';
  let stderrBuffer = '';

  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk;
  });

  child.stderr.on('data', (chunk) => {
    stderrBuffer += chunk;
  });

  child.on('close', (code, signal) => {
    const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
    if (code === 0) {
      process.stdout.write(`✔ All test suites passed (${testFiles.length} suites in ${elapsedSeconds}s, 0 failures).\n`);
      process.exit(0);
    } else {
      process.stderr.write(`\n❌ Test run failed (exit code ${code}, signal ${signal}):\n`);
      if (stdoutBuffer) process.stdout.write(stdoutBuffer);
      if (stderrBuffer) process.stderr.write(stderrBuffer);
      process.exit(code ?? 1);
    }
  });
}
