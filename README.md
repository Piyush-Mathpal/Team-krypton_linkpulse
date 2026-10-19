# ⚡ LINK PULSE — URL Shortener & Analytics Platform

> Built by **Team Krypton** for **Innovista Round 2**
>
> A high-performance, modern URL shortener and real-time analytics suite with QR generation, link privacy controls, password protection, and campaign tracking.

---

## 📖 Overview

**LINK PULSE** is a full-featured URL management platform engineered for speed, privacy, and actionable insights. Whether you are launching a marketing campaign, sharing resources with colleagues, or protecting sensitive content, Link Pulse gives you total control over your links.

### 🌟 Key Highlights
- **Instant Shortening**: Nanoid-powered collision-resistant 7-character short codes.
- **Custom Aliases**: Brand your links with custom memorable slugs.
- **Real-Time Analytics**: Built with Chart.js to visualize click trends, referrer sources, and timestamps.
- **Privacy & Security First**: IP addresses are SHA-256 hashed with salt before logging; zero plaintext passwords or sensitive tokens stored.
- **Security Features**: Built-in rate limiting, safe HTTP/HTTPS redirect validation, password-protected links with bcrypt verification, and community abuse reporting.
- **Link Controls**: Expiration dates, one-time or custom click limits, and instant enable/disable toggles.
- **QR Code Engine**: Downloadable, high-resolution QR codes generated on the fly for every shortened link.

---

## 🛠 Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | Vanilla Semantic HTML5, Modular CSS3 (Custom Design System & Glassmorphism), Vanilla ES6+ JavaScript |
| **Charts & Visuals** | Chart.js 4.x via CDN |
| **Backend** | Node.js, Express.js |
| **Database** | SQLite3 via `better-sqlite3` (with WAL mode & indexed queries) |
| **Security & Utilities** | `bcryptjs`, `helmet`, `cors`, `express-rate-limit`, `morgan`, `qrcode`, `nanoid` (v3) |

---

## 📁 Project Structure

```
├── .env.example              # Environment variable template
├── .env                      # Local environment configuration (gitignored)
├── .gitignore                # Comprehensive exclusions
├── package.json              # Project dependencies and npm scripts
├── db.js                     # SQLite schema, queries, indexing, IP hashing
├── server.js                 # Express application, routes, redirects, security
├── public/                   # Frontend assets
│   ├── index.html            # Premium SaaS landing page
│   ├── dashboard.html        # Analytics & link management workspace
│   ├── css/
│   │   ├── style.css         # Global design system & landing page styling
│   │   └── dashboard.css     # Management dashboard layout & components
│   └── js/
│       ├── api.js            # Modular frontend API communication client
│       ├── main.js           # Landing page interactions, copy, QR modals
│       └── dashboard.js      # Dashboard controller, Chart.js graphs, CRUD
└── README.md                 # Complete documentation & deployment guide
```

---

## 🚀 Quick Start (Local Setup)

### Prerequisites
- Node.js (v18 or higher recommended)
- npm (v8 or higher)

### Installation Steps

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/teamkrypton-linkpulse.git
   cd teamkrypton-linkpulse
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` as appropriate:
   ```ini
   PORT=3000
   BASE_URL=http://localhost:3000
   ADMIN_PASSWORD=admin123
   SESSION_SECRET=super_secret_session_salt
   ```

4. **Run the server:**
   - **Production Mode**:
     ```bash
     npm start
     ```
   - **Development Mode** (with nodemon):
     ```bash
     npm run dev
     ```

5. **Open in Browser:**
   - Landing Page: [http://localhost:3000](http://localhost:3000)
   - Admin Dashboard: [http://localhost:3000/dashboard](http://localhost:3000/dashboard) (Default password: `admin123`)

---

## 🔐 Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Port on which the HTTP server listens |
| `BASE_URL` | `http://localhost:3000` | Base URL used to formulate shortened redirect links |
| `ADMIN_PASSWORD` | `changeme` | Secret token used to access admin dashboard & link management |
| `SESSION_SECRET` | `changeme_session_secret` | Salt key used to securely hash incoming IP addresses |
| `DB_PATH` | `./linkpulse.db` | Path to persistent SQLite database file (Render persistent disk) |

---

## 📊 Features & Functional Walkthrough

### 1. Landing Page
- Instant URL shortening directly from the hero section.
- Automatic link copying to clipboard with live toast alerts.
- Pop-up QR Code generation with single-click PNG download.
- Mobile-first responsive navigation with hamburger drawer and smooth scrolling.
- Live public counters for total links and clicks created across the platform.

### 2. Admin & Link Manager Dashboard
- **Protected Workspace**: Authenticated via `x-admin-token` / admin password.
- **Overview Metrics**: Total links, total click volume, active links, and suspicious link tallies.
- **Interactive Chart**: 30-day click trends plotted with smooth gradient spline fills.
- **Link Manager Table**:
  - Live search by title, custom alias, or target URL (debounced).
  - Filter by link status (`Active`, `Expired`, `Disabled`, `Suspicious`) and campaign tag.
  - In-place editing: update title, campaign tag, active status, expiration timestamp, or click limits.
  - Delete with foreign-key cascade removal of recorded click events.
  - Community safety: flag abusive or suspicious links.

### 3. Smart Redirects & Link Controls
- **Standard Redirect**: 302 redirect with instant click registration.
- **Password-Protected**: Links challenge visitors with a sleek cryptographic unlock portal before revealing target.
- **Expiration Enforcement**: Gracefully serves custom 410 Expired page once expiry threshold passes.
- **Click Limit Caps**: Automatically shuts down link and serves Limit Reached page once quota is met.
- **Disable Switch**: Allows owners to immediately pause traffic without deleting historical data.

---

## 🌐 Live Production Deployment

### Recommended Deployment on Render.com

Because Link Pulse uses Express.js with SQLite persistence, it is designed for single-container hosting with persistent disk storage:

1. **Create a Web Service on Render:**
   - Repository: Connect your GitHub repository (`teamname-projectname`).
   - Environment: `Node`
   - Build Command: `npm install`
   - Start Command: `node server.js`
2. **Add Persistent Disk (Render Disks):**
   - Mount Path: `/var/data`
   - Set environment variable: `DB_PATH=/var/data/linkpulse.db`
3. **Set Environment Variables in Render Dashboard:**
   - `BASE_URL`: `https://your-service-name.onrender.com`
   - `ADMIN_PASSWORD`: A strong random admin password
   - `SESSION_SECRET`: A 32+ character random hex string
   - `PORT`: `10000` (Render default)
4. **Deploy:**
   - Trigger manual deploy or push to main branch.
   - Verify health at `https://your-service-name.onrender.com`.

---

## 👥 Team Krypton — Innovista Round 2

- **Team Name**: Team Krypton
- **Project**: Link Pulse
- **License**: MIT
