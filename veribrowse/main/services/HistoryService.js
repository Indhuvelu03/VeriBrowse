import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

const dbPath = path.join(app.getPath('userData'), 'history.db');
const db = new Database(dbPath);

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    title TEXT,
    content_snapshot TEXT,
    timestamp INTEGER NOT NULL,
    visit_count INTEGER DEFAULT 1,
    session_id TEXT,
    mission_context TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_timestamp ON history(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_url ON history(url);
  CREATE INDEX IF NOT EXISTS idx_session ON history(session_id);
`);

class HistoryService {
  constructor() {
    this.db = db;
    this.currentSessionId = Date.now().toString();
  }

  addEntry({ url, title, contentSnapshot = null, missionContext = null }) {
    if (!url || url.startsWith('app://') || url.startsWith('chrome://')) return;

    const timestamp = Date.now();

    // Check if URL exists in last 60 seconds (dedupe)
    const recent = this.db.prepare(`
      SELECT id, visit_count FROM history 
      WHERE url = ? AND timestamp > ? 
      ORDER BY timestamp DESC LIMIT 1
    `).get(url, timestamp - 60000);

    if (recent) {
      // Update existing entry
      this.db.prepare(`
        UPDATE history 
        SET timestamp = ?, visit_count = ?, title = COALESCE(?, title)
        WHERE id = ?
      `).run(timestamp, recent.visit_count + 1, title, recent.id);
    } else {
      // Insert new entry
      this.db.prepare(`
        INSERT INTO history (url, title, content_snapshot, timestamp, session_id, mission_context)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(url, title, contentSnapshot, timestamp, this.currentSessionId, missionContext);
    }

    // Cleanup old entries (keep last 10000)
    const count = this.db.prepare('SELECT COUNT(*) as count FROM history').get().count;
    if (count > 10000) {
      this.db.prepare(`
        DELETE FROM history WHERE id IN (
          SELECT id FROM history ORDER BY timestamp ASC LIMIT ?
        )
      `).run(count - 10000);
    }
  }

  getHistory(limit = 100) {
    return this.db.prepare(`
      SELECT * FROM history 
      ORDER BY timestamp DESC 
      LIMIT ?
    `).all(limit);
  }

  search(query, limit = 50) {
    if (!query) return this.getHistory(limit);

    const searchPattern = `%${query}%`;
    return this.db.prepare(`
      SELECT * FROM history 
      WHERE title LIKE ? OR url LIKE ? OR content_snapshot LIKE ?
      ORDER BY timestamp DESC 
      LIMIT ?
    `).all(searchPattern, searchPattern, searchPattern, limit);
  }

  // RAG: Retrieve relevant context for AI
  getRelevantContext(userQuery, limit = 5) {
    // Simple keyword-based retrieval (can be enhanced with embeddings later)
    const keywords = userQuery.toLowerCase().split(/\s+/).filter(w => w.length > 3);

    if (keywords.length === 0) {
      return this.getHistory(limit);
    }

    // Build dynamic query for keyword matching
    const conditions = keywords.map(() => `(title LIKE ? OR url LIKE ? OR content_snapshot LIKE ? OR mission_context LIKE ?)`).join(' OR ');
    const params = keywords.flatMap(kw => {
      const pattern = `%${kw}%`;
      return [pattern, pattern, pattern, pattern];
    });
    params.push(limit);

    return this.db.prepare(`
      SELECT *, 
        (SELECT COUNT(*) FROM history h2 WHERE h2.url = history.url) as relevance_score
      FROM history 
      WHERE ${conditions}
      ORDER BY relevance_score DESC, timestamp DESC 
      LIMIT ?
    `).all(...params);
  }

  // Get session history (for resuming tasks)
  getSessionHistory(sessionId = null) {
    const sid = sessionId || this.currentSessionId;
    return this.db.prepare(`
      SELECT * FROM history 
      WHERE session_id = ? 
      ORDER BY timestamp ASC
    `).all(sid);
  }

  // Get incomplete missions (those with mission_context but no follow-up in 24h)
  getIncompleteMissions() {
    const yesterday = Date.now() - 24 * 60 * 60 * 1000;
    return this.db.prepare(`
      SELECT DISTINCT mission_context, MAX(timestamp) as last_visit, url, title
      FROM history 
      WHERE mission_context IS NOT NULL 
        AND timestamp > ?
      GROUP BY mission_context
      ORDER BY last_visit DESC
    `).all(yesterday);
  }

  clear() {
    this.db.prepare('DELETE FROM history').run();
  }

  deleteById(id) {
    this.db.prepare('DELETE FROM history WHERE id = ?').run(id);
  }

  close() {
    this.db.close();
  }
}

export default new HistoryService();
