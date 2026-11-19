/**
 * CursorGuard MCP Server
 * Model Context Protocol server for AI agent code change protection
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { GuardCore } = require('../guard-core/guard-core');

class CursorGuardMCPServer {
  constructor(options = {}) {
    this.guardCore = new GuardCore({ projectPath: options.projectPath || process.cwd() });
    this.server = new Server(
      {
        name: 'cursor-guard',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );
    
    this._setupTools();
  }

  _setupTools() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        // Session management
        {
          name: 'guard_session_start',
          description: 'Start a new guard session for AI coding',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Session name/description' }
            },
            required: ['name']
          }
        },
        {
          name: 'guard_session_end',
          description: 'End current guard session',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'guard_session_status',
          description: 'Get current guard session status',
          inputSchema: { type: 'object', properties: {} }
        },

        // Checkpoint management
        {
          name: 'guard_checkpoint_create',
          description: 'Create a safety checkpoint',
          inputSchema: {
            type: 'object',
            properties: {
              reason: { type: 'string', description: 'Reason for checkpoint' }
            },
            required: ['reason']
          }
        },
        {
          name: 'guard_checkpoint_list',
          description: 'List all checkpoints in current session',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'guard_checkpoint_restore',
          description: 'Restore to a specific checkpoint',
          inputSchema: {
            type: 'object',
            properties: {
              checkpointId: { type: 'string', description: 'Checkpoint ID to restore' }
            },
            required: ['checkpointId']
          }
        },

        // Rollback functionality
        {
          name: 'guard_rollback_file',
          description: 'Rollback a specific file to previous state',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: 'File path to rollback' },
              time: { type: 'string', description: 'ISO timestamp to rollback to' },
              confirm: { type: 'string', description: 'Confirmation message' }
            },
            required: ['filePath', 'confirm']
          }
        },
        {
          name: 'guard_rollback_area',
          description: 'Rollback a functional area (auth, api, database, etc.)',
          inputSchema: {
            type: 'object',
            properties: {
              area: { type: 'string', description: 'Functional area name' },
              confirm: { type: 'string', description: 'Confirmation message' }
            },
            required: ['area', 'confirm']
          }
        },

        // File protection
        {
          name: 'guard_protect_add',
          description: 'Add file protection',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: 'File path to protect' },
              mode: { type: 'string', enum: ['readonly', 'confirm', 'audit'], default: 'confirm' }
            },
            required: ['filePath']
          }
        },
        {
          name: 'guard_protect_remove',
          description: 'Remove file protection',
          inputSchema: {
            type: 'object',
            properties: {
              filePath: { type: 'string', description: 'File path to unprotect' }
            },
            required: ['filePath']
          }
        },
        {
          name: 'guard_protect_list',
          description: 'List all protected files',
          inputSchema: { type: 'object', properties: {} }
        },

        // Audit and verification
        {
          name: 'guard_audit_log',
          description: 'Get audit log',
          inputSchema: {
            type: 'object',
            properties: {
              limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 }
            }
          }
        },
        {
          name: 'guard_trace_commit',
          description: 'Trace all changes for a commit',
          inputSchema: {
            type: 'object',
            properties: {
              commitHash: { type: 'string', description: 'Git commit hash' }
            },
            required: ['commitHash']
          }
        },
        {
          name: 'guard_generate_report',
          description: 'Generate comprehensive audit report',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'guard_verify',
          description: 'Run verification checks (tests, linter)',
          inputSchema: {
            type: 'object',
            properties: {
              tests: { type: 'boolean', default: true },
              linter: { type: 'boolean', default: true },
              pattern: { type: 'string' },
              coverage: { type: 'integer', minimum: 0, maximum: 100, default: 80 }
            }
          }
        },

        // Emergency recovery
        {
          name: 'guard_emergency_restore',
          description: 'Emergency restore to last known good state',
          inputSchema: { type: 'object', properties: {} }
        },
        {
          name: 'guard_restore_time',
          description: 'Restore to specific time',
          inputSchema: {
            type: 'object',
            properties: {
              time: { type: 'string', description: 'ISO timestamp' }
            },
            required: ['time']
          }
        },

        // Pre/Post check hooks for AI tools
        {
          name: 'guard_pre_check',
          description: 'Pre-change analysis for AI modifications',
          inputSchema: {
            type: 'object',
            properties: {
              plannedFiles: { type: 'array', items: { type: 'string' } },
              changeDescription: { type: 'string' }
            },
            required: ['plannedFiles', 'changeDescription']
          }
        },
        {
          name: 'guard_post_verify',
          description: 'Post-change verification after AI modifications',
          inputSchema: {
            type: 'object',
            properties: {
              changedFiles: { type: 'array', items: { type: 'string' } },
              runTests: { type: 'boolean', default: true }
            },
            required: ['changedFiles']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        await this.guardCore.initialize();

        switch (name) {
          case 'guard_session_start': {
            const id = await this.guardCore.startSession(args.name);
            return { content: [{ type: 'text', text: `Guard session started: ${id}` }] };
          }

          case 'guard_session_end': {
            await this.guardCore.endSession();
            return { content: [{ type: 'text', text: 'Guard session ended' }] };
          }

          case 'guard_session_status': {
            const status = await this.guardCore.getSessionStatus();
            return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };
          }

          case 'guard_checkpoint_create': {
            const id = await this.guardCore.createCheckpoint(args.reason);
            return { content: [{ type: 'text', text: `Checkpoint created: ${id}` }] };
          }

          case 'guard_checkpoint_list': {
            const checkpoints = await this.guardCore.listCheckpoints();
            return { content: [{ type: 'text', text: JSON.stringify(checkpoints, null, 2) }] };
          }

          case 'guard_checkpoint_restore': {
            await this.guardCore.restoreCheckpoint(args.checkpointId);
            return { content: [{ type: 'text', text: `Restored to checkpoint: ${args.checkpointId}` }] };
          }

          case 'guard_rollback_file': {
            await this.guardCore.rollbackFile(args.filePath, args.time, args.confirm);
            return { content: [{ type: 'text', text: `Rolled back file: ${args.filePath}` }] };
          }

          case 'guard_rollback_area': {
            await this.guardCore.rollbackArea(args.area, args.confirm);
            return { content: [{ type: 'text', text: `Rolled back area: ${args.area}` }] };
          }

          case 'guard_protect_add': {
            await this.guardCore.addProtection(args.filePath, args.mode);
            return { content: [{ type: 'text', text: `Protection added: ${args.filePath} (${args.mode})` }] };
          }

          case 'guard_protect_remove': {
            await this.guardCore.removeProtection(args.filePath);
            return { content: [{ type: 'text', text: `Protection removed: ${args.filePath}` }] };
          }

          case 'guard_protect_list': {
            const protected = await this.guardCore.listProtected();
            return { content: [{ type: 'text', text: JSON.stringify(protected, null, 2) }] };
          }

          case 'guard_audit_log': {
            const log = await this.guardCore.getAuditLog(args.limit);
            return { content: [{ type: 'text', text: JSON.stringify(log, null, 2) }] };
          }

          case 'guard_trace_commit': {
            const trace = await this.guardCore.traceCommit(args.commitHash);
            return { content: [{ type: 'text', text: JSON.stringify(trace, null, 2) }] };
          }

          case 'guard_generate_report': {
            const report = await this.guardCore.generateReport();
            return { content: [{ type: 'text', text: JSON.stringify(report, null, 2) }] };
          }

          case 'guard_verify': {
            const results = await this.guardCore.verify(args);
            return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
          }

          case 'guard_emergency_restore': {
            await this.guardCore.emergencyRestore();
            return { content: [{ type: 'text', text: 'Emergency restore completed' }] };
          }

          case 'guard_restore_time': {
            await this.guardCore.restoreToTime(args.time);
            return { content: [{ type: 'text', text: `Restored to time: ${args.time}` }] };
          }

          case 'guard_pre_check': {
            // Analyze planned changes
            const protected = await this.guardCore.listProtected();
            const affectedProtected = args.plannedFiles.filter(f => 
              protected.some(p => f.includes(p.file_path) || p.file_path.includes(f))
            );
            
            const riskLevel = affectedProtected.length > 0 ? 'high' : 'low';
            
            return { 
              content: [{ 
                type: 'text', 
                text: JSON.stringify({
                  riskLevel,
                  affectedProtectedFiles: affectedProtected.map(p => p.file_path),
                  recommendation: riskLevel === 'high' ? 'Create checkpoint before proceeding' : 'Proceed with normal checkpoint'
                }, null, 2) 
              }] 
            };
          }

          case 'guard_post_verify': {
            const results = await this.guardCore.verify({
              tests: args.runTests,
              linter: true
            });
            
            return { 
              content: [{ 
                type: 'text', 
                text: JSON.stringify({
                  verificationPassed: results.passed,
                  checks: results.checks,
                  changedFiles: args.changedFiles
                }, null, 2) 
              }] 
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return { 
          content: [{ type: 'text', text: `Error: ${error.message}` }], 
          isError: true 
        };
      }
    });
  }

  async start() {
    await this.guardCore.initialize();
    
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.error('🛡️  CursorGuard MCP Server started');
  }
}

async function startMCPServer(port = 3031, dev = false) {
  const server = new CursorGuardMCPServer({ projectPath: process.cwd() });
  await server.start();
}

module.exports = { CursorGuardMCPServer, startMCPServer };