/**
 * CursorGuard Core
 * Core guard functionality for AI code change protection
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const chokidar = require('chokidar');
const Diff = require('diff');

class GuardCore {
  constructor(options = {}) {
    this.projectPath = options.projectPath || process.cwd();
    this.dbPath = path.join(this.projectPath, '.cursorguard', 'guard.db');
    this.db = null;
    this.currentSession = null;
    this.watcher = null;
    this.checkpointCounter = 0;
  }

  async initialize() {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this._createTables();
    
    console.log(`🛡️  Guard core initialized for: ${this.projectPath}`);
    return this;
  }

  _createTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        project_path TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        created_at INTEGER NOT NULL,
        ended_at INTEGER,
        checkpoint_count INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_path);

      CREATE TABLE IF NOT EXISTS checkpoints (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        reason TEXT,
        git_commit TEXT,
        files_changed TEXT DEFAULT '[]',
        diff_summary TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      );

      CREATE INDEX IF NOT EXISTS idx_checkpoints_session ON checkpoints(session_id);

      CREATE TABLE IF NOT EXISTS file_changes (
        id TEXT PRIMARY KEY,
        checkpoint_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        change_type TEXT NOT NULL,
        old_content TEXT,
        new_content TEXT,
        diff TEXT,
        protected BOOLEAN DEFAULT 0,
        FOREIGN KEY (checkpoint_id) REFERENCES checkpoints(id)
      );

      CREATE INDEX IF NOT EXISTS idx_file_changes_checkpoint ON file_changes(checkpoint_id);
      CREATE INDEX IF NOT EXISTS idx_file_changes_file ON file_changes(file_path);

      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        session_id TEXT,
        event_type TEXT NOT NULL,
        description TEXT,
        metadata TEXT DEFAULT '{}',
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_audit_session ON audit_log(session_id);
      CREATE INDEX IF NOT EXISTS idx_audit_type ON audit_log(event_type);

      CREATE TABLE IF NOT EXISTS protected_files (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL UNIQUE,
        mode TEXT DEFAULT 'confirm',
        patterns TEXT DEFAULT '[]',
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_protected_file ON protected_files(file_path);
    `);
  }

  // Session management
  async startSession(name) {
    const id = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();
    
    this.db.prepare(`
      INSERT INTO sessions (id, name, project_path, status, created_at)
      VALUES (?, ?, ?, 'active', ?)
    `).run(id, name, this.projectPath, now);
    
    this.currentSession = { id, name, createdAt: now };
    this.checkpointCounter = 0;
    
    // Start file watcher
    this._startWatcher();
    
    // Create initial checkpoint
    await this.createCheckpoint('Session started');
    
    // Log audit
    this._logAudit('session_start', `Session "${name}" started`);
    
    return id;
  }

  async endSession() {
    if (!this.currentSession) return;
    
    const now = Date.now();
    this.db.prepare(`
      UPDATE sessions SET status = 'ended', ended_at = ? WHERE id = ?
    `).run(now, this.currentSession.id);
    
    this._stopWatcher();
    this._logAudit('session_end', `Session "${this.currentSession.name}" ended`);
    this.currentSession = null;
  }

  async getSessionStatus() {
    if (!this.currentSession) return { active: false };
    
    const session = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(this.currentSession.id);
    const checkpoints = this.db.prepare('SELECT COUNT(*) as count FROM checkpoints WHERE session_id = ?').get(this.currentSession.id);
    
    return {
      active: true,
      session: session,
      checkpointCount: checkpoints.count
    };
  }

  // Checkpoint management
  async createCheckpoint(reason) {
    if (!this.currentSession) {
      throw new Error('No active session. Start a session first.');
    }
    
    const id = `cp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();
    
    // Get current git commit
    let gitCommit = null;
    try {
      gitCommit = execSync('git rev-parse HEAD', { cwd: this.projectPath, encoding: 'utf8' }).trim();
    } catch (e) {
      // Not a git repo or no commits
    }
    
    // Get changed files since last checkpoint
    const changedFiles = this._getChangedSinceLastCheckpoint();
    
    // Generate diff summary
    const diffSummary = this._generateDiffSummary(changedFiles);
    
    this.db.prepare(`
      INSERT INTO checkpoints (id, session_id, reason, git_commit, files_changed, diff_summary, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, this.currentSession.id, reason, gitCommit, JSON.stringify(changedFiles), diffSummary, now);
    
    // Record file changes
    for (const file of changedFiles) {
      await this._recordFileChange(id, file);
    }
    
    // Update session checkpoint count
    this.checkpointCounter++;
    this.db.prepare('UPDATE sessions SET checkpoint_count = ? WHERE id = ?').run(this.checkpointCounter, this.currentSession.id);
    
    this._logAudit('checkpoint_create', `Checkpoint created: ${reason}`, { checkpointId: id, filesChanged: changedFiles.length });
    
    return id;
  }

  async listCheckpoints() {
    if (!this.currentSession) return [];
    
    return this.db.prepare(`
      SELECT * FROM checkpoints WHERE session_id = ? ORDER BY created_at DESC
    `).all(this.currentSession.id);
  }

  async restoreCheckpoint(checkpointId) {
    const checkpoint = this.db.prepare('SELECT * FROM checkpoints WHERE id = ?').get(checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }
    
    const filesChanged = JSON.parse(checkpoint.files_changed || '[]');
    
    // Restore each file
    for (const file of filesChanged) {
      const changes = this.db.prepare('SELECT * FROM file_changes WHERE checkpoint_id = ? AND file_path = ?').all(checkpointId, file);
      for (const change of changes) {
        if (change.old_content !== null && change.old_content !== undefined) {
          const fullPath = path.join(this.projectPath, file);
          fs.writeFileSync(fullPath, change.old_content);
        } else if (change.change_type === 'added') {
          // File was added, delete it
          const fullPath = path.join(this.projectPath, file);
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
          }
        }
      }
    }
    
    this._logAudit('checkpoint_restore', `Restored to checkpoint: ${checkpointId}`, { filesRestored: filesChanged.length });
  }

  // Rollback functionality
  async rollbackFile(filePath, time, confirmMessage) {
    // Find checkpoint at or before time
    let targetCheckpoint;
    if (time) {
      const targetTime = new Date(time).getTime();
      targetCheckpoint = this.db.prepare(`
        SELECT * FROM checkpoints 
        WHERE session_id = ? AND created_at <= ?
        ORDER BY created_at DESC LIMIT 1
      `).get(this.currentSession?.id, targetTime);
    } else {
      targetCheckpoint = this.db.prepare(`
        SELECT * FROM checkpoints 
        WHERE session_id = ? AND json_extract(files_changed, '$') LIKE ?
        ORDER BY created_at DESC LIMIT 1
      `).get(this.currentSession?.id, `%"${filePath}"%`);
    }
    
    if (!targetCheckpoint) {
      throw new Error(`No checkpoint found for file: ${filePath}`);
    }
    
    // Restore just this file
    const changes = this.db.prepare('SELECT * FROM file_changes WHERE checkpoint_id = ? AND file_path = ?').all(targetCheckpoint.id, filePath);
    for (const change of changes) {
      if (change.old_content !== null && change.old_content !== undefined) {
        const fullPath = path.join(this.projectPath, filePath);
        fs.writeFileSync(fullPath, change.old_content);
      }
    }
    
    this._logAudit('file_rollback', `Rolled back file: ${filePath}`, { checkpointId: targetCheckpoint.id, confirm: confirmMessage });
  }

  async rollbackArea(area, confirmMessage) {
    // Rollback all files in a functional area
    const files = this._getFilesInArea(area);
    
    for (const file of files) {
      await this.rollbackFile(file, null, confirmMessage);
    }
    
    this._logAudit('area_rollback', `Rolled back area: ${area}`, { files: files.length, confirm: confirmMessage });
  }

  // File protection
  async addProtection(filePath, mode) {
    const id = `prot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();
    
    this.db.prepare(`
      INSERT OR REPLACE INTO protected_files (id, file_path, mode, created_at)
      VALUES (?, ?, ?, ?)
    `).run(id, filePath, mode, now);
    
    this._logAudit('protection_add', `Added protection: ${filePath} (${mode})`);
  }

  async removeProtection(filePath) {
    this.db.prepare('DELETE FROM protected_files WHERE file_path = ?').run(filePath);
    this._logAudit('protection_remove', `Removed protection: ${filePath}`);
  }

  async listProtected() {
    return this.db.prepare('SELECT * FROM protected_files ORDER BY created_at DESC').all();
  }

  // Audit log
  async getAuditLog(limit = 50) {
    return this.db.prepare(`
      SELECT * FROM audit_log 
      WHERE session_id = ? OR session_id IS NULL
      ORDER BY created_at DESC LIMIT ?
    `).all(this.currentSession?.id, limit);
  }

  async traceCommit(commitHash) {
    // Trace all changes related to a commit
    const checkpoints = this.db.prepare(`
      SELECT * FROM checkpoints WHERE git_commit = ?
    `).all(commitHash);
    
    const trace = [];
    for (const cp of checkpoints) {
      const changes = this.db.prepare('SELECT * FROM file_changes WHERE checkpoint_id = ?').all(cp.id);
      trace.push({ checkpoint: cp, changes });
    }
    
    return trace;
  }

  async generateReport() {
    const session = this.currentSession ? 
      this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(this.currentSession.id) : null;
    
    const checkpoints = session ? 
      this.db.prepare('SELECT * FROM checkpoints WHERE session_id = ?').all(session.id) : [];
    
    const auditLog = await this.getAuditLog(100);
    
    return {
      session,
      checkpointCount: checkpoints.length,
      totalFilesChanged: checkpoints.reduce((sum, cp) => sum + JSON.parse(cp.files_changed || '[]').length, 0),
      auditEvents: auditLog.length,
      recentActivity: auditLog.slice(0, 10)
    };
  }

  // Verification
  async verify(options = {}) {
    const results = { passed: true, checks: [] };
    
    if (options.tests) {
      try {
        const testCommand = options.pattern ? `npm test -- ${options.pattern}` : 'npm test';
        execSync(testCommand, { cwd: this.projectPath, stdio: 'pipe', encoding: 'utf8' });
        results.checks.push({ type: 'tests', passed: true });
      } catch (e) {
        results.checks.push({ type: 'tests', passed: false, error: e.message });
        results.passed = false;
      }
    }
    
    if (options.linter) {
      try {
        execSync('npm run lint', { cwd: this.projectPath, stdio: 'pipe', encoding: 'utf8' });
        results.checks.push({ type: 'linter', passed: true });
      } catch (e) {
        results.checks.push({ type: 'linter', passed: false, error: e.message });
        results.passed = false;
      }
    }
    
    return results;
  }

  // Emergency recovery
  async emergencyRestore() {
    // Find last known good checkpoint (with all verifications passed)
    const checkpoints = this.db.prepare(`
      SELECT * FROM checkpoints WHERE session_id = ? ORDER BY created_at DESC
    `).all(this.currentSession?.id);
    
    for (const cp of checkpoints) {
      // Check if this checkpoint has a good git commit
      if (cp.git_commit) {
        try {
          execSync(`git checkout ${cp.git_commit}`, { cwd: this.projectPath, stdio: 'pipe' });
          this._logAudit('emergency_restore', `Emergency restore to commit: ${cp.git_commit}`);
          return;
        } catch (e) {
          continue;
        }
      }
    }
    
    throw new Error('No recoverable checkpoint found');
  }

  async restoreToTime(time) {
    const targetTime = new Date(time).getTime();
    const checkpoint = this.db.prepare(`
      SELECT * FROM checkpoints 
      WHERE session_id = ? AND created_at <= ?
      ORDER BY created_at DESC LIMIT 1
    `).get(this.currentSession?.id, targetTime);
    
    if (!checkpoint) {
      throw new Error(`No checkpoint found before: ${time}`);
    }
    
    await this.restoreCheckpoint(checkpoint.id);
  }

  // Private methods
  _startWatcher() {
    if (this.watcher) return;
    
    this.watcher = chokidar.watch(this.projectPath, {
      ignored: ['**/node_modules/**', '**/.git/**', '**/.cursorguard/**', '**/dist/**', '**/build/**'],
      persistent: true
    });
    
    this.watcher.on('change', (filePath) => this._onFileChange(filePath, 'modified'));
    this.watcher.on('add', (filePath) => this._onFileChange(filePath, 'added'));
    this.watcher.on('unlink', (filePath) => this._onFileChange(filePath, 'deleted'));
  }

  _stopWatcher() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  _onFileChange(filePath, changeType) {
    if (!this.currentSession) return;
    
    // Check if file is protected
    const relativePath = path.relative(this.projectPath, filePath);
    const protection = this.db.prepare('SELECT * FROM protected_files WHERE file_path = ?').get(relativePath);
    
    if (protection && protection.mode === 'readonly') {
      console.warn(`⚠️  Attempted to modify readonly file: ${relativePath}`);
      // Could revert immediately here
    }
  }

  _getChangedSinceLastCheckpoint() {
    // Simplified - in reality would track changes since last checkpoint
    try {
      const status = execSync('git status --porcelain', { cwd: this.projectPath, encoding: 'utf8' });
      return status.trim().split('\n')
        .filter(line => line.trim())
        .map(line => line.substring(3).trim());
    } catch (e) {
      return [];
    }
  }

  _generateDiffSummary(files) {
    if (!files.length) return 'No changes';
    return `${files.length} file(s) changed: ${files.slice(0, 5).join(', ')}${files.length > 5 ? '...' : ''}`;
  }

  async _recordFileChange(checkpointId, filePath) {
    const fullPath = path.join(this.projectPath, filePath);
    const id = `fc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();
    
    let changeType = 'modified';
    let oldContent = null;
    let newContent = null;
    let diff = '';
    
    if (fs.existsSync(fullPath)) {
      newContent = fs.readFileSync(fullPath, 'utf8');
      // Try to get old content from git
      try {
        oldContent = execSync(`git show HEAD:${filePath}`, { cwd: this.projectPath, encoding: 'utf8' });
        diff = Diff.createPatch(filePath, oldContent, newContent);
      } catch (e) {
        changeType = 'added';
      }
    } else {
      changeType = 'deleted';
      try {
        oldContent = execSync(`git show HEAD:${filePath}`, { cwd: this.projectPath, encoding: 'utf8' });
        diff = Diff.createPatch(filePath, oldContent, '');
      } catch (e) {
        // File was never committed
      }
    }
    
    // Check protection
    const protection = this.db.prepare('SELECT * FROM protected_files WHERE file_path = ?').get(filePath);
    
    this.db.prepare(`
      INSERT INTO file_changes (id, checkpoint_id, file_path, change_type, old_content, new_content, diff, protected)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, checkpointId, filePath, changeType, oldContent, newContent, diff, protection ? 1 : 0);
  }

  _getFilesInArea(area) {
    // Define functional areas
    const areas = {
      'authentication': ['src/auth/**', 'src/middleware/auth**'],
      'api': ['src/routes/**', 'src/controllers/**', 'src/api/**'],
      'database': ['src/models/**', 'src/db/**', 'migrations/**'],
      'frontend': ['src/components/**', 'src/pages/**', 'src/views/**'],
      'testing': ['**/*.test.*', '**/*.spec.*', 'tests/**'],
      'config': ['config/**', '*.config.*', '.env*']
    };
    
    const patterns = areas[area] || [area];
    const files = new Set();
    
    for (const pattern of patterns) {
      // Simple glob matching
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
      const allFiles = this._getAllTrackedFiles();
      for (const file of allFiles) {
        if (regex.test(file)) files.add(file);
      }
    }
    
    return Array.from(files);
  }

  _getAllTrackedFiles() {
    try {
      const output = execSync('git ls-files', { cwd: this.projectPath, encoding: 'utf8' });
      return output.trim().split('\n').filter(f => f.trim());
    } catch (e) {
      return [];
    }
  }

  _logAudit(eventType, description, metadata = {}) {
    const id = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();
    
    this.db.prepare(`
      INSERT INTO audit_log (id, session_id, event_type, description, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, this.currentSession?.id, eventType, description, JSON.stringify(metadata), now);
  }

  close() {
    this._stopWatcher();
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = { GuardCore };