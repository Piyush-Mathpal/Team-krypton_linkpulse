const crypto = require('crypto');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'linkpulse.db');

let db;
try {
  const Database = require('better-sqlite3');
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
} catch {
  const { DatabaseSync } = require('node:sqlite');
  db = new DatabaseSync(DB_PATH);
  try {
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA foreign_keys = ON;');
  } catch {
    // pragma fallback
  }
}

// ── Schema ──────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS links (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    original_url  TEXT    NOT NULL,
    short_code    TEXT    UNIQUE NOT NULL,
    custom_alias  TEXT    UNIQUE,
    title         TEXT,
    campaign_tag  TEXT,
    password_hash TEXT,
    is_active     INTEGER DEFAULT 1,
    click_limit   INTEGER,
    click_count   INTEGER DEFAULT 0,
    expires_at    TEXT,
    is_suspicious INTEGER DEFAULT 0,
    created_at    TEXT    DEFAULT (datetime('now')),
    updated_at    TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS clicks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    link_id    INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
    clicked_at TEXT    DEFAULT (datetime('now')),
    referrer   TEXT,
    user_agent TEXT,
    ip_hash    TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_links_short_code   ON links(short_code);
  CREATE INDEX IF NOT EXISTS idx_links_custom_alias ON links(custom_alias);
  CREATE INDEX IF NOT EXISTS idx_clicks_link_id     ON clicks(link_id);
  CREATE INDEX IF NOT EXISTS idx_clicks_clicked_at  ON clicks(clicked_at);
`);

// ── Helpers ─────────────────────────────────────────────────────────────────

function hashIP(ip) {
  if (!ip) return null;
  return crypto.createHash('sha256').update(ip + (process.env.SESSION_SECRET || 'salt')).digest('hex').slice(0, 16);
}

function createLink({ original_url, short_code, custom_alias, title, campaign_tag, password_hash, click_limit, expires_at }) {
  const stmt = db.prepare(`
    INSERT INTO links (original_url, short_code, custom_alias, title, campaign_tag, password_hash, click_limit, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    original_url,
    short_code,
    custom_alias || null,
    title || null,
    campaign_tag || null,
    password_hash || null,
    click_limit || null,
    expires_at || null
  );
  const insertId = Number(result.lastInsertRowid);
  return db.prepare('SELECT * FROM links WHERE id = ?').get(insertId);
}

function getLinkByCode(code) {
  return db.prepare('SELECT * FROM links WHERE short_code = ? OR custom_alias = ?').get(code, code);
}

function getLinkById(id) {
  return db.prepare('SELECT * FROM links WHERE id = ?').get(Number(id));
}

function getAllLinks(search, status, tag) {
  let sql = 'SELECT * FROM links WHERE 1=1';
  const params = [];

  if (search) {
    sql += ' AND (original_url LIKE ? OR short_code LIKE ? OR title LIKE ? OR custom_alias LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }

  if (status === 'active') {
    sql += " AND is_active = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))";
  } else if (status === 'expired') {
    sql += " AND expires_at IS NOT NULL AND expires_at <= datetime('now')";
  } else if (status === 'disabled') {
    sql += ' AND is_active = 0';
  } else if (status === 'suspicious') {
    sql += ' AND is_suspicious = 1';
  }

  if (tag) {
    sql += ' AND campaign_tag = ?';
    params.push(tag);
  }

  sql += ' ORDER BY created_at DESC';
  return db.prepare(sql).all(...params);
}

function updateLink(id, data) {
  const fields = [];
  const params = [];
  const allowed = ['title', 'campaign_tag', 'is_active', 'click_limit', 'expires_at', 'password_hash', 'original_url', 'custom_alias'];

  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`);
      params.push(data[key]);
    }
  }

  if (fields.length === 0) return getLinkById(id);

  fields.push("updated_at = datetime('now')");
  params.push(Number(id));

  db.prepare(`UPDATE links SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  return getLinkById(id);
}

function deleteLink(id) {
  return db.prepare('DELETE FROM links WHERE id = ?').run(Number(id));
}

function recordClick(linkId, { referrer, user_agent, ip }) {
  const stmt = db.prepare('INSERT INTO clicks (link_id, referrer, user_agent, ip_hash) VALUES (?, ?, ?, ?)');
  stmt.run(Number(linkId), referrer || null, user_agent || null, hashIP(ip));
}

function incrementClickCount(linkId) {
  db.prepare('UPDATE links SET click_count = click_count + 1 WHERE id = ?').run(Number(linkId));
}

function getClicksForLink(linkId) {
  return db.prepare('SELECT id, clicked_at, referrer, user_agent FROM clicks WHERE link_id = ? ORDER BY clicked_at DESC LIMIT 500').all(Number(linkId));
}

function getAnalyticsSummary() {
  const totalLinks = Number(db.prepare('SELECT COUNT(*) as count FROM links').get().count);
  const totalClicks = Number(db.prepare('SELECT COALESCE(SUM(click_count), 0) as count FROM links').get().count);
  const activeLinks = Number(db.prepare("SELECT COUNT(*) as count FROM links WHERE is_active = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))").get().count);
  const suspiciousLinks = Number(db.prepare('SELECT COUNT(*) as count FROM links WHERE is_suspicious = 1').get().count);
  const topLinks = db.prepare('SELECT id, short_code, custom_alias, original_url, title, click_count FROM links ORDER BY click_count DESC LIMIT 5').all();

  return { totalLinks, totalClicks, activeLinks, suspiciousLinks, topLinks };
}

function getClicksByDate(linkId, days = 30) {
  let sql, params;

  if (linkId) {
    sql = `SELECT DATE(clicked_at) as date, COUNT(*) as count 
           FROM clicks 
           WHERE link_id = ? AND clicked_at >= datetime('now', ?) 
           GROUP BY DATE(clicked_at) 
           ORDER BY date ASC`;
    params = [Number(linkId), `-${days} days`];
  } else {
    sql = `SELECT DATE(clicked_at) as date, COUNT(*) as count 
           FROM clicks 
           WHERE clicked_at >= datetime('now', ?) 
           GROUP BY DATE(clicked_at) 
           ORDER BY date ASC`;
    params = [`-${days} days`];
  }

  const rows = db.prepare(sql).all(...params);
  return rows.map(r => ({ date: r.date, count: Number(r.count) }));
}

function reportSuspicious(linkId) {
  db.prepare("UPDATE links SET is_suspicious = 1, updated_at = datetime('now') WHERE id = ?").run(Number(linkId));
  return getLinkById(linkId);
}

module.exports = {
  db,
  createLink,
  getLinkByCode,
  getLinkById,
  getAllLinks,
  updateLink,
  deleteLink,
  recordClick,
  incrementClickCount,
  getClicksForLink,
  getAnalyticsSummary,
  getClicksByDate,
  reportSuspicious,
};
