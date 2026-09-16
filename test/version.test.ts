import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getApplicationVersion } from '../core/version.js';

describe('Canonical application version', () => {
  it('reads the version from the root VERSION file', () => {
    const root = process.cwd();
    const expected = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
    assert.match(expected, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
    assert.equal(getApplicationVersion(), expected);
  });

  it('does not duplicate a release version in module manifests', () => {
    const root = process.cwd();
    const modules = fs.readdirSync(path.join(root, 'modules'));
    for (const moduleName of modules) {
      const manifestPath = path.join(root, 'modules', moduleName, 'module.json');
      if (!fs.existsSync(manifestPath)) continue;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
      assert.equal(manifest['version'], undefined, `${moduleName} manifest duplicates the application version`);
    }
  });

  it('keeps npm metadata synchronized with the canonical version', () => {
    const root = process.cwd();
    const version = getApplicationVersion();
    const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { version: string };
    const packageLock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8')) as {
      version: string;
      packages?: { '': { version: string } };
    };

    assert.equal(packageJson.version, version);
    assert.equal(packageLock.version, version);
    assert.equal(packageLock.packages?.['']?.version, version);
  });
});
