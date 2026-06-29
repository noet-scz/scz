#!/usr/bin/env node
// Бамп версии: node scripts/bump.js [patch|minor|major]
// Обновляет package.json, tauri.conf.json, Cargo.toml, делает git commit + tag.
// Для патча по умолчанию: node scripts/bump.js
// После запуска: git push && git push --tags

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const component = process.argv[2] || 'patch';

if (!['patch', 'minor', 'major'].includes(component)) {
  console.error('Usage: node scripts/bump.js [patch|minor|major]');
  process.exit(1);
}

// Читаем текущую версию из package.json
const pkgPath = join(root, 'app', 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const [major, minor, patch] = pkg.version.split('.').map(Number);

let newMajor = major, newMinor = minor, newPatch = patch;
if (component === 'major') { newMajor++; newMinor = 0; newPatch = 0; }
else if (component === 'minor') { newMinor++; newPatch = 0; }
else { newPatch++; }

const newVersion = `${newMajor}.${newMinor}.${newPatch}`;
console.log(`${pkg.version} → ${newVersion}`);

// Обновляем package.json
pkg.version = newVersion;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// Обновляем tauri.conf.json
const tauriConfPath = join(root, 'app', 'src-tauri', 'tauri.conf.json');
const tauriConf = JSON.parse(readFileSync(tauriConfPath, 'utf8'));
tauriConf.version = newVersion;
writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');

// Обновляем Cargo.toml (только первый version = "...")
const cargoPath = join(root, 'app', 'src-tauri', 'Cargo.toml');
let cargo = readFileSync(cargoPath, 'utf8');
cargo = cargo.replace(/^version = ".*"/m, `version = "${newVersion}"`);
writeFileSync(cargoPath, cargo);

// Git commit + tag
execSync('git add app/package.json app/src-tauri/tauri.conf.json app/src-tauri/Cargo.toml', { cwd: root, stdio: 'inherit' });
execSync(`git commit -m "chore: v${newVersion}"`, { cwd: root, stdio: 'inherit' });
execSync(`git tag v${newVersion}`, { cwd: root, stdio: 'inherit' });
console.log(`\nСоздан тег v${newVersion}. Запусти:\n  git push && git push --tags`);
