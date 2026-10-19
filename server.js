require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');
const QRCode = require('qrcode');
const path = require('path');

const {
  createLink, getLinkByCode, getLinkById, getAllLinks,
  updateLink, deleteLink, recordClick, incrementClickCount,
  getClicksForLink, getAnalyticsSummary, getClicksByDate, reportSuspicious,
} = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public/
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiter for API
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// ── Auth Middleware ─────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = req.headers['x-admin-token'] || req.headers['authorization'];
  if (!token || token !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized. Provide a valid x-admin-token header.' });
  }
  next();
}

// ── URL Validation ──────────────────────────────────────────────────────────
function isValidUrl(string) {
  try {
    const url = new URL(string);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidAlias(alias) {
  return /^[a-zA-Z0-9_-]{3,50}$/.test(alias);
}

// ── HTML Error Pages ────────────────────────────────────────────────────────
function errorPage(title, message, emoji = '😕') {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Link Pulse</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0F0F1A;color:#fff;font-family:'Inter',system-ui,sans-serif;text-align:center;padding:2rem}
.card{background:#1A1A2E;border-radius:16px;padding:3rem;max-width:480px;box-shadow:0 8px 32px rgba(108,92,231,.15)}
.emoji{font-size:4rem;margin-bottom:1rem}.title{font-size:1.5rem;margin-bottom:.75rem;color:#6C5CE7}
.msg{color:#A0A0B8;line-height:1.6;margin-bottom:1.5rem}
a{color:#00D2D3;text-decoration:none}a:hover{text-decoration:underline}</style></head>
<body><div class="card"><div class="emoji">${emoji}</div><h1 class="title">${title}</h1><p class="msg">${message}</p><a href="/">← Back to Link Pulse</a></div></body></html>`;
}

function passwordPage(code) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Password Required — Link Pulse</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0F0F1A;color:#fff;font-family:'Inter',system-ui,sans-serif;padding:2rem}
.card{background:#1A1A2E;border-radius:16px;padding:3rem;max-width:480px;width:100%;box-shadow:0 8px 32px rgba(108,92,231,.15)}
.emoji{font-size:3rem;text-align:center;margin-bottom:1rem}.title{font-size:1.5rem;margin-bottom:.5rem;text-align:center;color:#6C5CE7}
.msg{color:#A0A0B8;text-align:center;margin-bottom:1.5rem;font-size:.9rem}
input{width:100%;padding:.875rem 1rem;border:2px solid #2a2a4a;border-radius:8px;background:#16213E;color:#fff;font-size:1rem;margin-bottom:1rem;outline:none;transition:border-color .2s}
input:focus{border-color:#6C5CE7}
button{width:100%;padding:.875rem;border:none;border-radius:8px;background:linear-gradient(135deg,#6C5CE7,#a855f7);color:#fff;font-size:1rem;font-weight:600;cursor:pointer;transition:opacity .2s}
button:hover{opacity:.9}.error{color:#FF6B6B;text-align:center;margin-bottom:1rem;display:none;font-size:.875rem}
a{color:#00D2D3;text-decoration:none;display:block;text-align:center;margin-top:1rem;font-size:.875rem}</style></head>
<body><div class="card"><div class="emoji">🔒</div><h1 class="title">Password Required</h1><p class="msg">This link is password-protected. Enter the password to continue.</p>
<div class="error" id="err"></div>
<form id="f"><input type="password" name="password" placeholder="Enter password" required autocomplete="off"><button type="submit">Unlock Link</button></form>
<a href="/">← Back to Link Pulse</a></div>
<script>document.getElementById('f').addEventListener('submit',async e=>{e.preventDefault();const pw=e.target.password.value;const errEl=document.getElementById('err');errEl.style.display='none';
try{const r=await fetch('/api/links/${code}/verify-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pw})});
const d=await r.json();if(d.redirect_url){window.location.href=d.redirect_url}else{errEl.textContent=d.error||'Wrong password';errEl.style.display='block'}}
catch{errEl.textContent='Something went wrong';errEl.style.display='block'}});</script></body></html>`;
}

// ── API Routes ──────────────────────────────────────────────────────────────
const api = express.Router();
api.use(apiLimiter);

// Public endpoint — summary (limited info for landing page)
api.get('/analytics/summary-public', (req, res) => {
  try {
    const summary = getAnalyticsSummary();
    res.json({ totalLinks: summary.totalLinks, totalClicks: summary.totalClicks });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch summary.' });
  }
});

// Password verification (public)
api.post('/links/:code/verify-password', (req, res) => {
  try {
    const link = getLinkByCode(req.params.code);
    if (!link) return res.status(404).json({ error: 'Link not found.' });
    if (!link.password_hash) return res.json({ redirect_url: link.original_url });

    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password is required.' });

    const valid = bcrypt.compareSync(password, link.password_hash);
    if (!valid) return res.status(403).json({ error: 'Incorrect password.' });

    // Record click and redirect
    recordClick(link.id, {
      referrer: req.headers.referer || req.headers.referrer,
      user_agent: req.headers['user-agent'],
      ip: req.ip,
    });
    incrementClickCount(link.id);

    res.json({ redirect_url: link.original_url });
  } catch (err) {
    res.status(500).json({ error: 'Verification failed.' });
  }
});

// Create link (public - rate-limited)
api.post('/links', (req, res) => {
  try {
    let { url, custom_alias, title, campaign_tag, password, click_limit, expires_at } = req.body;

    if (!url) return res.status(400).json({ error: 'URL is required.' });
    if (!isValidUrl(url)) return res.status(400).json({ error: 'Invalid URL. Must start with http:// or https://.' });

    let short_code;
    if (custom_alias) {
      if (!isValidAlias(custom_alias)) {
        return res.status(400).json({ error: 'Alias must be 3-50 characters, alphanumeric, hyphens, or underscores.' });
      }
      const existing = getLinkByCode(custom_alias);
      if (existing) return res.status(409).json({ error: 'Alias already taken.' });
      short_code = custom_alias;
    } else {
      short_code = nanoid(7);
    }

    let password_hash = null;
    if (password) {
      password_hash = bcrypt.hashSync(password, 10);
    }

    const link = createLink({
      original_url: url,
      short_code,
      custom_alias: custom_alias || null,
      title,
      campaign_tag,
      password_hash,
      click_limit: click_limit ? parseInt(click_limit) : null,
      expires_at: expires_at || null,
    });

    res.status(201).json({
      ...link,
      short_url: `${BASE_URL}/${link.custom_alias || link.short_code}`,
    });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Short code collision. Please try again.' });
    }
    res.status(500).json({ error: 'Failed to create link.' });
  }
});

// QR Code (public)
api.get('/links/:id/qr', (req, res) => {
  try {
    const link = getLinkById(parseInt(req.params.id));
    if (!link) return res.status(404).json({ error: 'Link not found.' });

    const shortUrl = `${BASE_URL}/${link.custom_alias || link.short_code}`;
    QRCode.toDataURL(shortUrl, {
      width: 400,
      margin: 2,
      color: { dark: '#0F0F1A', light: '#FFFFFF' },
    }, (err, dataUrl) => {
      if (err) return res.status(500).json({ error: 'QR generation failed.' });
      res.json({ qr: dataUrl, url: shortUrl });
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR code.' });
  }
});

// Report suspicious (public)
api.post('/links/:id/report', (req, res) => {
  try {
    const link = reportSuspicious(parseInt(req.params.id));
    if (!link) return res.status(404).json({ error: 'Link not found.' });
    res.json({ message: 'Link reported as suspicious.', link });
  } catch (err) {
    res.status(500).json({ error: 'Failed to report link.' });
  }
});

// ── Protected API Routes (require admin token) ──────────────────────────────
api.use(requireAuth);

// List links
api.get('/links', (req, res) => {
  try {
    const { search, status, tag } = req.query;
    const links = getAllLinks(search, status, tag);
    const enriched = links.map(l => ({
      ...l,
      short_url: `${BASE_URL}/${l.custom_alias || l.short_code}`,
    }));
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch links.' });
  }
});

// Get single link
api.get('/links/:id', (req, res) => {
  try {
    const link = getLinkById(parseInt(req.params.id));
    if (!link) return res.status(404).json({ error: 'Link not found.' });
    res.json({ ...link, short_url: `${BASE_URL}/${link.custom_alias || link.short_code}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch link.' });
  }
});

// Update link
api.put('/links/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = getLinkById(id);
    if (!existing) return res.status(404).json({ error: 'Link not found.' });

    const data = { ...req.body };
    if (data.password) {
      data.password_hash = bcrypt.hashSync(data.password, 10);
      delete data.password;
    }
    if (data.password === '') {
      data.password_hash = null;
      delete data.password;
    }

    const updated = updateLink(id, data);
    res.json({ ...updated, short_url: `${BASE_URL}/${updated.custom_alias || updated.short_code}` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update link.' });
  }
});

// Delete link
api.delete('/links/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = getLinkById(id);
    if (!existing) return res.status(404).json({ error: 'Link not found.' });
    deleteLink(id);
    res.json({ message: 'Link deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete link.' });
  }
});

// Get clicks for a link
api.get('/links/:id/clicks', (req, res) => {
  try {
    const clicks = getClicksForLink(parseInt(req.params.id));
    res.json(clicks);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch clicks.' });
  }
});

// Analytics summary
api.get('/analytics/summary', (req, res) => {
  try {
    const summary = getAnalyticsSummary();
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch analytics.' });
  }
});

// Clicks by date
api.get('/analytics/clicks-by-date', (req, res) => {
  try {
    const { link_id, days } = req.query;
    const data = getClicksByDate(link_id ? parseInt(link_id) : null, days ? parseInt(days) : 30);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch click trends.' });
  }
});

// Mount API
app.use('/api', api);

// ── Page Routes ─────────────────────────────────────────────────────────────
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// ── Redirect Handler (MUST be last) ────────────────────────────────────────
app.get('/:code', (req, res) => {
  try {
    const code = req.params.code;

    // Skip common file requests
    if (code.includes('.') || code === 'favicon.ico') {
      return res.status(404).send('Not found');
    }

    const link = getLinkByCode(code);

    if (!link) {
      return res.status(404).send(errorPage('Link Not Found', 'This short link doesn\'t exist or has been removed.', '🔍'));
    }

    // Check if disabled
    if (!link.is_active) {
      return res.status(410).send(errorPage('Link Disabled', 'This link has been disabled by its owner.', '🚫'));
    }

    // Check expiration
    if (link.expires_at && new Date(link.expires_at) <= new Date()) {
      return res.status(410).send(errorPage('Link Expired', 'This link has expired and is no longer available.', '⏰'));
    }

    // Check click limit
    if (link.click_limit && link.click_count >= link.click_limit) {
      return res.status(410).send(errorPage('Click Limit Reached', 'This link has reached its maximum number of clicks.', '📊'));
    }

    // Check password protection
    if (link.password_hash) {
      return res.send(passwordPage(code));
    }

    // Record click
    recordClick(link.id, {
      referrer: req.headers.referer || req.headers.referrer,
      user_agent: req.headers['user-agent'],
      ip: req.ip,
    });
    incrementClickCount(link.id);

    // Safe redirect — only to http/https
    const target = link.original_url;
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      return res.status(400).send(errorPage('Invalid Redirect', 'This link points to an invalid URL.', '⚠️'));
    }

    res.redirect(302, target);
  } catch (err) {
    res.status(500).send(errorPage('Server Error', 'Something went wrong. Please try again.', '💥'));
  }
});

// ── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`⚡ Link Pulse running at ${BASE_URL}`);
  console.log(`   Admin password: ${ADMIN_PASSWORD}`);
});
