/**
 * POST /api/generate
 * Body: { "prompt": string }
 * Response: { "result": <parsed JSON object from Gemini> }
 *
 * This runs on the server (Vercel Node.js runtime), never in the
 * browser, so process.env.GEMINI_API_KEY is never exposed to a viewer.
 * Requires Node.js 18+ (for global fetch) — Vercel's default runtime
 * satisfies this.
 */

// --- Local-dev safety net -------------------------------------------
// `vercel dev` is supposed to auto-load .env.local, but this has been
// observed to be inconsistent on some Windows setups (sometimes it
// works, sometimes the same command doesn't inject it). Rather than
// depend on that, we load it ourselves here if the var isn't already
// present. In actual production on Vercel, GEMINI_API_KEY is already
// set as a real environment variable before this file even runs, so
// this block does nothing there — it's purely a local-dev fallback.
if (!process.env.GEMINI_API_KEY) {
  try {
    const fs = require('fs');
    const path = require('path');
    const envPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let value = trimmed.slice(eqIdx + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (key && !process.env[key]) process.env[key] = value;
      }
    }
  } catch (e) {
    // Best-effort only — if this fails, the missing_api_key check
    // below still catches a genuinely missing key with a clear message.
  }
}
// ----------------------------------------------------------------------

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed', message: 'Use POST.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: 'missing_api_key',
      message: 'GEMINI_API_KEY is not set. Add it as an environment variable in your Vercel project (or .env.local for local dev).'
    });
    return;
  }

  const prompt = req.body && req.body.prompt;
  if (!prompt || typeof prompt !== 'string') {
    res.status(400).json({ error: 'missing_prompt', message: 'Request body must include a "prompt" string.' });
    return;
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const maxAttempts = 3;
  let lastErrorPayload = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const geminiRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      });

      // Retry only on transient errors: 503 (overloaded) and 429 (rate limited).
      if ((geminiRes.status === 503 || geminiRes.status === 429) && attempt < maxAttempts) {
        lastErrorPayload = await geminiRes.text().catch(() => '');
        const delayMs = attempt * 1500; // 1.5s, then 3s
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }

      if (!geminiRes.ok) {
        const errText = await geminiRes.text().catch(() => '');
        res.status(502).json({
          error: 'gemini_http_error',
          status: geminiRes.status,
          message: errText.slice(0, 500)
        });
        return;
      }

      const data = await geminiRes.json();
      const text = data && data.candidates && data.candidates[0] &&
                   data.candidates[0].content && data.candidates[0].content.parts &&
                   data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;

      if (!text) {
        res.status(502).json({ error: 'gemini_empty_response', message: JSON.stringify(data).slice(0, 500) });
        return;
      }

      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        res.status(502).json({ error: 'gemini_invalid_json', message: text.slice(0, 500) });
        return;
      }

      res.status(200).json({ result: parsed });
      return;
    } catch (err) {
      if (attempt === maxAttempts) {
        res.status(500).json({ error: 'server_error', message: String((err && err.message) || err) });
        return;
      }
      await new Promise(r => setTimeout(r, attempt * 1500));
    }
  }

  // All attempts exhausted on transient errors.
  res.status(503).json({
    error: 'gemini_overloaded',
    message: 'Gemini was overloaded after multiple retries. Please try again shortly.',
    detail: (lastErrorPayload || '').slice(0, 300)
  });
};