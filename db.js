const { Pool } = require('pg');
const crypto = require('crypto');

// Read Neon PostgreSQL connection string from environment
const connectionString = process.env.DATABASE_URL;

let pool;

if (connectionString) {
  const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
  pool = new Pool({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
} else {
  console.warn('⚠️  DATABASE_URL environment variable is not set.');
  console.warn('   Using in-memory PostgreSQL emulator for local development/testing.');
  console.warn('   For production, set DATABASE_URL=postgresql://user:pass@ep-xyz.neon.tech/neondb?sslmode=require');
  const { newDb } = require('pg-mem');
  const mem = newDb({ noAstCoverageCheck: true });
  const pgAdapter = mem.adapters.createPg();
  pool = new pgAdapter.Pool();
}

// ── Schema Initialization ───────────────────────────────────────────────────
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS links (
      id            SERIAL PRIMARY KEY,
      original_url  TEXT    NOT NULL,
      short_code    VARCHAR(100) UNIQUE NOT NULL,
      custom_alias  VARCHAR(100) UNIQUE,
      title         TEXT,
      campaign_tag  VARCHAR(100),
      password_hash TEXT,
      is_active     INTEGER DEFAULT 1,
      click_limit   INTEGER,
      click_count   INTEGER DEFAULT 0,
      expires_at    TIMESTAMPTZ,
      is_suspicious INTEGER DEFAULT 0,
      created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clicks (
      id         SERIAL PRIMARY KEY,
      link_id    INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
      clicked_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      referrer   TEXT,
      user_agent TEXT,
      ip_hash    VARCHAR(64)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   VARCHAR(255) PRIMARY KEY,
      value TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_links_short_code   ON links(short_code);
    CREATE INDEX IF NOT EXISTS idx_links_custom_alias ON links(custom_alias);
    CREATE INDEX IF NOT EXISTS idx_clicks_link_id     ON clicks(link_id);
    CREATE INDEX IF NOT EXISTS idx_clicks_clicked_at  ON clicks(clicked_at);
  `);
}

// Trigger table creation on load
const initPromise = initDB().catch((err) => {
  console.error('❌ Failed to initialize database tables:', err.message);
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function hashIP(ip) {
  if (!ip) return null;
  return crypto.createHash('sha256').update(ip + (process.env.SESSION_SECRET || 'salt')).digest('hex').slice(0, 16);
}

async function createLink({ original_url, short_code, custom_alias, title, campaign_tag, password_hash, click_limit, expires_at }) {
  await initPromise;
  const res = await pool.query(
    `INSERT INTO links (original_url, short_code, custom_alias, title, campaign_tag, password_hash, click_limit, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      original_url,
      short_code,
      custom_alias || null,
      title || null,
      campaign_tag || null,
      password_hash || null,
      click_limit ? parseInt(click_limit) : null,
      expires_at && String(expires_at).trim() !== '' ? new Date(expires_at) : null,
    ]
  );
  return res.rows[0];
}

async function getLinkByCode(code) {
  await initPromise;
  const res = await pool.query(
    'SELECT * FROM links WHERE short_code = $1 OR custom_alias = $1',
    [code]
  );
  return res.rows[0] || null;
}

async function getLinkById(id) {
  await initPromise;
  const res = await pool.query('SELECT * FROM links WHERE id = $1', [Number(id)]);
  return res.rows[0] || null;
}

async function getAllLinks(search, status, tag) {
  await initPromise;
  let sql = 'SELECT * FROM links WHERE 1=1';
  const params = [];
  let paramIndex = 1;

  if (search) {
    sql += ` AND (original_url ILIKE $${paramIndex} OR short_code ILIKE $${paramIndex} OR title ILIKE $${paramIndex} OR custom_alias ILIKE $${paramIndex})`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  if (status === 'active') {
    sql += ` AND is_active = 1 AND (expires_at IS NULL OR expires_at > $${paramIndex})`;
    params.push(new Date());
    paramIndex++;
  } else if (status === 'expired') {
    sql += ` AND expires_at IS NOT NULL AND expires_at <= $${paramIndex}`;
    params.push(new Date());
    paramIndex++;
  } else if (status === 'disabled') {
    sql += ' AND is_active = 0';
  } else if (status === 'suspicious') {
    sql += ' AND is_suspicious = 1';
  }

  if (tag) {
    sql += ` AND campaign_tag = $${paramIndex}`;
    params.push(tag);
    paramIndex++;
  }

  sql += ' ORDER BY created_at DESC';
  const res = await pool.query(sql, params);
  return res.rows;
}

async function updateLink(id, data) {
  await initPromise;
  const fields = [];
  const params = [];
  let paramIndex = 1;

  const allowed = ['title', 'campaign_tag', 'is_active', 'click_limit', 'expires_at', 'password_hash', 'original_url', 'custom_alias'];

  for (const key of allowed) {
    if (data[key] !== undefined) {
      let val = data[key];
      if (key === 'expires_at') {
        val = val && String(val).trim() !== '' ? new Date(val) : null;
      }
      fields.push(`${key} = $${paramIndex}`);
      params.push(val);
      paramIndex++;
    }
  }

  if (fields.length === 0) return getLinkById(id);

  fields.push('updated_at = CURRENT_TIMESTAMP');
  params.push(Number(id));

  const res = await pool.query(
    `UPDATE links SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    params
  );
  return res.rows[0];
}

async function deleteLink(id) {
  await initPromise;
  const res = await pool.query('DELETE FROM links WHERE id = $1', [Number(id)]);
  return res.rowCount > 0;
}

async function recordClick(linkId, { referrer, user_agent, ip }) {
  await initPromise;
  await pool.query(
    'INSERT INTO clicks (link_id, referrer, user_agent, ip_hash) VALUES ($1, $2, $3, $4)',
    [Number(linkId), referrer || null, user_agent || null, hashIP(ip)]
  );
}

async function incrementClickCount(linkId) {
  await initPromise;
  await pool.query(
    'UPDATE links SET click_count = click_count + 1 WHERE id = $1',
    [Number(linkId)]
  );
}

async function getClicksForLink(linkId) {
  await initPromise;
  const res = await pool.query(
    'SELECT id, clicked_at, referrer, user_agent FROM clicks WHERE link_id = $1 ORDER BY clicked_at DESC LIMIT 500',
    [Number(linkId)]
  );
  return res.rows;
}

async function getAnalyticsSummary() {
  await initPromise;
  const now = new Date();
  const totalLinksRes = await pool.query('SELECT COUNT(*)::int as count FROM links');
  const totalClicksRes = await pool.query('SELECT COALESCE(SUM(click_count), 0)::int as count FROM links');
  const activeLinksRes = await pool.query(
    'SELECT COUNT(*)::int as count FROM links WHERE is_active = 1 AND (expires_at IS NULL OR expires_at > $1)',
    [now]
  );
  const suspiciousLinksRes = await pool.query('SELECT COUNT(*)::int as count FROM links WHERE is_suspicious = 1');
  const topLinksRes = await pool.query('SELECT id, short_code, custom_alias, original_url, title, click_count FROM links ORDER BY click_count DESC LIMIT 5');

  return {
    totalLinks: Number(totalLinksRes.rows[0]?.count || 0),
    totalClicks: Number(totalClicksRes.rows[0]?.count || 0),
    activeLinks: Number(activeLinksRes.rows[0]?.count || 0),
    suspiciousLinks: Number(suspiciousLinksRes.rows[0]?.count || 0),
    topLinks: topLinksRes.rows,
  };
}

async function getClicksByDate(linkId, days = 30) {
  await initPromise;
  const cutoff = new Date(Date.now() - (Number(days) || 30) * 24 * 60 * 60 * 1000);
  let res;

  if (linkId) {
    res = await pool.query(
      `SELECT CAST(clicked_at AS DATE) as date, COUNT(*)::int as count
       FROM clicks
       WHERE link_id = $1 AND clicked_at >= $2
       GROUP BY CAST(clicked_at AS DATE)
       ORDER BY date ASC`,
      [Number(linkId), cutoff]
    );
  } else {
    res = await pool.query(
      `SELECT CAST(clicked_at AS DATE) as date, COUNT(*)::int as count
       FROM clicks
       WHERE clicked_at >= $1
       GROUP BY CAST(clicked_at AS DATE)
       ORDER BY date ASC`,
      [cutoff]
    );
  }

  return res.rows.map((r) => {
    let dateStr;
    if (r.date instanceof Date) {
      dateStr = r.date.toISOString().split('T')[0];
    } else {
      dateStr = String(r.date).split('T')[0];
    }
    return { date: dateStr, count: Number(r.count) };
  });
}

async function reportSuspicious(linkId) {
  await initPromise;
  const res = await pool.query(
    'UPDATE links SET is_suspicious = 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
    [Number(linkId)]
  );
  return res.rows[0];
}

module.exports = {
  pool,
  initDB,
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
