import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = join(__dirname, '../data/database.sqlite');

export class Database {
  constructor() {
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('数据库连接失败:', err.message);
      } else {
        this.initTables();
      }
    });
  }

  initTables() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS platformAuth (
        platform TEXT PRIMARY KEY,
        cookie TEXT,
        token TEXT,
        enabled INTEGER DEFAULT 1,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS streamers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL,
        roomId TEXT NOT NULL,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        remark TEXT,
        isLive INTEGER DEFAULT 0,
        liveTitle TEXT,
        lastLiveTime TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS lightTasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        streamerId INTEGER NOT NULL,
        currentExp INTEGER DEFAULT 0,
        targetExp INTEGER DEFAULT 100,
        taskProgress TEXT DEFAULT '{}',
        lastUpdateTime TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (streamerId) REFERENCES streamers(id) ON DELETE CASCADE
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS liveAlerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        streamerId INTEGER NOT NULL,
        enabled INTEGER DEFAULT 1,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (streamerId) REFERENCES streamers(id) ON DELETE CASCADE
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS liveHistory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        streamerId INTEGER NOT NULL,
        title TEXT,
        startTime TEXT,
        endTime TEXT,
        FOREIGN KEY (streamerId) REFERENCES streamers(id) ON DELETE CASCADE
      )
    `);
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async addStreamer(data) {
    const { platform, roomId, name, url, remark } = data;
    const result = await this.run(
      'INSERT INTO streamers (platform, roomId, name, url, remark) VALUES (?, ?, ?, ?, ?)',
      [platform, roomId, name, url || '', remark || '']
    );
    await this.run(
      'INSERT INTO lightTasks (streamerId) VALUES (?)',
      [result.lastID]
    );
    await this.run(
      'INSERT INTO liveAlerts (streamerId) VALUES (?)',
      [result.lastID]
    );
    return result.lastID;
  }

  async updateStreamer(id, data) {
    const { platform, roomId, name, url, remark } = data;
    await this.run(
      'UPDATE streamers SET platform=?, roomId=?, name=?, url=?, remark=?, updatedAt=CURRENT_TIMESTAMP WHERE id=?',
      [platform, roomId, name, url || '', remark || '', id]
    );
  }

  async deleteStreamer(id) {
    await this.run('DELETE FROM streamers WHERE id=?', [id]);
  }

  async getStreamers() {
    const streamers = await this.all('SELECT * FROM streamers ORDER BY updatedAt DESC');
    return streamers;
  }

  async getStreamer(id) {
    return await this.get('SELECT * FROM streamers WHERE id=?', [id]);
  }

  async updateLiveStatus(id, isLive, liveTitle = '') {
    await this.run(
      'UPDATE streamers SET isLive=?, liveTitle=?, lastLiveTime=CURRENT_TIMESTAMP, updatedAt=CURRENT_TIMESTAMP WHERE id=?',
      [isLive, liveTitle, id]
    );
  }

  async getLightTask(streamerId) {
    return await this.get('SELECT * FROM lightTasks WHERE streamerId=?', [streamerId]);
  }

  async updateLightTask(streamerId, data) {
    const { currentExp, targetExp, taskProgress } = data;
    await this.run(
      'UPDATE lightTasks SET currentExp=?, targetExp=?, taskProgress=?, lastUpdateTime=CURRENT_TIMESTAMP WHERE streamerId=?',
      [currentExp, targetExp, JSON.stringify(taskProgress), streamerId]
    );
  }

  async getLiveAlert(streamerId) {
    return await this.get('SELECT * FROM liveAlerts WHERE streamerId=?', [streamerId]);
  }

  async updateLiveAlert(streamerId, enabled) {
    await this.run(
      'UPDATE liveAlerts SET enabled=? WHERE streamerId=?',
      [enabled, streamerId]
    );
  }

  async addLiveHistory(streamerId, title, startTime) {
    await this.run(
      'INSERT INTO liveHistory (streamerId, title, startTime) VALUES (?, ?, ?)',
      [streamerId, title, startTime]
    );
  }

  async updateLiveHistoryEndTime(streamerId, endTime) {
    await this.run(
      'UPDATE liveHistory SET endTime=? WHERE streamerId=? AND endTime IS NULL ORDER BY startTime DESC LIMIT 1',
      [endTime, streamerId]
    );
  }
}

export const db = new Database();