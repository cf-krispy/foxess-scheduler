# FoxESS Inverter Scheduler

A web app for FoxESS inverter owners to view and modify **advanced schedule settings** — export limits, import limits, SoC targets, and more — that the official FoxESS app does not expose.

Built on [Cloudflare Workers](https://workers.cloudflare.com/) (free tier). Your FoxESS API key never touches a shared server — it is encrypted and stored only in your own browser session.

---

## How it works

- You create and manage schedules in the FoxESS app as normal
- This app connects to your inverter via the [FoxESS Open API](https://www.foxesscloud.com/public/i18n/en/OpenApiInfomation.html) and lets you edit the advanced parameters on each schedule that the FoxESS app hides
- Changes are written directly to your inverter in real time

---

## What you need before deploying

- A **FoxESS developer API key** — get one from [foxesscloud.com](https://www.foxesscloud.com) → Personal Details → My Server → API Key
- Your **inverter serial number** — visible in the FoxESS app under Device
- A **Cloudflare account** (free) — [sign up here](https://dash.cloudflare.com/sign-up)
- A **GitHub account** — so Cloudflare can connect to this repo and auto-deploy updates

---

## Deploy

Click the button below. Cloudflare will ask you to log in, connect your GitHub account, and then fork and deploy this repo automatically.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/YOUR-GITHUB-USERNAME/foxess-scheduler)

> **Before clicking:** replace `YOUR-GITHUB-USERNAME` in the URL above with your actual GitHub username.

### What happens when you click Deploy

1. You log in to Cloudflare (or create a free account)
2. Cloudflare connects to GitHub and forks this repository into your account
3. The app is built and deployed to a URL like `https://foxess-scheduler.<your-subdomain>.workers.dev`
4. From this point on, every time a commit is pushed to the `main` branch, Cloudflare automatically rebuilds and redeploys — no manual steps needed

---

## Set the encryption secret

The app encrypts your FoxESS session using a secret key that only your Worker knows. You need to set this once after the initial deploy.

### Option A — Cloudflare dashboard (easiest)

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Click **Workers & Pages** in the left sidebar
3. Click your **foxess-scheduler** worker
4. Go to **Settings → Variables & Secrets**
5. Under **Secrets**, click **Add**
6. Name: `COOKIE_ENCRYPTION_KEY`
7. Value: any long random string — e.g. paste the output of running this in your terminal:
   ```
   openssl rand -base64 32
   ```
   If you don't have `openssl`, just type 40+ random characters — it just needs to be hard to guess
8. Click **Deploy**

### Option B — Wrangler CLI

If you have [Wrangler](https://developers.cloudflare.com/workers/wrangler/) installed locally:

```bash
wrangler secret put COOKIE_ENCRYPTION_KEY
```

Enter your random string when prompted.

> **Important:** The app will return errors on every login attempt until this secret is set.

---

## Secure your deployment with Cloudflare Access (recommended)

By default your worker URL is publicly reachable - anyone who finds the URL can see the login page. Cloudflare Access lets you put an authentication gate in front of it so only your email address can reach it at all. It is free for up to 50 users.

### Step 1 — Open Zero Trust

1. Go to [one.dash.cloudflare.com](https://one.dash.cloudflare.com)
2. If this is your first time, Cloudflare will ask you to pick a **team name** — this becomes your login portal domain (e.g. `myname.cloudflareaccess.com`). Pick anything, it can be changed later.

### Step 2 — Create an Access Application

1. In the left sidebar go to **Access → Applications**
2. Click **Add an application**
3. Choose **Self-hosted**
4. Fill in the form:
   - **Application name:** `FoxESS Scheduler` (or whatever you like)
   - **Application domain:** your worker URL without `https://` — e.g. `foxess-scheduler.yoursubdomain.workers.dev`
   - Leave the path blank to protect the whole app
5. Click **Next**

### Step 3 — Create an Access Policy

1. **Policy name:** `Owner only` (or anything)
2. **Action:** Allow
3. Under **Include**, set the rule:
   - Selector: **Emails**
   - Value: your email address (e.g. `you@example.com`)
4. Click **Next**, then **Add application**

### Step 4 — Test it

Visit your worker URL in a browser. Instead of the app, you will see a Cloudflare login page asking for your email. Enter the email you whitelisted — Cloudflare sends a one-time code to that address. Enter the code and you are through to the app.

The login is remembered for 24 hours by default (configurable in Access → Applications → your app → Settings).

---

## Local development

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/): `npm install -g wrangler`

### Setup

```bash
# Clone the repo
git clone https://github.com/YOUR-GITHUB-USERNAME/foxess-scheduler
cd foxess-scheduler

# Install dependencies
npm install

# Create a local secrets file (never commit this)
echo 'COOKIE_ENCRYPTION_KEY=any-local-test-value' > .dev.vars

# Start the local dev server
npm run dev
```

The app will be available at `http://localhost:8787`.

### Deploy manually

```bash
npm run deploy
```

This runs `astro build` (compiles the UI) then `wrangler deploy` (uploads the Worker and static assets to Cloudflare).

---

## Security notes

- Your FoxESS API key is **never stored in plain text in the browser**. After you connect, it is encrypted with AES-256-GCM and stored in an HttpOnly session cookie that JavaScript cannot read.
- The encryption key (`COOKIE_ENCRYPTION_KEY`) lives only in your Worker environment — it is never in the source code or browser.
- Sessions expire after 1 year, or immediately when you click Disconnect.
- Pairing this app with a Cloudflare Access policy (see above) means your inverter cannot be reached even if someone discovers your worker URL.

---

## Tech stack

| Layer | Technology |
|---|---|
| UI | [Astro 5](https://astro.build/) (static), Tailwind CSS v4, vanilla JS |
| Backend | [Cloudflare Workers](https://workers.cloudflare.com/) |
| API | [FoxESS Open API](https://www.foxesscloud.com/public/i18n/en/OpenApiInfomation.html) |
| Auth | AES-256-GCM encrypted HttpOnly cookie, no database |
| Hosting | Cloudflare Workers (free tier) |
