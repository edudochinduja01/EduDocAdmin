# EduDoc Admin Panel

[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Node.js](https://img.shields.io/badge/Node.js-Express%20v5-green)](https://expressjs.com/)
[![Supabase](https://img.shields.io/badge/Backend-Supabase-3ECF8E)](https://supabase.com/)
[![Deploy on Render](https://img.shields.io/badge/Backend-Render-46E3B7)](https://render.com/)
[![Deploy on Vercel](https://img.shields.io/badge/Frontend-Vercel-000000)](https://vercel.com/)

> A full-stack admin dashboard for managing the EduDoc platform — users, products, offers, transactions, and activity logs — secured with Supabase magic-link authentication.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [Deployment](#deployment)
  - [Backend — Render](#backend--render)
  - [Frontend — Vercel](#frontend--vercel)
- [Pages Overview](#pages-overview)
- [Security](#security)
- [Contributing](#contributing)

---

## Overview

**EduDoc Admin** is the administrative control panel for the EduDoc platform. It provides a rich, browser-based UI for admins to manage content, users, offers, and financial activity. The frontend is a vanilla HTML/CSS/JS multi-page application served by Vercel, while the backend is a Node.js/Express REST API hosted on Render — both powered by a Supabase PostgreSQL database.

---

## ✨ Features

| Module | Capabilities |
|---|---|
| 🔐 Authentication | Passwordless magic-link login (OTP via email), Admin-only access guard |
| 📊 Dashboard | Live analytics — total users, products, downloads, new users this month; monthly bar charts; recent transactions & new users |
| 📦 Products | Full CRUD — create/edit/delete educational documents, books, PDFs; supports cover images, PDF uploads, pricing, categories, ratings, and draft/published status |
| 👥 Users | Full CRUD — create/edit/delete users; role assignment; wallet balance management with automatic audit trail in transactions |
| 🎁 Offers | Full CRUD — discount labels, token pricing, valid date ranges, offer types, max usage, linked product IDs |
| 💳 Transactions | View all purchase & wallet credit/debit history; joined with user names and emails |
| 📋 Activity Logs | Complete audit trail of every admin action with IP address, timestamps, entity diffs (old/new data) |
| 🔍 Global Search | Real-time cross-entity search (users, products, offers) in the top bar on every page |
| 📤 File Upload | Authenticated image/PDF/file upload to Supabase Storage with auto bucket routing |
| 📱 Responsive UI | Mobile-ready sidebar with toggle; resizable/draggable table columns |

---

## 🛠️ Tech Stack

### Backend
| Package | Version | Purpose |
|---|---|---|
| `express` | ^5.1.0 | REST API framework |
| `@supabase/supabase-js` | ^2.81.1 | Database, Auth & Storage client |
| `cors` | ^2.8.5 | Cross-origin request management |
| `helmet` | ^8.1.0 | HTTP security headers |
| `express-rate-limit` | ^8.3.1 | OTP rate limiting (10 req / 15 min) |
| `multer` | ^2.0.2 | Multipart file upload handling |
| `dotenv` | ^17.2.3 | Environment variable management |

### Frontend
- Vanilla **HTML5 / CSS3 / JavaScript** (no framework)
- **Chart.js** — analytics charts (loaded via CDN)
- **Supabase JS** — auth token refresh on client side

### Infrastructure
| Service | Role |
|---|---|
| **Supabase** | PostgreSQL DB + Auth (magic link/OTP) + Object Storage |
| **Render** | Node.js backend hosting (free tier) |
| **Vercel** | Static frontend hosting + build-time env injection |

---

## 📁 Project Structure

```
EduDoc_Admin-master/
├── backend/
│   ├── server.js          # Express app — all routes, middleware, Supabase calls
│   ├── package.json       # Node dependencies & npm scripts
│   ├── package-lock.json
│   └── .env.example       # Template for required environment variables
│
├── frontend/
│   ├── index.html         # Entry point — redirects to login.html
│   ├── login.html         # Magic-link / OTP login page
│   ├── dashboard.html     # Analytics dashboard (Charts, recent data)
│   ├── products.html      # Product management CRUD page
│   ├── users.html         # User management CRUD page
│   ├── offers.html        # Offers management CRUD page
│   ├── transactions.html  # Transaction history view
│   ├── activity.html      # Admin activity log view
│   ├── api.js             # Frontend API abstraction layer (fetch wrapper)
│   ├── script.js          # Shared UI logic (sidebar, search, tables, drawer)
│   ├── config.js          # Backend URL config (replaced at Vercel build time)
│   ├── styles.css         # Global stylesheet
│   └── edudoc_logo.png    # Application logo
│
├── render.yaml            # Render deployment configuration (IaC)
├── vercel.json            # Vercel deployment configuration
├── .gitignore
└── package-lock.json
```

---

## 🏛️ Architecture

```
┌──────────────────────────────────────────────────┐
│                  BROWSER (Admin User)            │
│                                                  │
│  Vercel CDN — Static HTML/CSS/JS Frontend        │
│  ┌──────┐ ┌──────────┐ ┌──────┐ ┌────────────┐  │
│  │Login │ │Dashboard │ │Users │ │  Products  │  │
│  └──┬───┘ └────┬─────┘ └──┬───┘ └─────┬──────┘  │
│     │          │           │            │         │
│     └──────────┴───────────┴─────── api.js ───┐  │
└────────────────────────────────────────────────┼─┘
                  HTTPS  (Bearer JWT)             │
┌────────────────────────────────────────────────▼─┐
│           Render — Node.js / Express Backend     │
│                                                  │
│  Middleware: CORS · Helmet · Rate Limit · Auth   │
│                                                  │
│  Routes:                                         │
│   /send-magic-link   /verify-otp                 │
│   /analytics/totals  /upload                     │
│   /products  /users  /offers                     │
│   /transactions  /activity-logs  /search         │
└──────────────────────┬───────────────────────────┘
                       │  Supabase JS SDK
┌──────────────────────▼───────────────────────────┐
│                    Supabase                       │
│   PostgreSQL DB   │  Auth (OTP/Magic Link)        │
│   Object Storage  │  Row-Level Security (RLS)     │
└───────────────────────────────────────────────────┘
```

---

## 📡 API Reference

All endpoints (except `/health`, `/send-magic-link`, `/verify-otp`) require a **Bearer JWT** in the `Authorization` header.

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check — returns `{status: "ok"}` |
| `POST` | `/send-magic-link` | Sends OTP/magic-link email to the given address |
| `POST` | `/verify-otp` | Verifies OTP, checks admin role, returns JWT session |
| `GET` | `/verify-admin` | 🔐 Confirms the token belongs to an Admin user |

### Analytics

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/analytics/totals` | 🔐 Returns counts, monthly breakdowns, recent transactions & users |

### Products

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/products` | 🔐 List all products (descending by date) |
| `POST` | `/products` | 🔐 Create a new product |
| `PUT` | `/products/:id` | 🔐 Update a product by ID |
| `DELETE` | `/products/:id` | 🔐 Delete a product by ID |

### Users

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/users` | 🔐 List all users with wallet balances |
| `POST` | `/users` | 🔐 Create a new user (also creates Supabase Auth entry) |
| `PUT` | `/users/:id` | 🔐 Update user; wallet changes auto-log in transactions |
| `DELETE` | `/users/:id` | 🔐 Delete user from Auth and DB |

### Offers

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/offers` | 🔐 List all offers |
| `POST` | `/offers` | 🔐 Create a new offer |
| `PUT` | `/offers/:id` | 🔐 Update an offer |
| `DELETE` | `/offers/:id` | 🔐 Delete an offer |

### Transactions

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/transactions` | 🔐 List all transactions joined with user data |

### Activity Logs

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/activity-logs` | 🔐 Fetch all activity logs joined with user info |
| `POST` | `/activity-logs` | 🔐 Write a new activity log entry |

### Search & Upload

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/search?q=<query>` | 🔐 Cross-entity search (users, products, offers) |
| `POST` | `/upload` | 🔐 Upload a file; auto-routes to `images`, `pdfs`, or `files` bucket |

> 🔐 = Requires `Authorization: Bearer <access_token>` header

---

## 🗄️ Database Schema

The backend relies on the following Supabase (PostgreSQL) tables:

### `users`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key, matches Supabase Auth UID |
| `email` | text | Unique |
| `full_name` | text | |
| `phone_num` | text | Nullable |
| `role` | text | `'Admin'` or `'User'` |
| `status` | text | `'Active'` / `'Inactive'` |
| `profile_image_url` | text | Nullable |
| `created_at` | timestamptz | Auto |

### `wallets`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `user_id` | UUID | FK → users.id |
| `balance` | numeric | |

### `products`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `title` | text | Required |
| `description` | text | |
| `details` | text | |
| `content` | text | |
| `pdf_url` | text | |
| `cover_image_url` | text | |
| `image_url` | text | |
| `price` | numeric | Default 0 |
| `is_free` | boolean | |
| `type` | text | Required |
| `category` | text | |
| `pages` | integer | |
| `status` | text | `'Draft'` / `'Published'` |
| `author` | text | |
| `rating` | float | Default 0.0 |
| `created_at` | timestamptz | Auto |

### `offers`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `title` | text | Required |
| `discount_label` | text | |
| `token_price` | numeric | Required |
| `duration` | integer | Days |
| `valid_from` | date | |
| `valid_until` | date | |
| `offer_type` | text | |
| `max_usage` | integer | |
| `status` | text | `'Active'` / `'Inactive'` |
| `discount` | numeric | Percentage |
| `product_ids` | UUID[] | Array of linked product IDs |
| `cover_image_url` | text | |
| `created_at` | timestamptz | Auto |

### `transactions`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `user_id` | UUID | FK → users.id |
| `amount` | numeric | |
| `type` | text | `'purchased'`, `'credit'`, `'debit'` |
| `description` | text | |
| `created_at` | timestamptz | Auto |

### `activity_logs`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `user_id` | UUID | FK → users.id (the admin who acted) |
| `role` | text | |
| `action` | text | e.g. `WALLET_ADJUSTMENT` |
| `entity_type` | text | `'user'`, `'product'`, etc. |
| `entity_id` | text | |
| `description` | text | |
| `old_data` | jsonb | |
| `new_data` | jsonb | |
| `ip_address` | text | |
| `created_at` | timestamptz | Auto |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** >= 18.x
- **npm** >= 9.x
- A **Supabase** project with the schema above applied
- A code editor (VS Code recommended)

### Local Development

**1. Clone the repository**

```bash
git clone https://github.com/edudochinduja01/EduDocAdmin.git
cd EduDocAdmin
```

**2. Configure environment variables**

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
PORT=3000
FRONTEND_URL=http://localhost:5500
```

**3. Install backend dependencies**

```bash
cd backend
npm install
```

**4. Start the backend server**

```bash
# Standard start
npm start

# Development mode (auto-restarts on file changes)
npm run dev
```

The API will be available at `http://localhost:3000`.

**5. Configure the frontend**

Open `frontend/config.js` and set your local backend URL:

```js
window.ENV_BACKEND_URL = 'http://localhost:3000';
```

**6. Serve the frontend**

Use the **Live Server** VS Code extension or any static file server:

```bash
# Using npx serve
npx serve frontend -p 5500
```

Open `http://localhost:5500` in your browser.

---

## 🔑 Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | ✅ | Your Supabase project URL |
| `SUPABASE_KEY` | ✅ | Supabase `anon` public key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service role key (bypasses RLS) |
| `PORT` | ❌ | Server port (defaults to `3000`) |
| `FRONTEND_URL` | ✅ | Frontend URL for CORS and magic-link redirect |

> ⚠️ **Never commit your `.env` file.** Only `.env.example` is tracked in git.

---

## ☁️ Deployment

### Backend — Render

The `render.yaml` file at the project root configures a **Render Web Service** automatically.

**Manual steps:**

1. Push your code to GitHub.
2. Go to [render.com](https://render.com) → **New Web Service** → connect your GitHub repo.
3. Render will auto-detect `render.yaml` and configure the service.
4. In **Environment Variables**, add:
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `FRONTEND_URL` (your Vercel URL, e.g. `https://edu-doc-admin.vercel.app`)
5. Deploy. The health check endpoint is `/health`.

### Frontend — Vercel

The `vercel.json` injects the backend URL at build time using a `sed` replacement on `config.js`.

**Manual steps:**

1. Go to [vercel.com](https://vercel.com) → **New Project** → import your GitHub repo.
2. In **Environment Variables**, add:
   - `BACKEND_URL` → your Render backend URL (e.g. `https://edudoc-admin-backend.onrender.com`)
3. Vercel runs the build command: `sed -i "s|PLACEHOLDER_BACKEND_URL|$BACKEND_URL|g" frontend/config.js`
4. The output directory is `frontend/`.
5. Deploy.

---

## 📄 Pages Overview

| Page | File | Description |
|---|---|---|
| Entry / Redirect | `index.html` | Redirects directly to `login.html` |
| Login | `login.html` | Email input → magic link or OTP verification |
| Dashboard | `dashboard.html` | Analytics summary, charts, recent activity |
| Products | `products.html` | Manage EduDoc documents, books, and PDFs |
| Users | `users.html` | Manage registered users and wallet balances |
| Offers | `offers.html` | Create and manage promotional offers |
| Transactions | `transactions.html` | View payment and wallet transaction history |
| Activity Log | `activity.html` | Audit trail of all admin actions |

---

## 🔒 Security

- **Helmet.js** — Sets secure HTTP headers on every response.
- **CORS whitelist** — Only allows requests from known origins (localhost variants, `*.vercel.app`, and the configured `FRONTEND_URL`).
- **JWT Auth Middleware** — Every protected route validates the Supabase Bearer token before processing.
- **Admin Role Guard** — Login flow checks `users.role === 'Admin'`; non-admins are rejected with `403 Forbidden`.
- **OTP Rate Limiting** — Max 10 OTP/magic-link requests per IP per 15 minutes.
- **Service Role Key** — Used server-side only to bypass RLS for admin operations; never exposed to the client.
- **50 MB upload limit** — Enforced by Multer to prevent abuse.

---

## 🤝 Contributing

1. **Fork** the repository.
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Commit your changes: `git commit -m "feat: add your feature"`
4. Push to your branch: `git push origin feature/your-feature-name`
5. Open a **Pull Request** against `main`.

Please follow conventional commit messages (`feat:`, `fix:`, `docs:`, `chore:`).

---

## 📞 Support

For issues or questions, open a [GitHub Issue](https://github.com/edudochinduja01/EduDocAdmin/issues).

---

*Made with ❤️ for the EduDoc platform*
