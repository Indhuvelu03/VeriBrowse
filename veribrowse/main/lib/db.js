import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

const dbPath = path.join(app.getPath('userData'), 'veribrowse.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

export default db;
