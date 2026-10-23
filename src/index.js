#!/usr/bin/env node
/**
 * @fileoverview OSINT & Static Code Vulnerability Scanner CLI
 * @module osint-codeguard
 */

import { readFile, readdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { request } from 'node:https';
import { exit } from 'node:process';

/**
 * Known insecure patterns (regex) for static analysis.
 * @type {Array<{id:string, description:string, regex:RegExp}>}
 */
const VULN_PATTERNS = [
  {
    id: 'EVAL',
    description: 'Use of eval() can lead to code injection.',
    regex: /\beval\s*\(/g,
  },
  {
    id: 'CHILD_PROCESS_EXEC',
    description: 'Unvalidated child_process.exec() may lead to command injection.',
    regex: /\bexec\s*\(/g,
  },
  {
    id: 'INSECURE_CRYPTO',
    description: 'Use of crypto.createCipher (deprecated).',
    regex: /\bcreateCipher\s*\(/g,
  },
];

/**
 * Scan a single file for vulnerable patterns.
 * @param {string} filePath Absolute path to the file.
 * @returns {Promise<Array<{id:string, line:number, snippet:string}>>}
 */
export async function scanFile(filePath) {
  const content = await readFile(filePath, 'utf8');
  const lines = content.split('\n');
  const findings = [];

  VULN_PATTERNS.forEach(({ id, regex }) => {
    lines.forEach((line, idx) => {
      if (regex.test(line)) {
        findings.push({
          id,
          line: idx + 1,
          snippet: line.trim(),
        });
        // Reset regex state for global matches
        regex.lastIndex = 0;
      }
    });
  });

  return findings;
}

/**
 * Recursively scan a directory for .js/.ts files.
 * @param {string} dirPath Directory to scan.
 * @returns {Promise<Record<string, Array>>} Mapping file => findings.
 */
export async function scanDirectory(dirPath) {
  const results = {};

  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = resolve(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && ['.js', '.ts'].includes(extname(entry.name))) {
        const findings = await scanFile(fullPath);
        if (findings.length) {
          results[fullPath] = findings;
        }
      }
    }
  }

  await walk(resolve(dirPath));
  return results;
}

/**
 * Perform OSINT on an npm package name.
 * Retrieves latest version, repository URL, and known vulnerabilities from the npm registry.
 * @param {string} pkgName Package name.
 * @returns {Promise<Object>}
 */
export async function osintPackage(pkgName) {
  const url = `https://registry.npmjs.org/${encodeURIComponent(pkgName)}`;
  return new Promise((resolvePromise, reject) => {
    const req = request(url, { method: 'GET' }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const pkg = JSON.parse(data);
          const latest = pkg['dist-tags']?.latest;
          const versionInfo = pkg.versions?.[latest] || {};
          resolvePromise({
            name: pkgName,
            latestVersion: latest,
            repository: versionInfo.repository?.url || 'N/A',
            homepage: versionInfo.homepage || 'N/A',
            knownVulns: versionInfo['npm-audit'] ? true : false,
          });
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

/** CLI entry point */
async function main() {
  const [, , command, target] = process.argv;

  if (!command || !target) {
    console.error('Usage: osint-codeguard <scan|osint> <path|package>');
    exit(1);
  }

  try {
    if (command === 'scan') {
      const results = await scanDirectory(target);
      console.log(JSON.stringify(results, null, 2));
    } else if (command === 'osint') {
      const info = await osintPackage(target);
      console.log(JSON.stringify(info, null, 2));
    } else {
      console.error(`Unknown command: ${command}`);
      exit(1);
    }
  } catch (err) {
    console.error('Error:', err.message);
    exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
