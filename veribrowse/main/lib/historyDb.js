const db = require('./db');

db.exec(`
  CREATE TABLE IF NOT EXISTS search_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    title TEXT,
    query TEXT,
    visit_count INTEGER DEFAULT 1,
    last_visit DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

function saveSearchHistory(url, title, query) {
  const existing = db.prepare('SELECT id, visit_count FROM search_history WHERE url = ?').get(url);
  
  if (existing) {
    db.prepare(`
      UPDATE search_history 
      SET visit_count = ?, last_visit = CURRENT_TIMESTAMP, title = ?, query = ?
      WHERE id = ?
    `).run(existing.visit_count + 1, title, query, existing.id);
  } else {
    db.prepare(`
      INSERT INTO search_history (url, title, query) 
      VALUES (?, ?, ?)
    `).run(url, title, query);
  }
}

function getSearchHistory(limit = 100) {
  return db.prepare(`
    SELECT * FROM search_history 
    ORDER BY last_visit DESC 
    LIMIT ?
  `).all(limit);
}

function deleteSearchHistoryItem(id) {
  db.prepare('DELETE FROM search_history WHERE id = ?').run(id);
}

function clearSearchHistory() {
  db.prepare('DELETE FROM search_history').run();
}

module.exports = {
  saveSearchHistory,
  getSearchHistory,
  deleteSearchHistoryItem,
  clearSearchHistory,
};
