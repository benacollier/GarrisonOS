import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const isHelp = args.includes('--help') || args.includes('-h');
const shouldSeed = args.includes('--seed');
const skipBuild = args.includes('--skip-build');
const isQuiet = args.includes('--quiet') || args.includes('-q');

function log(msg) {
  if (!isQuiet) {
    process.stdout.write(`${msg}\n`);
  }
}

function error(msg) {
  process.stderr.write(`${msg}\n`);
}

if (isHelp) {
  process.stdout.write(`
GarrisonOS Preflight & Setup Tool

Usage:
  node scripts/setup.js [options]

Options:
  --seed             Seed the database with a realistic demo portfolio after migration
  --skip-build       Skip TypeScript compilation (useful if pre-built distribution is present)
  --quiet, -q        Suppress non-essential progress output
  --help, -h         Display this help message
\n`);
  process.exit(0);
}

log('========================================');
log('  GarrisonOS Installation & Setup Tool  ');
log('========================================\n');

// 1. Check Node.js Version & node:sqlite capability
log('[1/4] Checking Node.js runtime environment...');
const [nodeMajor, nodeMinor] = process.versions.node.split('.').map(Number);
if (nodeMajor < 22 || (nodeMajor === 22 && nodeMinor < 5)) {
  error(`❌ Node.js 22.5.0 or higher is required. Detected version: v${process.versions.node}`);
  error('   Please upgrade Node.js: https://nodejs.org/');
  process.exit(1);
}

try {
  await import('node:sqlite');
  log(`  ✔ Node.js v${process.versions.node} (node:sqlite verified)`);
} catch (err) {
  error(`❌ node:sqlite is not available in this Node.js build: ${err.message}`);
  process.exit(1);
}

// 2. Setup .env & Cryptographic Secret
log('[2/4] Configuring environment & security secrets...');
const envPath = path.join(rootDir, '.env');
const envExamplePath = path.join(rootDir, '.env.example');

if (!existsSync(envPath)) {
  let template = '';
  if (existsSync(envExamplePath)) {
    template = readFileSync(envExamplePath, 'utf8');
  } else {
    template = `PORT=3000\nHOST=127.0.0.1\nWEB_PORT=8080\nWEB_HOST=localhost\nSQLITE_PATH=./garrison.sqlite\nSTORAGE_PATH=./storage/uploads\nAPP_SECRET=\n`;
  }

  const secureSecret = randomBytes(32).toString('hex');
  const updatedContent = template.includes('APP_SECRET=')
    ? template.replace(/APP_SECRET=.*/, `APP_SECRET=${secureSecret}`)
    : `${template}\nAPP_SECRET=${secureSecret}\n`;

  writeFileSync(envPath, updatedContent, 'utf8');
  log('  ✔ Created .env with generated 256-bit cryptographic APP_SECRET');
} else {
  // Verify existing secret is not placeholder
  const currentEnv = readFileSync(envPath, 'utf8');
  if (currentEnv.includes('change-me-to-a-secure-random-secret')) {
    const secureSecret = randomBytes(32).toString('hex');
    const updated = currentEnv.replace(/APP_SECRET=.*/, `APP_SECRET=${secureSecret}`);
    writeFileSync(envPath, updated, 'utf8');
    log('  ✔ Replaced default placeholder APP_SECRET with a secure 256-bit random key');
  } else {
    log('  ✔ Existing .env file verified');
  }
}

// Ensure storage directories exist
const storageDir = path.join(rootDir, 'storage', 'uploads');
mkdirSync(storageDir, { recursive: true });
log(`  ✔ File storage directory verified (${path.relative(rootDir, storageDir)})`);

// 3. Compile TypeScript (if building from source)
log('[3/4] Preparing backend runtime build...');
const distServerPath = path.join(rootDir, 'dist', 'api', 'server.js');
const tsconfigPath = path.join(rootDir, 'tsconfig.json');

if (!skipBuild && existsSync(tsconfigPath)) {
  log('  Compiling TypeScript sources...');
  try {
    const isWindows = process.platform === 'win32';
    const npmExec = isWindows ? 'npm.cmd' : 'npm';
    execSync(`${npmExec} run build`, { cwd: rootDir, stdio: 'inherit' });
    log('  ✔ TypeScript build completed successfully');
  } catch (err) {
    error('❌ Build failed. Please check TypeScript compilation errors.');
    process.exit(1);
  }
} else if (existsSync(distServerPath)) {
  log('  ✔ Pre-compiled JavaScript distribution verified');
} else {
  error('❌ dist/api/server.js not found and TypeScript build was skipped.');
  process.exit(1);
}

// 4. Run Database Migrations
log('[4/4] Executing database migrations...');
try {
  const migratorPath = path.join(rootDir, 'dist', 'database', 'migrator.js');
  execSync(`node "${migratorPath}"`, { cwd: rootDir, stdio: 'inherit' });
  log('  ✔ Database migrations applied successfully');
} catch (err) {
  error('❌ Database migration failed.');
  process.exit(1);
}

// Optional: Seed Database
if (shouldSeed) {
  log('\nSeeding database with demo portfolio...');
  try {
    const seederPath = path.join(rootDir, 'dist', 'database', 'seed.js');
    execSync(`node "${seederPath}"`, { cwd: rootDir, stdio: 'inherit' });
    log('✔ Database seeded with demo portfolio');
  } catch (err) {
    error('❌ Seeding failed.');
    process.exit(1);
  }
}

log('\n========================================');
log('  ✨ GarrisonOS is ready to run!        ');
log('========================================');
log('\nTo start the application:');
log('  npm start');
log('  # or with custom ports:');
log('  npm start -- --port=8080\n');
log('Default Web UI: http://localhost:8080');
log('API Loopback:   http://127.0.0.1:3000\n');
