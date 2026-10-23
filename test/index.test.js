import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanDirectory, osintPackage } from '../src/index.js';

describe('OSINT CodeGuard CLI', async () => {
  test('detects vulnerable patterns in JS file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'codeguard-'));
    const filePath = join(dir, 'vuln.js');
    const code = `
      const userInput = process.argv[2];
      eval(userInput); // insecure
      const { exec } = require('child_process');
      exec('ls'); // insecure
    `;
    await writeFile(filePath, code, 'utf8');

    const results = await scanDirectory(dir);
    assert.ok(results[filePath], 'File should be reported');
    const ids = results[filePath].map((f) => f.id).sort();
    assert.deepEqual(ids, ['CHILD_PROCESS_EXEC', 'EVAL']);

    await rm(dir, { recursive: true, force: true });
  });

  test('osintPackage returns expected fields for known package', async () => {
    const info = await osintPackage('lodash');
    assert.ok(info.name === 'lodash');
    assert.ok(typeof info.latestVersion === 'string');
    assert.ok(info.repository);
  });
});
