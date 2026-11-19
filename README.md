# CursorGuard - AI Code Change Safety Net

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-brightgreen.svg)](https://modelcontextprotocol.io/)

Professional workflow protection, rollback & audit system for Cursor AI Agent. Solves the "AI broke my code" headache.

## 🚨 Core Value

1. **Smart Checkpoints** - Automatically create snapshots based on code change types
2. **Change Prediction** - Simulate impact scope before AI makes modifications
3. **Incremental Rollback** - Rollback by file, functional area, or time point
4. **Audit Log** - Complete AI modification operation traceability
5. **Git Integration** - Seamlessly integrates with Git workflow

## 📦 Installation

```bash
npm install -g cursor-guard
# Or use npx
npx cursor-guard
```

## 🔧 Usage Examples

### Start MCP Server

```bash
cursor-guard server
```

### Initialize Project

```bash
cursor-guard init
```

### Create Checkpoint

```bash
cursor-guard checkpoint create --reason "before-refactor-user-module"
cursor-guard checkpoint create --scope src/auth/ --detail "modify authentication logic"
```

### Incremental Rollback

```bash
# Rollback specific file
cursor-guard rollback --file src/auth/user.js --time "30 minutes ago"

# Rollback functional area
cursor-guard rollback --area "authentication-system" --confirm "Login module modification caused test failure"
```

### Audit Log

```bash
# View AI modification log
cursor-guard audit --log

# Trace specific commit
cursor-guard audit trace --commit abc123
```

### File Protection

```bash
# Set read-only file to prevent accidental changes
cursor-guard protect add src/config/database.js --mode readonly

# Set sensitive file modification confirmation
cursor-guard protect add src/auth/ --mode confirm
```

### Emergency Restore

```bash
# Quickly restore to last known good state
cursor-guard emergency --restore

# Restore to specific time
cursor-guard emergency --time "2024-01-15 14:30:00"
```

### MCP Integration (Cursor)

```json
// .mcp.json
{
  "mcpServers": {
    "cursor-guard": {
      "command": "npx",
      "args": ["-y", "cursor-guard"],
      "env": {
        "GUARD_AUTO_CHECKPOINT": "true",
        "GUARD_AUTO_ROLLBACK": "true",
        "GUARD_TEST_COMMAND": "npm test"
      }
    }
  }
}
```

### Claude Code Integration (.claude/settings.json)

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write,Edit/Delete",
        "type": "command",
        "command": "npx cursor-guard pre-check"
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write,Edit/Delete",
        "type": "command",
        "command": "npx cursor-guard post-verify"
      }
    ]
  }
}
```

## 🛠️ 20+ MCP Tools

### Safety Management
- `guard_check` - Execute safety check
- `guard_checkpoint` - Create safety checkpoint
- `guard_rollback` - Execute incremental rollback

### Analysis Tools
- `analyze_impact` - Analyze modification impact scope
- `predict_risk` - Predict modification risk
- `review_changes` - Detailed change review

### Audit Functions
- `audit_log` - View modification audit log
- `trace_commit` - Trace commit trajectory
- `export_report` - Export audit report

## 🔄 Standard Workflow

### Standard AI Session Flow

```bash
# 1. Create checkpoint before starting
cursor-guard session --start "user-auth-refactor"

# 2. AI makes modifications (auto-monitored)
# ... CursorGuard monitors all file changes during AI work ...

# 3. Auto-verify after completion
cursor-guard verify --tests --linter

# 4. Generate report
cursor-guard audit --report
```

## 🔒 Advanced Security Features

### File Modification Permission Control

```bash
# Set read-only file to prevent accidental changes
cursor-guard protect add src/config/database.js --mode readonly

# Set sensitive file modification confirmation
cursor-guard protect add src/auth/ --mode confirm
```

### Change Verification

```bash
# Auto-run related tests
cursor-guard verify --tests --pattern "auth.*" --coverage 80

# Silent mode - backup only
cursor-guard verify --tests --silent --scope "src/components/"
```

## 📊 Change Visualization

```bash
# Generate modification report
cursor-guard audit --report
```

## 🤝 Integration Ecosystem

Supports integration with:
- Cursor Composer
- Claude Code
- Windsurf
- VS Code
- JetBrains IDE

## 📜 License

MIT License - Fully open source

## 🚀 Roadmap

- [ ] Multi-AI assistant collaboration monitoring
- [ ] Cloud backup and team sharing
- [ ] AI behavior pattern learning
- [ ] Automated fix suggestion engine

---

**Make every AI modification worry-free, make every version worth committing!**