#!/usr/bin/env node
/**
 * CursorGuard Security Audit Script
 * Checks for vulnerabilities and security issues
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔒 Running CursorGuard Security Audit...\n');

let issues = 0;
let warnings = 0;

function check(condition, message, isWarning = false) {
  if (!condition) {
    if (isWarning) {
      console.log(`  ⚠️  WARNING: ${message}`);
      warnings++;
    } else {
      console.log(`  ❌ ISSUE: ${message}`);
      issues++;
    }
  } else {
    console.log(`  ✅ ${message}`);
  }
}

// Check 1: Package.json exists
const packageJsonPath = path.join(__dirname, '..', 'package.json');
check(fs.existsSync(packageJsonPath), 'package.json exists');

if (fs.existsSync(packageJsonPath)) {
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  // Check 2: No known vulnerable dependencies
  check(!pkg.dependencies || !pkg.dependencies['@modelcontextprotocol/sdk']?.includes('0.4'),
    'MCP SDK version is not vulnerable 0.4.x');

  // Check 3: License is MIT (permissive)
  check(pkg.license === 'MIT', 'License is MIT (permissive)');

  // Check 4: No scripts that could be dangerous
  const dangerousScripts = ['preinstall', 'postinstall', 'install'];
  const hasDangerousScripts = dangerousScripts.some(s => pkg.scripts && pkg.scripts[s]);
  check(!hasDangerousScripts, 'No dangerous install scripts');

  // Check 5: Engines specified
  check(pkg.engines && pkg.engines.node, 'Node.js engine version specified');

  // Check 6: Repository URL uses HTTPS
  if (pkg.repository && pkg.repository.url) {
    check(pkg.repository.url.startsWith('https://'), 'Repository URL uses HTTPS');
  }
}

// Check 7: No .env files committed
const envFiles = ['.env', '.env.local', '.env.production'];
envFiles.forEach(file => {
  check(!fs.existsSync(path.join(__dirname, '..', file)), `No ${file} file committed`);
});

// Check 8: No hardcoded secrets in source
const sourceFiles = [];
function collectJsFiles(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory() && file !== 'node_modules' && file !== '.git') {
      collectJsFiles(fullPath);
    } else if (file.endsWith('.js') || file.endsWith('.ts')) {
      sourceFiles.push(fullPath);
    }
  }
}

collectJsFiles(path.join(__dirname, '..', 'cli'));
collectJsFiles(path.join(__dirname, '..', 'packages'));
collectJsFiles(path.join(__dirname, '..', 'integrations'));

const secretPatterns = [
  /api[_-]?key\s*[=:]\s*['"][^'"]+['"]/i,
  /secret\s*[=:]\s*['"][^'"]+['"]/i,
  /password\s*[=:]\s*['"][^'"]+['"]/i,
  /token\s*[=:]\s*['"][^'"]+['"]/i,
  /private[_-]?key\s*[=:]\s*['"][^'"]+['"]/i
];

let secretsFound = false;
for (const file of sourceFiles) {
  const content = fs.readFileSync(file, 'utf8');
  for (const pattern of secretPatterns) {
    if (pattern.test(content)) {
      console.log(`  ❌ ISSUE: Potential secret found in ${file}`);
      secretsFound = true;
      issues++;
    }
  }
}
check(!secretsFound, 'No hardcoded secrets in source code');

// Check 9: MCP server uses stdio transport (secure)
const mcpServerPath = path.join(__dirname, '..', 'packages', 'mcp-tools', 'mcp-server.js');
if (fs.existsSync(mcpServerPath)) {
  const content = fs.readFileSync(mcpServerPath, 'utf8');
  check(content.includes('StdioServerTransport'), 'MCP server uses stdio transport');
  check(!content.includes('http') || content.includes('localhost'), 'No external HTTP endpoints in MCP server');
}

// Check 10: Dependencies are up to date (basic check)
try {
  const auditResult = execSync('npm audit --json', {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    stdio: 'pipe'
  });
  const audit = JSON.parse(auditResult);
  if (audit.metadata && audit.metadata.vulnerabilities) {
    const { critical, high, moderate, low } = audit.metadata.vulnerabilities;
    if (critical > 0 || high > 0) {
      console.log(`  ❌ ISSUE: ${critical} critical, ${high} high vulnerabilities found`);
      issues++;
    } else if (moderate > 0 || low > 0) {
      console.log(`  ⚠️  WARNING: ${moderate} moderate, ${low} low vulnerabilities found`);
      warnings++;
    } else {
      console.log(`  ✅ No vulnerabilities found`);
    }
  }
} catch (e) {
  console.log(`  ⚠️  WARNING: Could not run npm audit`);
  warnings++;
}

// Summary
console.log(`\n📊 Audit Summary: ${issues} issues, ${warnings} warnings`);

if (issues > 0) {
  console.log('🚨 Security audit FAILED - Please fix issues before release');
  process.exit(1);
} else {
  console.log('✅ Security audit PASSED');
}
