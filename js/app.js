/* ================= STATE ================= */
const state = {
  submitted: false,
  activeTab: 'dashboard', // dashboard | week | progress | ask
  activeWeek: 0,
  files: [],
  profile: { name: '', experience: '', skills: '', targetRole: '', goal: '' },
  gaps: [],
  weeks: [],
  streak: { count: 6, days: ['done','done','done','done','done','today','upcoming'] },
  chat: [],
  chatOpen: false,
  chatLoading: false,
  chatError: null,
  aiLoading: false,
  aiError: null,
  aiUnavailable: false
};

const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

/* Restore any saved session before first render */
(function restoreSavedState() {
  const saved = loadState();
  if (saved && saved.submitted && Array.isArray(saved.weeks) && saved.weeks.length) {
    Object.assign(state, saved);
  }
})();

/* ================= FALLBACK SAMPLE DATA (used if AI call fails or is disabled) ================= */
function generateFakePlan() {
  state.gaps = [
    { skill: 'Component architecture (React)', level: 'gap', pct: 10, note: 'No evidence of component-based frontend work in your background.' },
    { skill: 'State management patterns', level: 'gap', pct: 15, note: 'Needed for the target role; not mentioned in your experience.' },
    { skill: 'Git & collaborative workflows', level: 'in-progress', pct: 55, note: 'Some exposure — needs reinforcement.' },
    { skill: 'HTML/CSS fundamentals', level: 'acquired', pct: 95, note: 'Solid based on your background.' }
  ];
  state.weeks = [
    { title: 'Foundations', status: 'done',
      objectives: [{t:'Confirm HTML/CSS fundamentals are solid', done:true}, {t:'Set up a working dev environment', done:true}],
      resources: [{type:'Docs', title:'MDN: HTML & CSS refresher'}, {type:'Practice', title:'Small static layout rebuild'}],
      practiceTask: 'Rebuild a simple two-column layout from a screenshot, no framework.',
      tasks: [{text:'Set up local dev environment', done:true},{text:'Complete layout rebuild exercise', done:true}] },
    { title: 'Systems thinking', status: 'current',
      objectives: [{t:'Understand components as the unit of UI', done:true}, {t:'Learn props vs. state', done:false}, {t:'Build accessible patterns that scale', done:false}],
      resources: [{type:'Course', title:'React docs — Describing the UI'}, {type:'Video', title:'Intro to component architecture'}, {type:'Project', title:'Build a 3-component card list'}],
      practiceTask: 'Build a small "product card" component that accepts props and renders a list of 5 items.',
      tasks: [{text:'Read: components & props', done:true},{text:'Read: state basics', done:false},{text:'Build the product card list project', done:false}] },
    { title: 'Craft & polish', status: 'upcoming',
      objectives: [{t:'Learn local vs. shared state', done:false}, {t:'Understand when to lift state up', done:false}],
      resources: [{type:'Docs', title:'React docs — Managing State'}, {type:'Project', title:'Counter + shared-state demo'}],
      practiceTask: 'Build a to-do list where completed count shows in a separate summary component.',
      tasks: [{text:'Read: lifting state up', done:false},{text:'Build to-do list project', done:false}] },
    { title: 'Ship it', status: 'upcoming',
      objectives: [{t:'Get comfortable with branches, PRs, and merge conflicts', done:false}],
      resources: [{type:'Practice', title:'Simulated PR workflow'}, {type:'Docs', title:'GitHub collaborative workflow guide'}],
      practiceTask: 'Create a branch, open a PR against your own repo, resolve a manufactured conflict.',
      tasks: [{text:'Practice branch + PR workflow', done:false},{text:'Resolve a merge conflict on purpose', done:false}] }
  ];
  state.activeWeek = state.weeks.findIndex(w => w.status === 'current');
  if (state.activeWeek === -1) state.activeWeek = 0;
}

/* ================= REAL AI: skill-gap analysis + plan generation ================= */
function buildAnalysisPrompt() {
  const p = state.profile;
  const fileNote = state.files.length
    ? `The learner also attached these files (contents not readable yet, names only, use only as a weak signal): ${state.files.join(', ')}.`
    : '';
  return `You are a career learning-path advisor. A learner wants to move into a new role.

Learner profile:
- Target role: ${p.targetRole}
- Career goal: ${p.goal || 'not specified'}
- Skills they listed: ${p.skills || 'not specified'}
- Their described experience/background: ${p.experience || 'not provided'}
${fileNote}

Task: analyze the gap between their current profile and the target role, then produce a 4-week starter learning plan.

Respond with ONLY a JSON object, no markdown fences, no commentary, matching exactly this shape:

{
  "gaps": [
    { "skill": "string, a specific skill name", "level": "acquired" | "in-progress" | "gap", "pct": 0-100 integer estimating current proficiency, "note": "one sentence explaining why" }
  ],
  "weeks": [
    {
      "title": "short week theme, 2-4 words",
      "status": "current" for week 1, "upcoming" for weeks 2-4,
      "objectives": [ { "t": "one learning objective sentence", "done": false } ],
      "resources": [ { "type": "Course" | "Video" | "Docs" | "Project" | "Practice", "title": "realistic resource title" } ],
      "practiceTask": "one concrete practice task or mini-project description, specific to their level",
      "tasks": [ { "text": "short actionable checklist item", "done": false } ]
    }
  ]
}

Rules:
- Include 4-7 items in "gaps", covering both strengths (acquired) and real gaps, based on what they actually described — do not invent experience they didn't mention.
- Include exactly 4 weeks, ordered logically (foundational gaps first).
- Each week needs 2-3 objectives, 2-3 resources, and 2-3 tasks.
- Be specific to their target role and background, not generic.`;
}

async function runAIAnalysis() {
  state.aiLoading = true;
  state.aiError = null;
  render();

  try {
    const result = await window.EduPathAI.callAI(buildAnalysisPrompt());
    if (!result || !Array.isArray(result.gaps) || !Array.isArray(result.weeks) || result.weeks.length === 0) {
      throw new Error('unexpected_shape');
    }
    state.gaps = result.gaps.map(g => ({
      skill: g.skill || 'Unnamed skill',
      level: ['acquired','in-progress','gap'].includes(g.level) ? g.level : 'gap',
      pct: typeof g.pct === 'number' ? Math.max(0, Math.min(100, Math.round(g.pct))) : 20,
      note: g.note || ''
    }));
    state.weeks = result.weeks.map((w, i) => ({
      title: w.title || `Week ${i+1}`,
      status: i === 0 ? 'current' : 'upcoming',
      objectives: Array.isArray(w.objectives) ? w.objectives.map(o => ({ t: o.t || String(o), done: false })) : [],
      resources: Array.isArray(w.resources) ? w.resources.map(r => ({ type: r.type || 'Resource', title: r.title || '' })) : [],
      practiceTask: w.practiceTask || '',
      tasks: Array.isArray(w.tasks) ? w.tasks.map(t => ({ text: t.text || String(t), done: false })) : []
    }));
    state.activeWeek = 0;
    state.aiUnavailable = false;
  } catch (err) {
    console.error('AI analysis failed, falling back to sample plan:', err);
    state.aiUnavailable = true;
    state.aiError = describeAIError(err);
    generateFakePlan();
  }

  state.aiLoading = false;
  state.submitted = true;
  state.activeTab = 'dashboard';
  saveState(state);
  render();
}

function describeAIError(err) {
  const msg = (err && err.message) || String(err);
  if (msg.includes('backend_unreachable')) {
    return 'Could not reach the AI backend (/api/generate) — showing a sample plan. If you\'re developing locally, make sure you\'re running `vercel dev`, not just opening index.html directly.';
  }
  if (msg.includes('missing_api_key')) {
    return 'GEMINI_API_KEY is not set on the server yet — showing a sample plan instead. See README.md.';
  }
  if (msg.includes('gemini_http_429') || msg.includes('rate')) {
    return 'AI provider rate-limited this request — showing a sample plan instead. Try again shortly.';
  }
  return 'Could not generate your plan right now — showing a sample plan instead. Check the browser console for details.';
}

/* ================= HELPERS ================= */
function initials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).map(p => p[0]).slice(0,2).join('').toUpperCase();
}
function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[ch]));
}
function logoHtml() {
  return `<div class="brand-mark w-8 h-8 bg-slate-900 rounded-xl flex items-center justify-center p-1.5 shadow-sm">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" class="w-full h-full text-white stroke-[2.5]" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="7" cy="7" r="1.5" fill="currentColor" />
      <circle cx="17" cy="17" r="1.5" fill="currentColor" />
      <path d="M7 9c0 4 10 2 10 6" />
    </svg>
  </div>`;
}
function getOfflineChatResponse(userQuery) {
  const query = userQuery.toLowerCase();
  if (query.includes('next') || query.includes('step') || query.includes('focus')) {
    return 'Your next best step is to complete your active weekly objectives in the Weekly Plan section, focusing on foundational concepts first.';
  } else if (query.includes('streak') || query.includes('track')) {
    return 'Keep your momentum going! Complete at least one learning activity or practice task daily to extend your streak.';
  } else if (query.includes('gap') || query.includes('skill')) {
    return 'Your skill gap analysis compares your current profile against your target role. Check the Capability Analysis section to see high-priority missing skills.';
  } else if (query.includes('resource') || query.includes('project')) {
    return 'Recommended resources and mini-project tasks are tailored to your current level in the active week card.';
  }
  return "I'm currently operating in offline mode, but you can continue tracking your progress, checking off weekly tasks, and reviewing your skill gaps right here on your dashboard!";
}
function ringSVG(pct, size=54, stroke=5) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const offset = c - (pct/100) * c;
  return `<div class="ring-wrap" style="width:${size}px;height:${size}px;">
    <svg width="${size}" height="${size}">
      <circle cx="${size/2}" cy="${size/2}" r="${r}" stroke="var(--border)" stroke-width="${stroke}" fill="none"/>
      <circle cx="${size/2}" cy="${size/2}" r="${r}" stroke="var(--primary)" stroke-width="${stroke}" fill="none"
        stroke-dasharray="${c}" stroke-dashoffset="${offset}" stroke-linecap="round"/>
    </svg>
    <div class="ring-pct">${pct}%</div>
  </div>`;
}
function weekPct(w) { const d = w.tasks.filter(t=>t.done).length; return w.tasks.length ? Math.round(d/w.tasks.length*100) : 0; }

function buildCalendar() {
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const first = new Date(year, month, 1);
  const startDow = (first.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayDate = now.getDate();
  const activityDays = new Set([2,3,5,6,9,10,12,13,16]); // demo activity, not yet derived from real history
  let cells = '';
  const dows = ['M','T','W','T','F','S','S'];
  const dowRow = dows.map(d => `<div class="cal-dow">${d}</div>`).join('');
  for (let i=0;i<startDow;i++) cells += `<div class="cal-cell muted"></div>`;
  for (let d=1; d<=daysInMonth; d++) {
    const isToday = d === todayDate;
    cells += `<div class="cal-cell ${isToday?'today':''}">${d}${activityDays.has(d)?'<div class="cal-dot"></div>':''}</div>`;
  }
  return { dowRow, cells, monthLabel: now.toLocaleDateString('en-US',{month:'long',year:'numeric'}) };
}

/* ================= RENDER ================= */
function render() {
  const app = document.getElementById('app');
  if (state.aiLoading) {
    app.innerHTML = renderLoading();
  } else {
    app.innerHTML = state.submitted ? renderShell() : renderOnboarding();
  }
  attachHandlers();
}

function renderLoading() {
  return `
    <div style="max-width:480px;margin:120px auto 0;text-align:center;padding:20px;">
      <div class="logo" style="justify-content:center;margin-bottom:22px;">
        <div class="logo-text">Edu<span class="logo-accent">Path</span></div>
      </div>
      <div style="width:34px;height:34px;border:3px solid var(--border);border-top-color:var(--primary);border-radius:50%;margin:0 auto 18px;animation:spin 0.8s linear infinite;"></div>
      <h1 style="font-size:19px;margin-bottom:8px;">Mapping your path</h1>
      <p class="hero-line" style="margin:0 auto;">Analyzing your background against your target role and building a starter plan.</p>
    </div>
    <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
  `;
}

function renderOnboarding() {
  const fileChips = state.files.map((f,i) => `<div class="file-chip">${f}<button data-remove-file="${i}">✕</button></div>`).join('');
  return `
    <div class="app-root min-h-screen w-full bg-slate-50 flex flex-col">
    <header class="site-header w-full bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
      <div class="logo">${logoHtml()}<div class="logo-text">Edu<span class="logo-accent">Path</span></div></div>
      <nav class="header-links"><a href="#features">Features</a><a href="#how-it-works">How It Works</a><a href="#about">About</a></nav>
      <button class="header-chat-link" data-chat-open>Ask EduPath</button>
      <a class="primary" href="#onboarding">Get Started</a>
    </header>
    <div id="onboarding" class="w-full max-w-7xl mx-auto px-6 py-12">
      <section class="hero-section grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div class="hero-copy">
          <div class="hero-badge split-badge">✨ Personalized learning, finally</div>
          <h1>Bridge your skill gap with <span>AI-driven learning paths.</span></h1>
          <p>Stop following one-size-fits-all curricula. EduPath analyzes your skills, identifies what's missing for your target role, and builds a roadmap that evolves with you.</p>
          <div class="hero-actions">
            <a class="hero-cta" href="#onboarding-form">Start your skill assessment <span>→</span></a>
            <div class="social-proof"><div class="avatar-stack"><span>AM</span><span>JT</span><span>KL</span></div><strong>Trusted by 2,400+ learners</strong></div>
          </div>
        </div>
        <div class="snapshot-card">
          <div class="snapshot-header"><div><div class="snapshot-label">YOUR LEARNING SNAPSHOT</div><h2>Full-stack AI engineer</h2></div><span class="target-badge">⌁</span></div>
          <div class="snapshot-metrics"><div><span>Match score</span><strong>68%</strong><small>+12% this month</small></div><div><span>Weekly goal</span><strong>4.5h</strong><small>On track</small></div><div><span>Streak</span><strong>12 days</strong><small>Best yet</small></div></div>
          <div class="snapshot-progress"><div><span>Week 1 progress</span><strong>42%</strong></div><div class="snapshot-track"><span></span></div><small>✓ 3 of 7 objectives complete</small></div>
          <div class="snapshot-next"><strong>⚡ Next up: Advanced TypeScript</strong><span>45 min · Official docs →</span></div>
        </div>
      </section>
      <div id="onboarding-form" class="card onboard-card">
        <div class="placeholder-note">Your info stays in this browser (localStorage) and is sent only to the AI provider configured in js/aiProvider.js when you build your plan.</div>
        <div class="field">
          <label>Your name</label>
          <input type="text" id="name" placeholder="e.g. Alex Kumar">
        </div>
        <div class="field">
          <label>Tell us about your experience <span class="opt">Optional</span></label>
          <textarea id="experience" placeholder="Paste your resume, background, or a few notes about what you've worked on..."></textarea>
        </div>
        <div class="field">
          <label>Or upload your resume, portfolio, or certificates <span class="opt">Optional</span></label>
          <div class="dropzone" id="dropzone">
            <div class="up-icon">⬆</div>
            <div class="up-title">Drop files here or click to browse</div>
            <div class="up-sub">PDF, DOCX, PNG or JPG · up to 10MB each · names only for now, no text extraction yet</div>
            <input type="file" id="fileInput" multiple style="display:none" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg">
          </div>
          ${fileChips ? `<div class="file-chip-row">${fileChips}</div>` : ''}
        </div>
        <div class="field">
          <label>Target role</label>
          <input type="text" id="targetRole" placeholder="e.g. Frontend Engineer">
        </div>
        <div class="field">
          <label>Career goal <span class="opt">Optional</span></label>
          <input type="text" id="goal" placeholder="e.g. Land my first role within 6 months">
        </div>
        <button class="primary" id="submitBtn">Build my learning path</button>
      </div>
    </div>
    ${renderAsk()}
    </div>
  `;
}

function sidebarHtml() {
  return `
    <header class="site-header w-full bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-50">
      <div class="logo">${logoHtml()}<div class="logo-text">Edu<span class="logo-accent">Path</span></div></div>
      <nav class="header-links"><a href="#features">Features</a><a href="#how-it-works">How It Works</a><a href="#about">About</a></nav>
      <button class="header-chat-link" data-chat-open>Ask EduPath</button>
      <button class="primary" data-tab="dashboard">Dashboard</button>
      <button class="secondary" data-action="logout">Start over</button>
    </header>
  `;
}

function topbarHtml(title) {
  return `
    <div class="topbar">
      <div>
        <div class="date">${todayLabel}</div>
        <h1>${title}</h1>
      </div>
      <div class="avatar">${initials(state.profile.name)}</div>
    </div>
  `;
}

function renderShell() {
  return `<div class="app-root min-h-screen w-full bg-slate-50 flex flex-col app-shell">${sidebarHtml()}<main class="main w-full flex-1"><div class="content dashboard-content w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 flex flex-col gap-8">${renderMain()}</div></main></div>`;
}

function renderMain() {
  const banner = (state.aiUnavailable || state.aiError)
    ? `<div class="placeholder-note">${state.aiError || 'AI features are not configured, showing a sample plan.'}</div>`
    : '';
  if (state.activeTab === 'dashboard') return banner + renderDashboard();
  if (state.activeTab === 'week') return banner + renderWeek();
  if (state.activeTab === 'progress') return banner + renderProgress();
  if (state.activeTab === 'ask') return banner + renderAsk();
  return '';
}

function renderDashboardLegacy() {
  const acquired = state.gaps.filter(g=>g.level==='acquired').length;
  const inProgress = state.gaps.filter(g=>g.level==='in-progress').length;
  const gapsCount = state.gaps.filter(g=>g.level==='gap').length;
  const cal = buildCalendar();
  const curWeek = state.weeks[state.activeWeek];
  const firstName = (state.profile.name || 'there').split(' ')[0];
  const dowLabels = ['M','T','W','T','F','S','S'];

  const streakRow = state.streak.days.map((d,i) => `
    <div class="streak-day">${dowLabels[i]}<div class="streak-dot ${d}">${d==='done'?'✓':''}</div></div>
  `).join('');

  const todaysTasks = curWeek.tasks.slice(0,3).map((t,i) => `
    <div class="task-chip ${t.done?'done':''}" data-today-task="${i}">
      <div class="task-check">${t.done?'✓':''}</div>
      <div><div class="t-title">${t.text}</div><div class="t-meta">${curWeek.title}</div></div>
    </div>
  `).join('');

  return `
    <h1 style="font-size:22px;margin-bottom:4px;">Hello, ${firstName}</h1>
    <p class="hero-line" style="margin-bottom:22px;">You're building toward <strong>${state.profile.targetRole || 'your target role'}</strong>. Here's your next best step.</p>

    <div class="grid-2">
      <div class="card">
        <div class="card-label">Your momentum</div>
        <h3>Daily streak</h3>
        <div class="streak-num">${state.streak.count}<span class="unit">days</span></div>
        <div class="streak-week">${streakRow}</div>
        <div class="streak-note">You're a few days from your best streak.</div>
      </div>
      <div class="card">
        <div class="card-label">${cal.monthLabel}</div>
        <h3>Activity calendar</h3>
        <div class="cal-grid">${cal.dowRow}${cal.cells}</div>
      </div>
    </div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div><div class="card-label">Today's focus</div><h3>Today's tasks</h3></div>
        <span style="font-size:12px;color:var(--text-muted);">${curWeek.tasks.filter(t=>t.done).length}/${curWeek.tasks.length} done</span>
      </div>
      <div class="task-chip-row" style="margin-top:12px;">${todaysTasks}</div>
    </div>

    <div class="grid-3 grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
      <div class="card stat-card"><div class="stat-icon acquired">✓</div><div><div class="stat-num">${acquired}</div><div class="stat-label">Skills acquired</div></div></div>
      <div class="card stat-card"><div class="stat-icon progress">↻</div><div><div class="stat-num">${inProgress}</div><div class="stat-label">In progress</div></div></div>
      <div class="card stat-card"><div class="stat-icon gap">!</div><div><div class="stat-num">${gapsCount}</div><div class="stat-label">Remaining gaps</div></div></div>
    </div>

    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <div><div class="card-label">This week's plan</div><h3>Week ${state.activeWeek+1}: ${curWeek.title}</h3></div>
        <button class="secondary" data-tab-jump="week">View weekly plan</button>
      </div>
      <div class="progress-bar-track"><div class="progress-bar-fill" style="width:${weekPct(curWeek)}%;"></div></div>
    </div>
  `;
}

function renderDashboard() {
  const acquired = state.gaps.filter(g=>g.level==='acquired').length;
  const inProgress = state.gaps.filter(g=>g.level==='in-progress').length;
  const gapsCount = state.gaps.filter(g=>g.level==='gap').length;
  const total = state.gaps.length || 1;
  const match = state.gaps.length ? Math.round(state.gaps.reduce((sum, g) => sum + g.pct, 0) / state.gaps.length) : 0;
  const curWeek = state.weeks[state.activeWeek];
  const firstName = (state.profile.name || 'there').split(' ')[0];
  const streakRow = state.streak.days.map((d,i) => `<div class="streak-day">${['M','T','W','T','F','S','S'][i]}<div class="streak-dot ${d}">${d==='done'?'✓':''}</div></div>`).join('');
  const todaysTasks = curWeek.tasks.slice(0,3).map((t,i) => `<div class="task-chip ${t.done?'done':''}" data-today-task="${i}"><div class="task-check">${t.done?'✓':''}</div><div><div class="t-title">${t.text}</div><div class="t-meta">${curWeek.title}</div></div></div>`).join('');
  const skillBars = state.gaps.map(g => {
    const color = g.level==='acquired' ? '#10b981' : g.level==='in-progress' ? '#0f172a' : '#f59e0b';
    return `<div class="skill-bar-row"><div class="skill-bar-top"><span>${g.skill}</span><span style="color:var(--text-muted)">${g.pct}%</span></div><div class="skill-bar-track"><div class="skill-bar-fill" style="width:${g.pct}%;background:${color}"></div></div></div>`;
  }).join('');

  return `
    <section class="dashboard-hero">
      <div><div class="card-label">Your learning workspace</div><h1>Hello, ${firstName}</h1><p class="hero-line">You're building toward <strong>${state.profile.targetRole || 'your target role'}</strong>. Here's your next best step.</p></div>
      <button class="primary" data-chat-open>Ask EduPath AI</button>
    </section>

    <div class="grid-3">
      <div class="card summary-card"><div class="card-label">Target role</div><div class="summary-value">${state.profile.targetRole || 'Your target role'}</div><span class="summary-badge">4-week roadmap</span></div>
      <div class="card summary-card"><div class="card-label">Profile match</div><div class="summary-value">${match}% matched</div><span class="summary-badge">Based on your profile</span></div>
      <div class="card summary-card"><div class="card-label">Learning streak</div><div class="summary-value">🔥 ${state.streak.count} days</div><div class="streak-week">${streakRow}</div></div>
    </div>

    <div class="analytics-grid grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
      <section class="card"><div class="card-label">Capability analysis</div><h3>Where you stand today</h3><div class="donut-wrap"><div class="donut-chart"><div class="donut-center"><strong>${match}%</strong><span>profile match</span></div></div><div class="legend-stack"><div class="legend-item"><span class="legend-name">Skills acquired</span><strong>${acquired}</strong></div><div class="legend-item"><span class="legend-name slate">In progress</span><strong>${inProgress}</strong></div><div class="legend-item"><span class="legend-name amber">Remaining gaps</span><strong>${gapsCount}</strong></div></div></div><div class="stack-bar"><div class="stack-seg acquired" style="width:${acquired/total*100}%"></div><div class="stack-seg progress" style="width:${inProgress/total*100}%"></div><div class="stack-seg gap" style="width:${gapsCount/total*100}%"></div></div></section>
      <section class="card"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px"><div><div class="card-label">Overall progress</div><h3>Your capability report</h3></div><span class="summary-badge">${match}% complete</span></div><div style="margin-top:18px">${skillBars}</div></section>
    </div>

    <section class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><div><div class="card-label">Today's focus</div><h3>Small steps, real momentum</h3></div><span style="font-size:12px;color:var(--text-muted)">${curWeek.tasks.filter(t=>t.done).length}/${curWeek.tasks.length} done</span></div><div class="task-chip-row" style="margin-top:14px">${todaysTasks}</div></section>
    ${renderWeek()}
    <div id="ask-panel">${renderAsk()}</div>
  `;
}

function renderWeek() {
  const w = state.weeks[state.activeWeek];
  const pct = weekPct(w);
  const tabs = state.weeks.map((wk,i) => {
    const cls = wk.status==='done'?'done':wk.status==='current'?'current':'';
    const status = wk.status==='done' ? '✓ Done' : wk.status==='current' ? `${weekPct(wk)}%` : '—';
    return `<div class="roadmap-tab ${cls} ${i===state.activeWeek?'active':''}" data-jump="${i}">
      <div class="w-label">W${i+1}</div><div class="w-title">${wk.title}</div><div class="w-status">${status}</div>
    </div>`;
  }).join('');

  const objectives = w.objectives.map(o => `
    <div class="obj-row ${o.done?'done':''}"><div class="obj-num">${o.done?'✓':''}</div><div><div class="obj-title">${o.t}</div></div></div>
  `).join('');

  const resources = w.resources.map(r => `<div class="resource-row"><span class="res-tag">${r.type}</span><span>${r.title}</span></div>`).join('');

  const checklist = w.tasks.map((t,i) => `
    <div class="task-chip ${t.done?'done':''}" data-task="${i}" style="flex:0 0 auto;">
      <div class="task-check">${t.done?'✓':''}</div><div class="t-title">${t.text}</div>
    </div>`).join('');

  return `
    <div class="card-label">Your roadmap</div>
    <h1 style="font-size:22px;margin-bottom:6px;">Weekly plan</h1>
    <p class="hero-line" style="margin-bottom:18px;">A clear sequence of small steps, built around your target role.</p>
    <div class="roadmap-tabs">${tabs}</div>

    <div class="grid-2 roadmap-grid grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div><div class="card-label">Week ${state.activeWeek+1}</div><h3>${w.title}</h3></div>
          ${ringSVG(pct)}
        </div>
        <div style="margin-top:12px;">${objectives}</div>
        <div class="week-task-list"><div class="card-label">Weekly tasks</div><div class="task-chip-row">${checklist}</div></div>
        <div class="mini-project">
          <div class="card-label">Mini project</div>
          <div style="font-size:14px;font-weight:500;margin-bottom:4px;">${w.practiceTask}</div>
          <button class="secondary" style="margin-top:6px;">Start practice</button>
        </div>
      </div>
      <div class="card">
        <div class="card-label">Curated for you</div>
        <h3>Recommended resources</h3>
        <div style="margin-top:10px;">${resources}</div>
      </div>
    </div>

  `;
}

function renderProgress() {
  const acquired = state.gaps.filter(g=>g.level==='acquired');
  const inProgress = state.gaps.filter(g=>g.level==='in-progress');
  const gaps = state.gaps.filter(g=>g.level==='gap');
  const total = state.gaps.length || 1;

  const stackBar = `
    <div class="stack-bar">
      <div class="stack-seg acquired" style="width:${acquired.length/total*100}%"></div>
      <div class="stack-seg progress" style="width:${inProgress.length/total*100}%"></div>
      <div class="stack-seg gap" style="width:${gaps.length/total*100}%"></div>
    </div>
    <div class="legend-row">
      <span><span class="legend-dot" style="background:var(--primary)"></span>Acquired (${acquired.length})</span>
      <span><span class="legend-dot" style="background:var(--amber)"></span>In progress (${inProgress.length})</span>
      <span><span class="legend-dot" style="background:var(--coral)"></span>Gaps (${gaps.length})</span>
    </div>
  `;

  const skillBars = state.gaps.map(g => {
    const color = g.level==='acquired' ? 'var(--primary)' : g.level==='in-progress' ? 'var(--amber)' : 'var(--coral)';
    return `<div class="skill-bar-row">
      <div class="skill-bar-top"><span>${g.skill}</span><span style="color:var(--text-muted)">${g.pct}%</span></div>
      <div class="skill-bar-track"><div class="skill-bar-fill" style="width:${g.pct}%;background:${color};"></div></div>
    </div>`;
  }).join('');

  const sparkline = state.weeks.map((w,i) => {
    const p = weekPct(w);
    return `<div class="spark-col">
      <div class="spark-bar ${i===state.activeWeek?'current':''}" style="height:${Math.max(p,4)}%;"></div>
      <div class="spark-label">W${i+1}</div>
    </div>`;
  }).join('');

  return `
    <div class="card-label">Snapshot</div>
    <h1 style="font-size:22px;margin-bottom:6px;">Progress report</h1>
    <p class="hero-line" style="margin-bottom:18px;">A visual read on where things stand, based on your real plan and checked-off tasks.</p>

    <div class="card">
      <h3>Skill distribution</h3>
      ${stackBar}
    </div>

    <div class="grid-2">
      <div class="card">
        <h3>Per-skill progress</h3>
        <div style="margin-top:12px;">${skillBars}</div>
      </div>
      <div class="card">
        <h3>Weekly momentum</h3>
        <div class="sparkline">${sparkline}</div>
      </div>
    </div>

    <div class="card">
      <h3>Recommended next steps</h3>
      <ul class="plain">
        <li>Finish this week's tasks and check them off to update this report</li>
        <li>Revisit any skill still marked as a gap once you've made progress</li>
      </ul>
    </div>
  `;
}

function renderAsk() {
  const messages = state.chat.map(m => `<div class="msg ${m.role}">${escapeHtml(m.text)}</div>`).join('');
  const suggestions = ['Explain my next step', 'Why do I need Docker?'];
  const drawerState = state.chatOpen ? 'translate-x-0' : 'translate-x-full';
  return `
    <button class="chat-trigger fixed bottom-6 right-6 z-50 bg-slate-900 hover:bg-slate-800 text-white p-4 rounded-full shadow-lg flex items-center justify-center cursor-pointer transition-transform hover:scale-105" data-chat-open aria-label="Open EduPath AI Assistant">💬</button>
    <div class="chat-backdrop fixed inset-0 z-40 ${state.chatOpen ? 'is-visible' : ''}" data-chat-close></div>
    <aside class="chat-drawer fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-2xl border-l border-slate-200 transition-transform duration-300 ease-in-out transform ${drawerState}" aria-label="EduPath AI Assistant">
      <div class="chat-drawer-header"><div><strong>EduPath AI Assistant</strong><span><i></i> Online</span></div><button class="chat-close" data-chat-close aria-label="Close chat">✕</button></div>
      <div class="chat-log flex-1 overflow-y-auto p-4 space-y-4" id="chatLog">
        <div class="msg agent">Ask me about your roadmap, skill gaps, or what to focus on next.</div>${messages}
        ${state.chatLoading ? '<div class="msg agent">Thinking...</div>' : ''}
        ${state.chatError ? `<div class="placeholder-note">${escapeHtml(state.chatError)}</div>` : ''}
      </div>
      <div class="chat-drawer-footer">
        <div class="suggested-row">${suggestions.map(s=>`<button class="suggested-chip" data-suggest="${s}">${s}</button>`).join('')}</div>
        <div class="chat-input-row">
          <input type="text" id="chatInput" placeholder="Ask a question...">
          <button class="primary" id="chatSend" ${state.chatLoading ? 'disabled' : ''}>Send</button>
        </div>
      </div>
    </aside>
  `;
}

/* ================= HANDLERS ================= */
function attachHandlers() {
  const submitBtn = document.getElementById('submitBtn');
  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      state.profile.name = document.getElementById('name').value;
      state.profile.experience = document.getElementById('experience').value;
      state.profile.targetRole = document.getElementById('targetRole').value || 'your target role';
      state.profile.goal = document.getElementById('goal').value;
      runAIAnalysis();
    });
  }

  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      Array.from(fileInput.files).forEach(f => state.files.push(f.name));
      render();
    });
  }
  document.querySelectorAll('[data-remove-file]').forEach(el => {
    el.addEventListener('click', (e) => { e.stopPropagation(); state.files.splice(parseInt(el.dataset.removeFile),1); render(); });
  });

  document.querySelectorAll('.nav-item[data-tab]').forEach(el => {
    el.addEventListener('click', () => { state.activeTab = el.dataset.tab; render(); });
  });

  const logoutBtn = document.querySelector('[data-action="logout"]');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      state.submitted = false;
      state.activeTab = 'dashboard';
      state.files = [];
      state.chat = [];
      state.chatOpen = false;
      state.aiUnavailable = false;
      state.aiError = null;
      state.profile = { name: '', experience: '', skills: '', targetRole: '', goal: '' };
      clearState();
      render();
    });
  }

  document.querySelectorAll('[data-tab-jump]').forEach(el => {
    el.addEventListener('click', () => { state.activeTab = el.dataset.tabJump; render(); });
  });
  document.querySelectorAll('.roadmap-tab[data-jump]').forEach(el => {
    el.addEventListener('click', () => { state.activeWeek = parseInt(el.dataset.jump); render(); });
  });
  document.querySelectorAll('[data-task]').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.task);
      const w = state.weeks[state.activeWeek];
      w.tasks[idx].done = !w.tasks[idx].done;
      saveState(state);
      render();
    });
  });
  document.querySelectorAll('[data-today-task]').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.todayTask);
      const w = state.weeks[state.activeWeek];
      w.tasks[idx].done = !w.tasks[idx].done;
      saveState(state);
      render();
    });
  });

  document.querySelectorAll('[data-chat-open]').forEach(el => {
    el.addEventListener('click', () => { state.chatOpen = true; render(); });
  });
  document.querySelectorAll('[data-chat-close]').forEach(el => {
    el.addEventListener('click', () => { state.chatOpen = false; render(); });
  });

  const chatSend = document.getElementById('chatSend');
  const sendMsg = async (text) => {
    if (!text) return;
    state.chat.push({ role:'user', text });
    state.chatLoading = true;
    state.chatError = null;
    saveState(state);
    render();
    try {
      const prompt = `You are EduPath, a concise and practical learning-path coach. Answer the learner's question using their profile and current plan below. Do not invent progress or skills. Return ONLY a JSON object in exactly this shape: {"answer":"string"}.

Learner profile:
- Name: ${state.profile.name || 'not provided'}
- Target role: ${state.profile.targetRole || 'not provided'}
- Goal: ${state.profile.goal || 'not specified'}
- Experience: ${state.profile.experience || 'not provided'}

Current skill gaps:
${JSON.stringify(state.gaps)}

Current learning plan:
${JSON.stringify(state.weeks)}

Learner question: ${text}`;
      const result = await window.EduPathAI.callAI(prompt);
      const answer = result && typeof result.answer === 'string' ? result.answer.trim() : '';
      if (!answer) throw new Error('unexpected_chat_shape');
      state.chat.push({ role:'agent', text: answer });
    } catch (err) {
      console.error('Chat request failed:', err);
      state.chat.push({ role:'agent', text: getOfflineChatResponse(text) });
      state.chatError = describeAIError(err);
    } finally {
      state.chatLoading = false;
      saveState(state);
      render();
      setTimeout(()=>{ const log=document.getElementById('chatLog'); if(log) log.scrollTop=log.scrollHeight; },0);
    }
  };
  if (chatSend) {
    chatSend.addEventListener('click', () => { const i=document.getElementById('chatInput'); sendMsg(i.value.trim()); });
  }
  document.querySelectorAll('[data-suggest]').forEach(el => {
    el.addEventListener('click', () => sendMsg(el.dataset.suggest));
  });
}

render();
