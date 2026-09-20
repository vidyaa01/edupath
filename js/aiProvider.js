/* ============================================================
   AI PROVIDER WRAPPER (client side)
   ============================================================
   Every AI call in this app goes through the single callAI()
   function at the bottom of this file. app.js never talks to
   Gemini (or any provider) directly — it only calls callAI().

   This version calls YOUR OWN backend endpoint (/api/generate,
   a Vercel serverless function — see api/generate.js) instead of
   calling Gemini directly from the browser. The API key lives in
   an environment variable on the server and is never sent to,
   or visible in, the browser. This is the secure setup — see
   README.md for local dev + deployment instructions.
   ============================================================ */

const AI_CONFIG = {
  // Set to 'none' to force the app to always fall back to sample
  // data without making any network call — useful for UI testing.
  provider: 'backend',
  endpoint: '/api/generate'
};

/**
 * The one function the rest of the app calls.
 * @param {string} prompt - full instruction text, including any
 *   requested JSON schema. This app always asks for JSON back.
 * @returns {Promise<object>} parsed JSON object.
 * @throws on any failure — callers are expected to catch this and
 *   fall back gracefully (app.js already does this).
 */
async function callAI(prompt) {
  if (AI_CONFIG.provider === 'none') {
    throw new Error('ai_disabled: provider set to none in js/aiProvider.js');
  }
  return callBackend(prompt);
}

async function callBackend(prompt) {
  let res;
  try {
    res = await fetch(AI_CONFIG.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });
  } catch (networkErr) {
    // Most likely cause: the page was opened as a plain file (file://)
    // or served without the serverless function running (see README —
    // you need `vercel dev`, not a plain static file server, for this
    // endpoint to exist locally).
    throw new Error('backend_unreachable: could not reach ' + AI_CONFIG.endpoint + '. Are you running `vercel dev`?');
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const detail = (data && (data.message || data.error)) || `http_${res.status}`;
    throw new Error(`backend_error: ${detail}`);
  }

  if (!data || !data.result) {
    throw new Error('backend_error: response was missing "result"');
  }

  return data.result;
}

/* ---------------- To add another provider ----------------
   Since the actual provider call now lives server-side in
   api/generate.js, switching providers means editing THAT file
   (e.g. swap the Gemini fetch() for an OpenAI or Claude API call)
   rather than this one. This file only needs to change if you
   want to call a different endpoint entirely, or add client-side
   options like model selection passed through in the request body.
------------------------------------------------------------- */

// Exposed globally so app.js can call it without a bundler/module system.
window.EduPathAI = { callAI };
