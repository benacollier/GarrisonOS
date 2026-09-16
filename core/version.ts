import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

function findVersionFile(): string {
  let directory = path.dirname(fileURLToPath(import.meta.url));
  while (directory !== path.dirname(directory)) {
    const candidate = path.join(directory, 'VERSION');
    if (fs.existsSync(candidate)) return candidate;
    directory = path.dirname(directory);
  }
  throw new Error('VERSION file could not be located');
}

/**
 * Return the canonical application version from the repository VERSION file.
 */
export function getApplicationVersion(): string {
  const version = fs.readFileSync(findVersionFile(), 'utf8').trim();
  if (!version) throw new Error('VERSION file is empty');
  return version;
}
