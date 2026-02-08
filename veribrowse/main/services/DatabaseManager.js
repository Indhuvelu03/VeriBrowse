import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';

const dbPath = path.join(app.getPath('userData'), 'history.db');
const db = new Database(dbPath);

export function getStats() {
    const total = db.prepare('SELECT COUNT(*) as count FROM history').get();
    const today = db.prepare(`
    SELECT COUNT(*) as count FROM history 
    WHERE timestamp > ?
  `).get(Date.now() - 24 * 60 * 60 * 1000);

    const topSites = db.prepare(`
    SELECT url, title, visit_count 
    ORDER BY visit_count DESC 
    LIMIT 10
  `).all();

    return { total: total.count, today: today.count, topSites };
}

export function cleanup(daysToKeep = 30) {
    const cutoff = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
    const result = db.prepare('DELETE FROM history WHERE timestamp < ?').run(cutoff);
    db.prepare('VACUUM').run();
    return result.changes;
}

export function exportToJSON(outputPath) {
    const data = db.prepare('SELECT * FROM history ORDER BY timestamp DESC').all();
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    return data.length;
}

export function exportToCSV(outputPath) {
    const data = db.prepare('SELECT id, url, title, timestamp, visit_count FROM history ORDER BY timestamp DESC').all();
    const csv = [
        'ID,URL,Title,Timestamp,Visit Count',
        ...data.map(row => `${row.id},"${row.url}","${row.title || ''}",${row.timestamp},${row.visit_count}`)
    ].join('\n');
    fs.writeFileSync(outputPath, csv);
    return data.length;
}

export function backupDatabase() {
    const backupDir = path.join(app.getPath('userData'), 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const backupPath = path.join(backupDir, `history_${timestamp}.db`);
    fs.copyFileSync(dbPath, backupPath);
    return backupPath;
}

export function optimize() {
    db.prepare('ANALYZE').run();
    db.prepare('VACUUM').run();
    db.prepare('REINDEX').run();
    return true;
}

export default {
    getStats,
    cleanup,
    exportToJSON,
    exportToCSV,
    backupDatabase,
    optimize
};
