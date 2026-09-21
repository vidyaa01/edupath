# EduPath — standalone version (secure backend setup)

A personalized learning & skill-gap agent. Static frontend + one small
Vercel serverless function that keeps your Gemini API key server-side.

## Architecture

```
Browser (index.html + js/*)
      │  fetch('/api/generate', { prompt })
      ▼
Vercel serverless function (api/generate.js)
      │  reads process.env.GEMINI_API_KEY (server-side only)
      ▼
Google Gemini API
```

The browser never sees your API key. `api/generate.js` runs on Vercel's
servers, not in anyone's browser.

## Files

```
index.html         # structure + all styling
js/aiProvider.js    # calls YOUR backend (/api/generate) — no key here
js/storage.js       # localStorage persistence (progress survives reloads, per browser)
js/app.js           # app logic, state, rendering
api/generate.js     # serverless function — holds the real Gemini call, retry logic, and key
.env.example        # template for local env vars (copy to .env.local)
package.json        # marks Node 18+ runtime (needed for global fetch)
```

## Setup

### 1. Get a Gemini API key
Free, from https://aistudio.google.com/app/apikey

### 2. Install the Vercel CLI
```bash
npm install -g vercel
```
**If your terminal says `vercel` is not recognized** after this (common
on Windows when the global npm bin isn't on PATH), don't fight it —
just prefix every command with `npx` instead, e.g. `npx vercel dev`.
Pinning a version avoids surprises: `npx vercel@59.23.2 dev`.

### 3. Local development
```bash
cp .env.example .env.local
# then edit .env.local and paste your real key in place of "your_key_here"

npx vercel dev
```
This starts both the static site AND the serverless function together,
at a local URL it prints (usually `http://localhost:3000`).

**Important — use that exact URL.** If you also have VS Code's "Live
Server" extension or any other static server open on a different port
(e.g. `127.0.0.1:5500`), those don't know `/api/generate` exists and
will return 404/405. Only the `vercel dev` URL runs your serverless
function. Opening `index.html` directly as a file has the same problem.

**If you see `missing_api_key` even with `.env.local` correctly set:**
`vercel dev`'s automatic env-loading has been observed to be
inconsistent on some Windows setups — the exact same command sometimes
loads it, sometimes doesn't. `api/generate.js` includes a built-in
fallback that reads `.env.local` directly with Node's `fs` if the
variable isn't already present, so this shouldn't come up — but if it
does, restart `vercel dev` fresh (fully stop with Ctrl+C and wait for
the prompt to return, don't just close the terminal tab) and try again.

**Testing onboarding again after your first run:** progress persists
via `localStorage`, so reopening the page goes straight to the
dashboard instead of onboarding — that's the persistence feature
working, not a bug. To see onboarding again: click **Log out** in the
sidebar, or open in an incognito window, or clear
`localStorage.edupath_state_v1` via DevTools → Application → Local
Storage.

### 4. Deploy
```bash
npx vercel
```
Follow the prompts (first run asks you to link/create a project). Then
add your real key as a **production** environment variable — either:

- In the Vercel dashboard: Project → Settings → Environment Variables →
  add `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`), or
- Via CLI: `npx vercel env add GEMINI_API_KEY`

Then redeploy so the function picks up the variable:
```bash
npx vercel --prod
```

You'll get a real `https://your-project.vercel.app` URL — that's what
you share for judging. Anyone who opens it just sees a normal webpage;
no Claude account, no login, no exposed key.

## Resilience built in

- **Automatic retry**: if Gemini returns a temporary overload (503) or
  rate limit (429), `api/generate.js` retries up to 3 times with a
  short backoff before giving up — a single busy moment on Google's
  side shouldn't sink a live demo.
- **Graceful fallback**: any failure that survives retries (missing
  key, network issue, malformed response) falls back to a built-in
  sample plan with a visible on-screen notice, rather than a blank
  page or crash.

## What's real vs. placeholder right now

| Feature | Status |
|---|---|
| Skill-gap analysis + 4-week plan generation | **Real AI call**, via your own backend endpoint, with retry on transient failures |
| Task checkboxes, plan persistence across reloads | **Real** (localStorage, per browser) |
| Dashboard streak / activity calendar | Sample/demo data, not yet derived from real activity history |
| Resume/portfolio file upload | UI only — files are attached by name, contents are not extracted or read yet |
| "Ask EduPath" chat | Placeholder replies — wiring it to `callAI()` is the same pattern as the plan generator, just not done yet |

## Swapping AI providers

The actual provider call lives server-side, in `api/generate.js`. To
use OpenAI, Claude's API, or anything else instead of Gemini:

1. Replace the `fetch()` call to Gemini with a call to your provider
   of choice, keeping the same response shape:
   `res.status(200).json({ result: <parsed JSON object> })`.
2. Update the environment variable name(s) it reads accordingly.
3. `js/aiProvider.js` on the client doesn't need to change at all —
   it just calls `/api/generate` either way.

## Known limitation for multi-device / multi-user judging

Progress (checked-off tasks, the generated plan) is stored per-browser
via `localStorage`, not in a shared database. That means:
- Each person who opens the deployed link gets their own independent
  copy automatically — no login needed, no data crosses between people.
- If the same judge opens it on a different device or clears browser
  data, their progress won't follow them.
- The AI-generated plan and skill gaps ARE real and live for everyone,
  regardless of device — only the *progress tracking* is local.

If you need progress synced across devices, that requires an actual
database (e.g. Vercel KV, Postgres, Firebase) behind another API route
— a meaningfully bigger step than this version takes on purpose, given
the timeline. Worth doing after the core demo works, not before.
