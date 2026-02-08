import db from './db.js';

db.exec(`
  CREATE TABLE IF NOT EXISTS ai_chat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    messages TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

function saveAIChatSession(sessionId, title, messages) {
  const existing = db.prepare('SELECT id FROM ai_chat_history WHERE session_id = ?').get(sessionId);
  
  if (existing) {
    db.prepare(`
      UPDATE ai_chat_history 
      SET title = ?, messages = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE session_id = ?
    `).run(title, JSON.stringify(messages), sessionId);
  } else {
    db.prepare(`
      INSERT INTO ai_chat_history (session_id, title, messages) 
      VALUES (?, ?, ?)
    `).run(sessionId, title, JSON.stringify(messages));
  }
}

function getAIChatHistory() {
  return db.prepare('SELECT * FROM ai_chat_history ORDER BY updated_at DESC').all();
}

function getAIChatSession(sessionId) {
  return db.prepare('SELECT * FROM ai_chat_history WHERE session_id = ?').get(sessionId);
}

function deleteAIChatSession(sessionId) {
  db.prepare('DELETE FROM ai_chat_history WHERE session_id = ?').run(sessionId);
}

export {
  saveAIChatSession,
  getAIChatHistory,
  getAIChatSession,
  deleteAIChatSession,
};
