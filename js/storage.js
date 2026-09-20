/* ============================================================
   LOCAL PERSISTENCE
   ============================================================
   This app has no backend, so progress is saved to the browser's
   own localStorage. This means:
     - It persists across reloads and closing the tab, on THIS
       device/browser only.
     - It is NOT shared between devices or people — each judge
       or user gets their own local copy automatically, with no
       login required, because it just lives in their browser.
     - Clearing browser data / private browsing wipes it.
   For a hackathon demo this is usually exactly what you want:
   zero setup, no accounts, works offline after first load.
   ============================================================ */

const STORAGE_KEY = 'edupath_state_v1';

function saveState(state) {
  try {
    const toSave = {
      submitted: state.submitted,
      activeWeek: state.activeWeek,
      files: state.files,
      profile: state.profile,
      gaps: state.gaps,
      weeks: state.weeks,
      chat: state.chat
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (e) {
    // Storage can fail (private browsing, quota, disabled) — never let
    // a save failure break the app, just skip persistence silently.
    console.warn('EduPath: could not save state', e);
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('EduPath: could not load saved state', e);
    return null;
  }
}

function clearState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('EduPath: could not clear saved state', e);
  }
}
