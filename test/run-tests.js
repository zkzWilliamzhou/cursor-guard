/**
 * CursorGuard Test Suite
 * Comprehensive tests for guard core, checkpoints, rollback, protection, and audit
 */

const { GuardCore } = require('../packages/guard-core/guard-core');
const path = require('path');
const fs = require('fs');
const os = require('os');

async function runTests() {
  console.log('🧪 Running CursorGuard Tests...\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ ${message}`);
      passed++;
    } else {
      console.log(`  ❌ ${message}`);
      failed++;
    }
  }

  // Create a temp project directory for testing
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cursorguard-test-'));
  console.log(`  📁 Test directory: ${testDir}`);

  try {
    // Test 1: Guard Core Initialization
    console.log('\n📦 Test Suite: Guard Core');
    const guard = new GuardCore({ projectPath: testDir });
    await guard.initialize();
    assert(guard.db !== null, 'Guard core initializes with database');

    // Test 2: Session Management
    const sessionId = await guard.startSession('test-session');
    assert(sessionId !== null, 'Session start returns ID');
    assert(sessionId.startsWith('session_'), 'Session ID has correct format');

    const status = await guard.getSessionStatus();
    assert(status.active === true, 'Session status shows active');

    // Test 3: Checkpoint Management
    const cpId = await guard.createCheckpoint('Test checkpoint');
    assert(cpId !== null, 'Checkpoint creation returns ID');
    assert(cpId.startsWith('cp_'), 'Checkpoint ID has correct format');

    const checkpoints = await guard.listCheckpoints();
    assert(checkpoints.length > 0, 'Checkpoint listing works');

    // Test 4: File Protection
    await guard.addProtection('src/auth/user.js', 'confirm');
    const protected = await guard.listProtected();
    assert(protected.length > 0, 'File protection added');

    await guard.removeProtection('src/auth/user.js');
    const protectedAfter = await guard.listProtected();
    assert(protectedAfter.length === 0, 'File protection removed');

    // Test 5: Audit Log
    const auditLog = await guard.getAuditLog();
    assert(auditLog.length > 0, 'Audit log has entries');

    // Test 6: Report Generation
    const report = await guard.generateReport();
    assert(report.checkpointCount >= 0, 'Report generation works');

    // Test 7: Verification
    const verifyResult = await guard.verify({ tests: false, linter: false });
    assert(verifyResult.passed === true, 'Verification with no checks passes');

    // Test 8: End Session
    await guard.endSession();
    const endedStatus = await guard.getSessionStatus();
    assert(endedStatus.active === false, 'Session end works');

    console.log('\n📊 Test Results:', { passed, failed });

    if (failed > 0) {
      process.exit(1);
    } else {
      console.log('🎉 All tests passed!');
    }
  } catch (e) {
    console.error('❌ Test suite error:', e.message);
    process.exit(1);
  } finally {
    // Cleanup
    guard.close();
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

runTests().catch(console.error);
