#!/usr/bin/env node
/**
 * CursorGuard - AI Code Change Safety Net
 * Main CLI Entry Point
 */

const { Command } = require('commander');
const { startMCPServer } = require('../packages/mcp-tools/mcp-server');
const { GuardCore } = require('../packages/guard-core/guard-core');

const program = new Command();

program
  .name('cursor-guard')
  .description('AI Code Change Safety Net - Professional workflow protection for Cursor AI Agent')
  .version('1.0.0');

program
  .command('server')
  .description('Start MCP guard server')
  .option('-p, --port <port>', 'Port to run server on', '3031')
  .option('--dev', 'Development mode')
  .action(async (options) => {
    console.log('🛡️  Starting CursorGuard MCP Server...');
    await startMCPServer(parseInt(options.port), options.dev);
  });

program
  .command('init')
  .description('Initialize CursorGuard in current project')
  .option('--project-path <path>', 'Project path to guard')
  .action(async (options) => {
    const guard = new GuardCore({ projectPath: options.projectPath || process.cwd() });
    await guard.initialize();
    console.log('✅ CursorGuard initialized successfully');
  });

program
  .command('session')
  .description('Manage guard sessions')
  .option('--start <name>', 'Start new guard session')
  .option('--end', 'End current session')
  .option('--status', 'Show session status')
  .action(async (options) => {
    const guard = new GuardCore({ projectPath: process.cwd() });
    await guard.initialize();
    
    if (options.start) {
      await guard.startSession(options.start);
      console.log(`🚀 Guard session "${options.start}" started`);
    } else if (options.end) {
      await guard.endSession();
      console.log('🏁 Guard session ended');
    } else if (options.status) {
      const status = await guard.getSessionStatus();
      console.log('📊 Session Status:', status);
    }
  });

program
  .command('checkpoint')
  .description('Manage checkpoints')
  .option('--create <reason>', 'Create checkpoint')
  .option('--list', 'List checkpoints')
  .option('--restore <id>', 'Restore to checkpoint')
  .action(async (options) => {
    const guard = new GuardCore({ projectPath: process.cwd() });
    await guard.initialize();
    
    if (options.create) {
      const id = await guard.createCheckpoint(options.create);
      console.log(`💾 Checkpoint created: ${id}`);
    } else if (options.list) {
      const checkpoints = await guard.listCheckpoints();
      console.log('📋 Checkpoints:', checkpoints);
    } else if (options.restore) {
      await guard.restoreCheckpoint(options.restore);
      console.log(`🔄 Restored to checkpoint: ${options.restore}`);
    }
  });

program
  .command('rollback')
  .description('Rollback changes')
  .option('--file <file>', 'Rollback specific file')
  .option('--area <area>', 'Rollback functional area')
  .option('--time <time>', 'Rollback to time')
  .option('--confirm <message>', 'Confirmation message')
  .action(async (options) => {
    const guard = new GuardCore({ projectPath: process.cwd() });
    await guard.initialize();
    
    if (options.file) {
      await guard.rollbackFile(options.file, options.time, options.confirm);
      console.log(`🔄 Rolled back file: ${options.file}`);
    } else if (options.area) {
      await guard.rollbackArea(options.area, options.confirm);
      console.log(`🔄 Rolled back area: ${options.area}`);
    }
  });

program
  .command('audit')
  .description('Audit trail commands')
  .option('--log', 'Show audit log')
  .option('--trace <commit>', 'Trace specific commit')
  .option('--report', 'Generate audit report')
  .action(async (options) => {
    const guard = new GuardCore({ projectPath: process.cwd() });
    await guard.initialize();
    
    if (options.log) {
      const log = await guard.getAuditLog();
      console.log('📋 Audit Log:', log);
    } else if (options.trace) {
      const trace = await guard.traceCommit(options.trace);
      console.log('🔍 Commit Trace:', trace);
    } else if (options.report) {
      const report = await guard.generateReport();
      console.log('📊 Audit Report:', report);
    }
  });

program
  .command('protect')
  .description('File protection management')
  .option('--add <file>', 'Add file protection')
  .option('--remove <file>', 'Remove file protection')
  .option('--list', 'List protected files')
  .option('--mode <mode>', 'Protection mode: readonly, confirm, audit', 'confirm')
  .action(async (options) => {
    const guard = new GuardCore({ projectPath: process.cwd() });
    await guard.initialize();
    
    if (options.add) {
      await guard.addProtection(options.add, options.mode);
      console.log(`🛡️  Protection added: ${options.add} (${options.mode})`);
    } else if (options.remove) {
      await guard.removeProtection(options.remove);
      console.log(`🗑️  Protection removed: ${options.remove}`);
    } else if (options.list) {
      const protected = await guard.listProtected();
      console.log('🛡️  Protected Files:', protected);
    }
  });

program
  .command('verify')
  .description('Run verification checks')
  .option('--tests', 'Run tests')
  .option('--linter', 'Run linter')
  .option('--pattern <pattern>', 'Test pattern')
  .option('--coverage <percent>', 'Minimum coverage', '80')
  .action(async (options) => {
    const guard = new GuardCore({ projectPath: process.cwd() });
    await guard.initialize();
    
    const results = await guard.verify({
      tests: options.tests,
      linter: options.linter,
      pattern: options.pattern,
      coverage: parseInt(options.coverage)
    });
    console.log('✅ Verification Results:', results);
  });

program
  .command('emergency')
  .description('Emergency recovery')
  .option('--restore', 'Restore to last known good state')
  .option('--time <time>', 'Restore to specific time')
  .action(async (options) => {
    const guard = new GuardCore({ projectPath: process.cwd() });
    await guard.initialize();
    
    if (options.restore) {
      await guard.emergencyRestore();
      console.log('🚨 Emergency restore completed');
    } else if (options.time) {
      await guard.restoreToTime(options.time);
      console.log(`🚨 Restored to time: ${options.time}`);
    }
  });

program.parse(process.argv);

// Default: start server if no command provided
if (!process.argv.slice(2).length) {
  console.log('🛡️  Starting CursorGuard MCP Server on default port 3031...');
  startMCPServer(3031, false);
}