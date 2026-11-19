#!/usr/bin/env node
/**
 * CursorGuard Build Script
 * Prepares the package for publishing
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔨 Building CursorGuard...\n');

const rootDir = path.join(__dirname, '..');
const packageJsonPath = path.join(rootDir, 'package.json');

if (!fs.existsSync(packageJsonPath)) {
  console.error('❌ package.json not found');
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Verify required files exist
const requiredFiles = [
  'cli/index.js',
  'packages/guard-core/guard-core.js',
  'packages/mcp-tools/mcp-server.js',
  'README.md',
  'LICENSE'
];

for (const file of requiredFiles) {
  const fullPath = path.join(rootDir, file);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ Required file missing: ${file}`);
    process.exit(1);
  }
  console.log(`  ✅ ${file}`);
}

// Verify CLI is executable
const cliPath = path.join(rootDir, 'cli', 'index.js');
const cliContent = fs.readFileSync(cliPath, 'utf8');
if (!cliContent.startsWith('#!/usr/bin/env node')) {
  console.error('❌ CLI entry point missing shebang');
  process.exit(1);
}
console.log('  ✅ CLI has shebang');

// Run tests
console.log('\n🧪 Running tests...');
try {
  execSync('node test/run-tests.js', { cwd: rootDir, stdio: 'inherit' });
  console.log('  ✅ Tests passed');
} catch (e) {
  console.error('❌ Tests failed');
  process.exit(1);
}

// Run audit
console.log('\n🔒 Running security audit...');
try {
  execSync('node scripts/audit.js', { cwd: rootDir, stdio: 'inherit' });
  console.log('  ✅ Security audit passed');
} catch (e) {
  console.error('❌ Security audit failed');
  process.exit(1);
}

// Create dist directory
const distDir = path.join(rootDir, 'dist');
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true });
}
fs.mkdirSync(distDir, { recursive: true });

// Copy files to dist
const filesToCopy = [
  'cli',
  'packages',
  'integrations',
  'README.md',
  'LICENSE',
  'package.json'
];

for (const file of filesToCopy) {
  const src = path.join(rootDir, file);
  const dest = path.join(distDir, file);

  if (fs.statSync(src).isDirectory()) {
    fs.cpSync(src, dest, { recursive: true });
  } else {
    fs.copyFileSync(src, dest);
  }
  console.log(`  📦 Copied ${file} to dist/`);
}

// Update package.json for publishing (remove devDependencies, scripts)
const distPkg = { ...pkg };
delete distPkg.devDependencies;
delete distPkg.scripts.test;
delete distPkg.scripts.dev;
delete distPkg.scripts.audit;

fs.writeFileSync(
  path.join(distDir, 'package.json'),
  JSON.stringify(distPkg, null, 2)
);
console.log('  📦 Updated package.json for publishing');

console.log('\n✅ Build completed successfully!');
console.log(`📦 Package ready in ${distDir}`);
console.log(`\nTo publish: cd dist && npm publish`);
