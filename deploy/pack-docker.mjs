#!/usr/bin/env node
// Pack the files needed to build and run the game with docker compose.
// Usage (from repo root): npm run pack:docker

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  createReadStream,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const PACKAGE_DIR = 'mota-docker';
const SKIP = new Set(['.DS_Store', 'Thumbs.db']);

const TEXT_NAMES = new Set(['Dockerfile', '.dockerignore', '.env.example']);
const TEXT_EXT = new Set(['.sh', '.yml', '.yaml', '.conf', '.service', '.mod', '.md', '.example']);

const FILES = [
  'Dockerfile',
  'docker-compose.yml',
  '.dockerignore',
  '.env.example',
  'index.html',
  'README.md',
  'docs/DEPLOYMENT.md',
  'docs/RELEASE.md',
];
const DIRS = ['css', 'src', 'server', 'deploy'];

function die(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function isText(filePath) {
  const name = filePath.split(/[/\\]/).pop();
  if (TEXT_NAMES.has(name)) return true;
  const dot = name.lastIndexOf('.');
  return dot >= 0 && TEXT_EXT.has(name.slice(dot));
}

function copyFile(src, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  if (isText(src)) {
    writeFileSync(dest, readFileSync(src, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n'));
    return;
  }
  copyFileSync(src, dest);
}

function copyDir(srcDir, destDir) {
  mkdirSync(destDir, { recursive: true });
  for (const name of readdirSync(srcDir)) {
    if (SKIP.has(name) || name.endsWith('.log')) continue;
    const src = join(srcDir, name);
    const dest = join(destDir, name);
    if (statSync(src).isDirectory()) copyDir(src, dest);
    else copyFile(src, dest);
  }
}

function mustExist(rel, directory = false) {
  const path = join(ROOT, rel);
  try {
    const st = statSync(path);
    if (directory && !st.isDirectory()) die(`${rel} is not a directory`);
  } catch {
    die(`missing ${rel}${directory ? '/' : ''} (run from the repository)`);
  }
}

for (const file of FILES) mustExist(file);
for (const dir of DIRS) mustExist(dir, true);

mkdirSync(DIST, { recursive: true });
const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const archiveName = `mota-docker-src-${stamp}.tar.gz`;
const archivePath = join(DIST, archiveName);
const staging = mkdtempSync(join(tmpdir(), 'mota-docker-pack-'));
const pkg = join(staging, PACKAGE_DIR);

try {
  mkdirSync(pkg, { recursive: true });
  for (const file of FILES) copyFile(join(ROOT, file), join(pkg, file));
  for (const dir of DIRS) copyDir(join(ROOT, dir), join(pkg, dir));

  const packed = spawnSync('tar', ['-czf', archivePath, '-C', staging, PACKAGE_DIR], {
    stdio: 'inherit',
    windowsHide: true,
  });
  if (packed.error) die(`tar failed to start: ${packed.error.message}`);
  if (packed.status !== 0) die(`tar exited with code ${packed.status}`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}

const hash = createHash('sha256');
await pipeline(createReadStream(archivePath), hash);
const sha256 = hash.digest('hex');
const bytes = statSync(archivePath).size;

console.log(`packed ${archivePath}`);
console.log(`size    ${(bytes / 1024).toFixed(1)} KiB`);
console.log(`sha256  ${sha256}`);
console.log(`
Next (PowerShell example):
  scp .\\dist\\${archiveName} ubuntu@服务器A:/home/ubuntu/

On server A:
  tar -tzf /home/ubuntu/${archiveName}
  tar -xzf /home/ubuntu/${archiveName} -C /home/ubuntu
  cd /home/ubuntu/mota-docker
  cp -n .env.example .env
  sudo bash deploy/deploy.sh docker
`);
