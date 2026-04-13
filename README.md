# FoxESS Inverter Scheduler

A web app for FoxESS inverter owners to view and modify **advanced schedule settings** — export limits, import limits, SoC targets, and more — that the official FoxESS app does not expose.

This project is built on [Cloudflare Workers](https://workers.cloudflare.com/) (free tier). Your FoxESS API key never touches a shared server — it is encrypted and stored only in your own browser session.

---

## How it works

- You create and manage schedules in the FoxESS app as normal
- This app connects to your inverter via the [FoxESS Open API](https://www.foxesscloud.com/public/i18n/en/OpenApiInfomation.html) and lets you edit the advanced parameters on each schedule that the FoxESS app hides
- Changes are written directly to your inverter in real time

---

## Advanced guide: set-and-forget export scheduling

The FoxESS app today only exposes two settings on a schedule — **Max SoC** (Charge/Discharge Cut-off percentage)and **Force Power** (Forced Charge/Discharge wattage). This app unlocks the full parameter set:

| Parameter | Description |
|---|---|
| **Export Limit** | Caps power sent to the grid. Overrides Force Power (FD). |
| **Import Limit** | Caps power drawn from the grid. Set to 0 to block import entirely. |
| **Target SoC (FC / FD)** | Force Charge stops at this level. Force Discharge stops at this level. |
| **PV Limit** | Caps solar input. Useful for curtailing generation. |
| **Min SoC on Grid** | Battery floor while grid is available. |
| **Reactive Power** | Power factor correction. Leave at 0 unless your provider requires otherwise. |

### The core problem

**Force Power is not your export rate — it is your total battery discharge rate.** House load takes its cut first. For example, if you want to export a consistant 5,000W, you can't do this with the app settings on their own.

### The formula

First thing is to work out your **baseline** — the background draw of your home with nothing unusual running (ie - fridge, router, lighting, standby). For an average home this could be around 500–700W. Check your inverter's load history on an average day during an export period to work out what your house load baseline is. 

```
Force Power  =  Intended Export + Baseline + Safety Margin (ie - 20% of your baseline)
Export Limit =  Intended Export
```

**Example:** 5,000W intended export, 700W baseline, 140W saftey margin → Set Force Power to 5,840W and Export Limit to 5,000W.

- Normal conditions: 700W powers the house, 5,000W goes to the grid
- Oven turns on (2,000W): export drops to 3,000W, battery discharge rate remains unchanged — the inverter absorbs the load variation automatically
- Oven turns off: export returns to 5,000W
- If house load drops near zero: Export Limit prevents over-export

### Avoiding unnessasary import

Problem statement: When Target SoC is hit, the inverter stops discharging and will immediately start importing from the grid to supply the house load. During an export window, that is the opposite of what you want.

Fix: combine Target SoC with **Import Limit = 0**. With no grid import allowed, the inverter continues drawing house load from the battery below the Target SoC threshold. This means Target SoC is a floor for *forced export*, not for house load - the battery will keep draining past it to run the house. Set it higher than your true desired minimum to account for this.

### Summary

| Setting | Value | Purpose |
|---|---|---|
| Force Power | Intended export + baseline | Total discharge rate |
| Export Limit | Intended export | Hard ceiling on grid export |
| Target SoC | Your floor + buffer | Stops forced export before battery is depleted |
| Import Limit | 0W | Prevents grid import when Target SoC is hit |

Four settings, configured once. No automation platform required.

> ⚠️ **Important:** If you add new schedules or modify existing ones in the FoxESS app after setting advanced parameters in this app, the advanced settings may be lost on the inverter's schedule. Always check back in this app to confirm parameter changes after you have created new, or modified existing schedules.

---

## What you need before deploying

- A **FoxESS developer API key** — get one from [foxesscloud.com](https://www.foxesscloud.com) → Log In → User Profile → API Management → Private token → Generate API Key
- Your **inverter serial number** — visible in the FoxESS app or FoxCloud website
- A **Cloudflare account** (free) — [sign up here](https://dash.cloudflare.com/sign-up)
- A **GitHub account** — so Cloudflare can connect to this repo and auto-deploy updates (https://github.com/)

---

## Deploy

Click the button below. Cloudflare will ask you to log in, connect your GitHub account, and then copy and deploy this repo automatically.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cf-krispy/foxess-scheduler)

### What happens when you click Deploy

1. Log in to Cloudflare (or create a free account)
2. Cloudflare redirects you to GitHub and asks you to install the **Cloudflare Workers and Pages** GitHub App — this gives Cloudflare permission to copy the software respository into your own account and trigger automatic builds on new commits. Click **Install & Authorize** when prompted. Check the `Create Private Git repositoy` box to keep your copy private.
3. Cloudflare copies this repository into your GitHub account
4. The app is built and deployed to a URL like `https://foxess-scheduler.<your-subdomain>.workers.dev`

### Getting updates

Automatic updates can be are handled by a GitHub Actions workflow that syncs your copy with the source repository every night at 2am UTC. When new commits arrive, Cloudflare detects the push and redeploys automatically.

**Step 1 — Create a Personal Access Token**

1. Go to [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new) (you must be logged into the account that owns the copied repo)
2. Give it a name e.g. `foxess-sync`
3. Set **Expiration** to whatever you are comfortable with (1 year is reasonable)
4. Under **Repository access** select **Only select repositories** and choose your `foxess-scheduler` repo
5. Under **Permissions → Repository permissions** set:
   - **Contents** → Read and write
   - **Workflows** → Read and write
6. Click **Generate token** and copy it — you will not see it again

**Step 2 — Add the token as a repository secret**

1. Go to your `foxess-scheduler` repo → **Settings → Secrets and variables → Actions**
2. Click **New repository secret**
3. Name: `SYNC_TOKEN`
4. Value: paste the token you just created
5. Click **Add secret**

**Step 3 — Add the workflow file**

1. Go to your new foxess-scheduler repo in your Github account, click **Add file → Create new file**
2. In the filename box type exactly: `.github/workflows/sync-upstream.yml`
   (GitHub creates the folders automatically as you type the slashes)
3. Copy the contents of [sync-upstream.yml](https://raw.githubusercontent.com/cf-krispy/foxess-scheduler/main/.github/workflows/sync-upstream.yml) and paste them into the editor
4. Click **Commit changes**

**Step 4 — Enable and test**

1. Go to **Settings → Actions → General**, set **Actions permissions** to **Allow all actions and reusable workflows**, click **Save**
2. Go to the **Actions** tab → **Sync upstream → Run workflow**

After that, the workflow runs automatically every night. Cloudflare will redeploy on each sync — nothing further to do.

To pull in an update at any time: **Actions → Sync upstream → Run workflow**.

---

## Set the encryption secret

The app encrypts your FoxESS session using a secret key that only your Worker knows. You need to set this once after the initial deploy. Perform only one of the following options. **Important:** The app will return errors on until this secret is set.

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

### Option B — Wrangler CLI (not required if you used Option A)

If you have [Wrangler](https://developers.cloudflare.com/workers/wrangler/) installed locally:

```bash
wrangler secret put COOKIE_ENCRYPTION_KEY
```

Enter your random string when prompted.

---

## Secure your deployment with Cloudflare Access (**IMPORTANT**)

By default your worker URL is publicly reachable. Anyone who finds the URL can access this app. Cloudflare Access lets you put an authentication gate in front of it so only your email address can reach it. It's important you perform this step to prevent misuse.

### Step 1 — Open Zero Trust

1. Go to [one.dash.cloudflare.com](https://one.dash.cloudflare.com)
2. If this is your first time, Cloudflare will ask you to pick a **team name** — this becomes your login portal domain (e.g. `myname.cloudflareaccess.com`). Pick anything, it can be changed later.

### Step 2 — Create an Access Policy

1. In the left sidebar go to **Access contols → Policies**
2. Click **Add a policy**
1. **Policy name:** `Owner only` (or anything)
2. **Action:** Allow
3. Under **Include**, set the rule:
   - Selector: **Emails**
   - Value: your email address (e.g. `you@example.com`)
4. Click **Save**

### Step 3 — Create an Access Application

1. In the left sidebar go to **Access controls → Applications**
2. Click **Add an application**
3. Choose **Self-hosted**
4. Fill in the form:
   - **Application name:** `FoxESS Scheduler` (or whatever you like)
   - Select **+ Add public hostname**
      - **Subdomain** `foxess-scheduler`
      - **Domain** `<yoursubdomain>.workers.dev`
      - Leave the path blank
5. Click **Select existing policies**
      - Select the policy you created earlier (e.g. `Owner only`)
      - Unselect **Accept all available identity providers**
      - Check only **One-time PIN**
6. Click **Next**, then **Next** again
7. Click **Save**

### Step 4 — Test it

Visit your worker URL in a browser. Instead of the app, you will see a Cloudflare login page asking for your email. Enter the email you allowed. Cloudflare will send a one-time code to that email address. Enter the code and you are through to the app.

The login is remembered for 24 hours by default (configurable in Access → Applications → your app → Settings).

---

## Local development (for developers only)

### Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/): `npm install -g wrangler`

### Setup

```bash
# Clone the repo
git clone https://github.com/cf-krispy/foxess-scheduler
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
- Pairing this app with a Cloudflare Access policy (see above) means your inverter cannot be reached even if someone discovers your URL.

---

## Tech stack

| Layer | Technology |
|---|---|
| UI | [Astro 5](https://astro.build/) (static), Tailwind CSS v4, vanilla JS |
| Backend | [Cloudflare Workers](https://workers.cloudflare.com/) |
| API | [FoxESS Open API](https://www.foxesscloud.com/public/i18n/en/OpenApiInfomation.html) |
| Auth | AES-256-GCM encrypted HttpOnly cookie, no database |
| Hosting | Cloudflare Workers (free tier) |
