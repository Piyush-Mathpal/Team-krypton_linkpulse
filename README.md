# ⚡ LINK PULSE — URL Shortener & Analytics Platform

> Built by **Team Krypton** for **Innovista Round 2**
>
> A high-performance, modern URL shortener and real-time analytics suite powered by **Neon Serverless PostgreSQL**, featuring instant short-code generation, downloadable QR codes, password protection, expiration controls, click limits, and campaign analytics.

---

## 📖 Overview

**LINK PULSE** is an enterprise-grade URL management platform engineered for speed, privacy, and actionable insights. Backed by **Neon PostgreSQL** with connection pooling and SSL, Link Pulse provides low-latency redirects and comprehensive analytics without the risks of ephemeral local file storage.

### 🌟 Key Highlights
- **Instant Shortening**: Nanoid-powered collision-resistant short codes.
- **Custom Aliases & Tags**: Brand links with custom slugs and organize them by campaign.
- **Neon PostgreSQL Persistence**: High-reliability serverless PostgreSQL database with automated table and index creation on startup.
- **Real-Time Analytics**: Built with Chart.js to visualize click trends, referrer sources, and timestamps.
- **Privacy & Security First**: IP addresses are SHA-256 hashed with salt before logging; zero plaintext passwords or sensitive tokens stored.
- **Security Features**: Rate limiting, safe HTTP/HTTPS redirect validation, password-protected links with bcrypt verification, and community abuse reporting.
- **Link Controls**: Expiration dates, one-time or custom click limits, and instant enable/disable toggles.
- **QR Code Engine**: Downloadable, high-resolution QR codes generated on the fly for every shortened link.

---

## 🛠 Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | Vanilla Semantic HTML5, Modular CSS3 (Custom Design System & Glassmorphism), Vanilla ES6+ JavaScript |
| **Charts & Visuals** | Chart.js 4.x via CDN |
| **Backend** | Node.js, Express.js |
| **Database** | **Neon PostgreSQL** via `pg` (with connection pooling, SSL, and automated schema migration) |
| **Security & Utilities** | `bcryptjs`, `helmet`, `cors`, `express-rate-limit`, `morgan`, `qrcode`, `nanoid` (v3) |

---

## 📁 Project Structure

```
├── .env.example              # Environment variable template with DATABASE_URL
├── .env                      # Local environment configuration (gitignored)
├── .gitignore                # Excludes secrets, node_modules, and local files
├── package.json              # Project dependencies and npm scripts (start, dev, test)
├── db.js                     # PostgreSQL connection pool, schema init & parameterized queries
├── server.js                 # Express server, route security, rate limiter, redirects
├── test-routes.js            # Automated 23-point integration test suite
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
   Edit `.env` to supply your Neon PostgreSQL connection string:
   ```ini
   BASE_URL=https://team-krypton-linkpulse.onrender.com
   ADMIN_PASSWORD=admin@123
   SESSION_SECRET=super_secret_session_salt
   DATABASE_URL=postgresql://username:password@ep-sample.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
   *(Note: If `DATABASE_URL` is omitted in local dev, Link Pulse automatically provides an in-memory PostgreSQL emulator so offline development and tests run seamlessly).*

4. **Run the Automated Test Suite:**
   ```bash
   npm test
   ```

5. **Start the server:**
   - **Production Mode**:
     ```bash
     npm start
     ```
   - **Development Mode** (with nodemon):
     ```bash
     npm run dev
     ```

6. **Open in Browser:**
   - Landing Page: [https://team-krypton-linkpulse.onrender.com/](https://team-krypton-linkpulse.onrender.com/)
   - Admin Dashboard: [https://team-krypton-linkpulse.onrender.com/dashboard](https://team-krypton-linkpulse.onrender.com/dashboard) *(Default password: `admin@123`)*

---

## 🔐 Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Port on which the HTTP server listens |
| `BASE_URL` | `http://localhost:3000` | Base URL used to formulate shortened redirect links |
| `ADMIN_PASSWORD` | `changeme` | Secret token used to access admin dashboard & link management |
| `SESSION_SECRET` | `changeme_session_secret` | Salt key used to securely hash incoming IP addresses |
| `DATABASE_URL` | `postgresql://...` | Connection string for Neon PostgreSQL database with SSL |

---

## 📊 Features & Functional Walkthrough

### 1. Landing Page
- Instant URL shortening directly from the hero section without prior authentication.
- Automatic link copying to clipboard with live toast alerts.
- Pop-up QR Code generation with single-click PNG download.
- Mobile-first responsive navigation with hamburger drawer and smooth scrolling.
- Live public counters for total links and clicks created across the platform.

### 2. Admin & Link Manager Dashboard
- **Protected Workspace**: Authenticated via `x-admin-token` / admin password.
- **Overview Metrics**: Real-time queries for total links, total click volume, active links, and suspicious link tallies.
- **Interactive Chart**: 30-day click trends plotted with smooth gradient spline fills via Chart.js.
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

## 🌐 Live Production Deployment (Render + Neon)

With Neon PostgreSQL, live deployment on Render is effortless and stateless:

1. **Provision Neon Database**:
   - Create a project on [Neon.tech](https://neon.tech).
   - Copy your connection string: `postgresql://user:password@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require`.

2. **Deploy on Render**:
   - Create a new **Web Service** on Render.
   - Connect your GitHub repository (`teamname-projectname`).
   - Environment: `Node`
   - Build Command: `npm install`
   - Start Command: `node server.js`

3. **Set Environment Variables in Render**:
   | Key | Value |
   |---|---|
   | `DATABASE_URL` | `postgresql://user:password@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require` |
   | `BASE_URL` | `https://your-service-name.onrender.com` |
   | `ADMIN_PASSWORD` | `<your-secure-admin-password>` |
   | `SESSION_SECRET` | `<random-session-secret-salt>` |
   | `PORT` | `10000` |

4. **Verify**:
   - Tables and indexes are created automatically on service launch.
   - Test shortening, redirection, dashboard, and persistence.

---

## 👥 Team Krypton — Innovista Round 2

- **Team Name**: Team Krypton
- **Project**: Link Pulse
- **License**: MIT
