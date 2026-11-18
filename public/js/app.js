// FINAL OVERRIDE — Main Application Client

let gameState = null;
let liveTimerInterval = null;
let lobbyPollInterval = null;
let currentMorsePattern = null;
let antiCheatInitDone = false;
let lastBlurTime = 0;

// ── Admin Session Management ──────────────────────────────────────────────────
let adminHeartbeatInterval = null;

function getAdminSessionId() {
  return sessionStorage.getItem('fo_admin_session_id') || null;
}
function setAdminSessionId(id) {
  sessionStorage.setItem('fo_admin_session_id', id);
}
function clearAdminSession() {
  sessionStorage.removeItem('fo_admin_pin');
  sessionStorage.removeItem('fo_admin_session_id');
  if (adminHeartbeatInterval) { clearInterval(adminHeartbeatInterval); adminHeartbeatInterval = null; }
}
function startAdminHeartbeat(pin) {
  if (adminHeartbeatInterval) clearInterval(adminHeartbeatInterval);
  adminHeartbeatInterval = setInterval(async () => {
    const sid = getAdminSessionId();
    if (!sid) return;
    try {
      await fetch('/api/admin/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-pin': pin },
        body: JSON.stringify({ sessionId: sid })
      });
    } catch (_) {}
  }, 20000); // every 20 seconds
}

// Release slot on page unload
window.addEventListener('beforeunload', () => {
  const sid = getAdminSessionId();
  const pin = sessionStorage.getItem('fo_admin_pin');
  if (sid && pin) {
    navigator.sendBeacon('/api/admin/logout-session', JSON.stringify({ sessionId: sid }));
  }
});

// ── Vercel-only: Is this a production deployment? ────────────────────────────
function isVercelDeployment() {
  const host = window.location.hostname;
  // localhost, 127.x, 10.x, 192.168.x, 172.x → local
  return !(host === 'localhost' || host === '127.0.0.1' ||
    /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host));
}

// Anti-cheat alert notification banner
function showCheatAlert(msg) {
  const existing = document.getElementById('cheat-alert-box');
  if (existing) existing.remove();

  const container = document.getElementById('app-main');
  const alertEl = document.createElement('div');
  alertEl.id = 'cheat-alert-box';
  alertEl.className = 'cheat-alert-banner';
  alertEl.innerHTML = `
    <span style="font-size: 1.6rem;">🚨</span>
    <div style="flex: 1;">
      <div style="font-weight: bold; color: var(--bad); font-size: 1.05rem;">Anti-Cheat Violation Detected!</div>
      <div style="font-size: 0.92rem; margin-top: 2px;">${escapeHtml(msg)}</div>
    </div>
    <button class="btn btn-sm btn-outline" style="border-color: var(--bad); color: var(--bad);" onclick="this.parentElement.remove()">Dismiss</button>
  `;
  if (container && container.firstChild) {
    container.insertBefore(alertEl, container.firstChild);
  } else if (container) {
    container.appendChild(alertEl);
  }
}

// Anti-cheat tab switch detection
function initAntiCheat() {
  if (antiCheatInitDone) return;
  antiCheatInitDone = true;

  async function handleTabLeave() {
    if (!gameState || !gameState.team || gameState.team.finishedAt || gameState.waitingInLobby || getRoute() !== 'game') {
      return;
    }
    lastBlurTime = Date.now();
  }

  async function handleTabReturn() {
    if (!lastBlurTime) return;
    const elapsed = Date.now() - lastBlurTime;
    lastBlurTime = 0;

    // Minimum 1500ms to avoid false triggers during modal/system popups
    if (elapsed < 1500) return;
    if (!gameState || !gameState.team || gameState.team.finishedAt || gameState.waitingInLobby || getRoute() !== 'game') {
      return;
    }

    try {
      const res = await fetch('/api/tab-penalty', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          showCheatAlert(`Tab shift or external window switch detected! +${data.penaltyAdded} min penalty applied (Violation #${data.tabSwitches}). Total penalty is now +${data.totalPenaltyMin}m.`);
          const updatedState = await fetchState();
          if (updatedState) {
            gameState = updatedState;
            updateStickyBar(updatedState);
          }
        }
      }
    } catch (err) {
      console.error('Failed to report tab switch:', err);
    }
  }

  window.addEventListener('blur', handleTabLeave);
  window.addEventListener('focus', handleTabReturn);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      handleTabLeave();
    } else {
      handleTabReturn();
    }
  });
}

// Routing helpers
function getRoute() {
  const path = window.location.pathname;
  if (path.startsWith('/coordinator') || path.startsWith('/admin')) return 'portal';
  if (path.startsWith('/leaderboard')) return 'leaderboard';
  return 'game';
}

function updateNavActive() {
  const route = getRoute();
  const gameLink = document.getElementById('nav-link-game');
  const lbLink = document.getElementById('nav-link-leaderboard');
  const adminLink = document.getElementById('nav-link-admin');

  if (gameLink) gameLink.classList.toggle('active', route === 'game');
  if (lbLink) lbLink.classList.toggle('active', route === 'leaderboard');
  if (adminLink) adminLink.classList.toggle('active', route === 'portal');
}

function navigateTo(path) {
  window.history.pushState({}, '', path);
  renderApp();
}

window.addEventListener('popstate', () => {
  renderApp();
});

// Toast notification
function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 2400);
}

// Fetch team state from server
async function fetchState() {
  try {
    const res = await fetch('/api/state');
    if (res.status === 401) {
      return null;
    }
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('Failed to fetch state:', err);
    return null;
  }
}

// Format duration
function formatDuration(totalSeconds) {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// Initialize Application
async function init() {
  initAntiCheat();

  // Intercept nav links for smooth SPA navigation
  document.querySelectorAll('.portal-nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const href = link.getAttribute('href');
      navigateTo(href);
    });
  });

  // Shortcut for Organisers: Alt + A or double-clicking the logo navigates to /admin
  window.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      navigateTo('/admin');
    }
  });
  const logo = document.querySelector('.club-logo');
  if (logo) {
    logo.style.cursor = 'pointer';
    logo.addEventListener('dblclick', () => navigateTo('/admin'));
    let lastTap = 0;
    logo.addEventListener('touchend', (e) => {
      const currentTime = Date.now();
      const tapLen = currentTime - lastTap;
      if (tapLen < 400 && tapLen > 40) {
        e.preventDefault();
        navigateTo('/admin');
      }
      lastTap = currentTime;
    });
  }

  renderApp();
}

async function renderApp() {
  updateNavActive();
  const route = getRoute();
  const main = document.getElementById('app-main');
  const stickyBar = document.getElementById('sticky-status-bar');

  if (liveTimerInterval) {
    clearInterval(liveTimerInterval);
    liveTimerInterval = null;
  }
  if (lobbyPollInterval) {
    clearInterval(lobbyPollInterval);
    lobbyPollInterval = null;
  }

  if (route === 'portal') {
    stickyBar.style.display = 'none';
    renderMergedPortal(main);
  } else if (route === 'leaderboard') {
    stickyBar.style.display = 'none';
    renderLeaderboardView(main);
  } else {
    // Game Route
    const state = await fetchState();
    gameState = state;

    if (!state || !state.team) {
      stickyBar.style.display = 'none';
      renderStartScreen(main);
    } else if (state.team.finishedAt) {
      stickyBar.style.display = 'none';
      renderResultScreen(main, state);
    } else if (state.waitingInLobby || state.team.status === 'waiting') {
      stickyBar.style.display = 'none';
      renderWaitingLobby(main, state);
    } else {
      stickyBar.style.display = 'block';
      updateStickyBar(state);
      renderStageScreen(main, state);
      startLiveTimer(state);
    }
  }
}

// ==========================================================================
// Waiting Lobby (Start Together Mode)
// ==========================================================================
function renderWaitingLobby(container, state) {
  if (lobbyPollInterval) clearInterval(lobbyPollInterval);

  const team = state.team;
  const members = state.members || [];
  const memberListHtml = members.map(m => `
    <li style="padding: 6px 0; border-bottom: 1px dashed var(--line); display: flex; justify-content: space-between; align-items: center;">
      <span>${m.isLeader ? '👑' : '👤'} <strong>${escapeHtml(m.fullName)}</strong></span>
      <span style="color: ${m.isLeader ? 'var(--gold)' : 'var(--muted)'}; font-size: 0.85rem;">${m.isLeader ? 'Squad Leader' : 'Operative'}</span>
    </li>
  `).join('');

  container.innerHTML = `
    <div class="card lobby-card">
      <div class="lobby-pulse-ring">⏳</div>
      <h2 style="font-size: 1.8rem; color: var(--gold); margin-bottom: 6px;">
        MISSION BRIEFING LOBBY
      </h2>
      <p style="font-size: 1rem; color: var(--muted); margin-bottom: 22px;">
        Department of Computer Science & Engineering · Invictors Club
      </p>

      <div style="background: rgba(3, 8, 19, 0.75); border: 1px solid var(--line); border-radius: var(--radius-md); padding: 18px 22px; max-width: 520px; margin: 0 auto 24px; text-align: left;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid var(--line); padding-bottom: 10px;">
          <div>
            <span style="font-size: 0.78rem; color: var(--muted); text-transform: uppercase;">Team ID</span>
            <div style="font-size: 1.3rem; font-weight: bold; color: var(--accent);">${escapeHtml(team.name)}</div>
          </div>
          <div style="text-align: right;">
            <span style="font-size: 0.78rem; color: var(--muted); text-transform: uppercase;">Coordinator</span>
            <div style="font-size: 1.1rem; font-weight: bold; color: var(--gold);">${escapeHtml(team.coordinator)}</div>
          </div>
        </div>

        <div style="margin-bottom: 8px; font-weight: bold; font-size: 0.9rem; color: var(--txt);">Registered Operatives:</div>
        <ul style="list-style: none; margin: 0; padding: 0;">
          ${memberListHtml}
        </ul>
      </div>

      <div style="display: inline-block; background: rgba(39, 180, 255, 0.12); border: 2px solid var(--accent); border-radius: var(--radius-md); padding: 16px 28px; margin-bottom: 14px;">
        <div style="font-size: 1.15rem; font-weight: bold; color: var(--accent); animation: pulseText 1.5s infinite;">
          📡 Stand by! Waiting for Event Organiser to launch the mission...
        </div>
        <p style="color: var(--muted); font-size: 0.88rem; margin: 6px 0 0;">
          All teams will start together simultaneously. Keep this screen open; do not refresh.
        </p>
      </div>

      <div style="font-size: 0.88rem; color: var(--muted); margin-top: 8px;">
        Teams currently waiting in lobby: <strong style="color: var(--gold);">${state.waitingCount || 1}</strong>
      </div>
    </div>
  `;

  lobbyPollInterval = setInterval(async () => {
    try {
      const s = await fetchState();
      if (s && s.team) {
        if (!s.waitingInLobby && s.team.status !== 'waiting') {
          clearInterval(lobbyPollInterval);
          lobbyPollInterval = null;
          showToast('🚀 Mission launched! Good luck, Agents!');
          renderApp();
        }
      }
    } catch {}
  }, 2000);
}

// ==========================================================================
// Sticky Status Bar & Rail
// ==========================================================================
function updateStickyBar(state) {
  const team = state.team;
  document.getElementById('status-team-name').textContent = team.name;
  document.getElementById('status-coord-name').textContent = team.coordinator;
  document.getElementById('status-penalty').textContent = `+${team.penaltyMin}m`;

  // Update progress bar width
  const progressPercent = Math.min(100, Math.round(((team.stage - 1) / 6) * 100));
  document.getElementById('stage-progress-fill').style.width = `${progressPercent}%`;

  // Update 6-step rail
  const railSteps = document.querySelectorAll('.rail-step');
  const stageIcons = ['🎧 1', '🔓 2', '🤖 3', '🚩 4', '🤝 5', '🧩 6'];

  railSteps.forEach((el, idx) => {
    const stageNum = idx + 1;
    el.className = 'rail-step';
    if (stageNum < team.stage) {
      el.classList.add('done');
      el.textContent = `✅ ${stageNum}`;
    } else if (stageNum === team.stage) {
      el.classList.add('current');
      el.textContent = stageIcons[idx];
    } else {
      el.textContent = stageIcons[idx];
    }
  });
}

function startLiveTimer(initialState) {
  let start = initialState.team.startedAt;
  let penalty = initialState.team.penaltyMin;
  let pausedMs = initialState.team.pausedMs || 0;
  let isPaused = initialState.team.isPaused;

  const timerEl = document.getElementById('status-time-display');

  function update() {
    if (isPaused) {
      timerEl.textContent = 'PAUSED';
      return;
    }
    const now = Date.now();
    let elapsedMs = now - start - pausedMs;
    if (elapsedMs < 0) elapsedMs = 0;
    const totalSecs = Math.floor(elapsedMs / 1000) + penalty * 60;
    timerEl.textContent = formatDuration(totalSecs);
  }

  update();
  let syncTicks = 0;
  liveTimerInterval = setInterval(async () => {
    update();
    syncTicks++;
    if (syncTicks % 4 === 0) {
      try {
        const s = await fetchState();
        if (s && s.team) {
          if (s.team.isPaused !== isPaused || s.team.stage !== initialState.team.stage || s.waitingInLobby) {
            renderApp();
          } else {
            penalty = s.team.penaltyMin;
            pausedMs = s.team.pausedMs || 0;
            const penEl = document.getElementById('status-penalty');
            if (penEl) penEl.textContent = `+${penalty}m`;
          }
        }
      } catch {}
    }
  }, 1000);
}

// ==========================================================================
// Start Screen (Registration & Member Join)
// ==========================================================================
async function renderStartScreen(container) {
  let coordinators = ['Arun', 'Divya', 'Kiran', 'Pooja', 'Rakshith'];
  try {
    const cfgRes = await fetch('/api/config');
    if (cfgRes.ok) {
      const cfg = await cfgRes.json();
      if (cfg.coordinators && cfg.coordinators.length) coordinators = cfg.coordinators;
    }
  } catch {}

  const coordOptions = coordinators.map(c => `<option value="${c}">`).join('');

  container.innerHTML = `
    <!-- The 5 Stages Showcase Card (from Official Poster) -->
    <div class="card poster-stages-section">
      <div class="poster-stages-heading">⚡ THE 5 STAGES OF OVERRIDE ⚡</div>
      <div class="poster-stages-grid">
        <div class="stage-poster-card s1">
          <div class="stage-badge-num">1</div>
          <div style="font-size: 1.6rem;">📡</div>
          <div class="stage-poster-title">Signal Intercept</div>
          <div class="stage-poster-desc">Decode 4-sector Morse telemetry and matrix frequencies</div>
        </div>
        <div class="stage-poster-card s2">
          <div class="stage-badge-num">2</div>
          <div style="font-size: 1.6rem;">🔓</div>
          <div class="stage-poster-title">Decoding</div>
          <div class="stage-poster-desc">Unwrap 3 layers of encrypted ciphers</div>
        </div>
        <div class="stage-poster-card s3">
          <div class="stage-badge-num">3</div>
          <div style="font-size: 1.6rem;">🤖</div>
          <div class="stage-poster-title">Prompt AI</div>
          <div class="stage-poster-desc">Bypass WARDEN AI security protocols</div>
        </div>
        <div class="stage-poster-card s4">
          <div class="stage-badge-num">4</div>
          <div style="font-size: 1.6rem;">🚩</div>
          <div class="stage-poster-title">CTF Flags</div>
          <div class="stage-poster-desc">Hunt terminal tokens & inspect web metadata</div>
        </div>
        <div class="stage-poster-card s5">
          <div class="stage-badge-num">5</div>
          <div style="font-size: 1.6rem;">🧩</div>
          <div class="stage-poster-title">Sync & Override</div>
          <div class="stage-poster-desc">Merge all squad member shards & unlock vault</div>
        </div>
      </div>
    </div>

    <!-- Story Card -->
    <div class="card">
      <h2 class="card-title">📖 Mission Storyline</h2>
      <p style="font-size: 1.05rem; line-height: 1.7; color: var(--txt-body);">
        "Welcome, Agents! 🦸 The secret vault of Invictors Lab has initiated lockdown, and a stubborn guardian AI is shielding the master override key. Your squad is the tactical rescue unit. Collect secret fragment pieces 🧩 across 5 distinct puzzle stages, coordinate across your devices, and assemble the final master key to override the system. 🔐 The fastest verified team claims 1st place! 🏆"
      </p>
    </div>

    <!-- How to play Card -->
    <div class="card">
      <h2 class="card-title">🎮 Mission Rules & Guidelines</h2>
      <ul style="list-style: none; display: flex; flex-direction: column; gap: 12px; font-size: 0.98rem; line-height: 1.6; color: var(--txt-body);">
        <li><strong style="color: var(--cyan-neon);">1️⃣ Sequential Unlocks:</strong> Stages open one by one. Each stage yields a secret fragment.</li>
        <li><strong style="color: var(--cyan-neon);">2️⃣ Auto Notebook:</strong> Solved fragments are automatically recorded in your team's live notebook.</li>
        <li><strong style="color: var(--gold);">3️⃣ Hints:</strong> Need clues? 1st hint adds <span style="color:var(--gold);">+3m</span> penalty, 2nd hint adds <span style="color:var(--gold);">+5m</span> penalty.</li>
        <li><strong style="color: var(--ok);">4️⃣ Wrong Attempts:</strong> First 5 incorrect submissions are free. From the 6th onwards, each wrong try adds <span style="color:var(--bad);">+1m</span>.</li>
        <li><strong style="color: var(--stage5-color);">5️⃣ Team Synchronization:</strong> Stage 5 requires every team member on their own device to retrieve their individual shard!</li>
        <li><strong style="color: var(--bad);">🚨 Anti-Cheat:</strong> Tab switches and switching to unauthorized tools incur an automatic <span style="color:var(--bad);">+2m penalty</span>.</li>
      </ul>
    </div>

    <!-- Register Team Form -->
    <div class="card">
      <h2 class="card-title">📝 Register your team (3 or 4 players)</h2>
      <form id="team-register-form">
        <div class="form-group">
          <label for="reg-team-name">Team name or ID (max 24 characters) *</label>
          <input type="text" id="reg-team-name" class="input-control" maxlength="24" placeholder="e.g. CyberKnights" required />
        </div>
        <div class="form-group">
          <label for="reg-coordinator">Event coordinator name *</label>
          <input list="coord-list" id="reg-coordinator" class="input-control" placeholder="Select or type coordinator name" required />
          <datalist id="coord-list">
            ${coordOptions}
          </datalist>
        </div>
        <div class="form-group">
          <label for="reg-m1">Member 1 full name (Leader - this device) *</label>
          <input type="text" id="reg-m1" class="input-control" placeholder="Full name of leader" required />
        </div>
        <div class="form-group">
          <label for="reg-m2">Member 2 full name *</label>
          <input type="text" id="reg-m2" class="input-control" placeholder="Full name of member 2" required />
        </div>
        <div class="form-group">
          <label for="reg-m3">Member 3 full name *</label>
          <input type="text" id="reg-m3" class="input-control" placeholder="Full name of member 3" required />
        </div>
        <div class="form-group">
          <label for="reg-m4">Member 4 full name (optional)</label>
          <input type="text" id="reg-m4" class="input-control" placeholder="Full name of member 4 (optional)" />
        </div>
        <div id="reg-error" class="feedback-line error"></div>
        <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 12px; font-size: 1.1rem;">
          🚀 START MISSION
        </button>
      </form>
    </div>

    <!-- Member Join Form -->
    <div class="card">
      <h2 class="card-title">🙋 Joining as a team member?</h2>
      <p style="margin-bottom: 14px; font-size: 0.95rem; color: var(--muted);">
        "Use this on your own laptop when your leader reaches Mission 5. Type your team name and your full name exactly as registered."
      </p>
      <form id="member-join-form">
        <div class="form-group">
          <label for="join-team-name">Team name or ID *</label>
          <input type="text" id="join-team-name" class="input-control" placeholder="Team name" required />
        </div>
        <div class="form-group">
          <label for="join-member-name">Your full name *</label>
          <input type="text" id="join-member-name" class="input-control" placeholder="Your full name as registered" required />
        </div>
        <div id="join-error" class="feedback-line error"></div>
        <button type="submit" class="btn btn-gold" style="width: 100%; margin-top: 10px;">
          Show my shard
        </button>
      </form>
      <div id="shard-result-container" style="display: none; margin-top: 20px;"></div>
    </div>
  `;

  document.getElementById('team-register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('reg-error');
    errorEl.textContent = '';

    const payload = {
      teamName: document.getElementById('reg-team-name').value.trim(),
      coordinator: document.getElementById('reg-coordinator').value.trim(),
      member1: document.getElementById('reg-m1').value.trim(),
      member2: document.getElementById('reg-m2').value.trim(),
      member3: document.getElementById('reg-m3').value.trim(),
      member4: document.getElementById('reg-m4').value.trim()
    };

    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        errorEl.textContent = data.error || 'Registration failed.';
      } else {
        renderApp();
      }
    } catch {
      errorEl.textContent = 'Server connection error. Please try again.';
    }
  });

  document.getElementById('member-join-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('join-error');
    const resultBox = document.getElementById('shard-result-container');
    errorEl.textContent = '';
    resultBox.style.display = 'none';

    const payload = {
      teamName: document.getElementById('join-team-name').value.trim(),
      fullName: document.getElementById('join-member-name').value.trim()
    };

    try {
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        errorEl.textContent = data.error || 'Failed to retrieve shard.';
      } else {
        resultBox.style.display = 'block';
        resultBox.innerHTML = `
          <div class="shard-display-box">
            <p style="font-size: 1.1rem;">Hi <strong>${escapeHtml(data.name)}</strong>! Your shard for team <strong>${escapeHtml(data.team)}</strong>:</p>
            <div class="shard-token">${escapeHtml(data.shard)}</div>
            <p style="color: var(--gold); font-weight: bold; margin-top: 10px;">
              Tell it to your team leader. Keep it away from other teams!
            </p>
          </div>
        `;
      }
    } catch {
      errorEl.textContent = 'Server connection error.';
    }
  });
}

// ==========================================================================
// Fragment Notebook Card
// ==========================================================================
function renderNotebookHtml(notebook) {
  const keys = Object.keys(notebook || {});
  let chipsHtml = '';

  if (keys.length === 0) {
    chipsHtml = '<span class="chips-empty">Nothing yet. Solve Mission 1.</span>';
  } else {
    keys.sort((a, b) => Number(a) - Number(b)).forEach(stg => {
      chipsHtml += `<div class="fragment-chip">${stg}: ${escapeHtml(notebook[stg])}</div>`;
    });
  }

  return `
    <div class="notebook-card">
      <div class="notebook-header">
        📒 Fragment notebook
      </div>
      <div class="chips-container">
        ${chipsHtml}
      </div>
    </div>
  `;
}

// ==========================================================================
// Stage Screens (1 to 6)
// ==========================================================================
function renderStageScreen(container, state) {
  const team = state.team;
  const stage = team.stage;
  const content = state.stageContent || {};
  const currentProg = state.currentProg || { wrongAttempts: 0, hintsUsed: 0 };

  const stageTitles = {
    1: { icon: '📡', name: 'Signal Intercept & Morse Matrix' },
    2: { icon: '🔓', name: 'Decoding' },
    3: { icon: '🤖', name: 'Prompt the AI' },
    4: { icon: '🚩', name: 'CTF Challenges' },
    5: { icon: '🤝', name: 'Team Sync' },
    6: { icon: '🧩', name: 'Final Integration (the tough one)' }
  };

  const currentInfo = stageTitles[stage] || { icon: '🎯', name: `Stage ${stage}` };

  let specificHtml = '';
  let placeholderText = 'Enter your fragment';
  if (stage === 5) placeholderText = 'Enter the team code';
  if (stage === 6) placeholderText = 'Enter the final key';

  if (stage === 1) {
    specificHtml = `
      <!-- Story Briefing -->
      <div style="background: rgba(3, 8, 22, 0.9); border: 1px solid var(--line); border-left: 4px solid var(--accent); border-radius: var(--radius-sm); padding: 16px; margin-bottom: 18px;">
        <div style="font-weight: 800; font-family: var(--font-display); font-size: 1.1rem; color: var(--gold); display: flex; align-items: center; gap: 8px;">
          <span>📡 MISSION 1: DECODE THE 4-LETTER VAULT CODE</span>
        </div>
        <p style="margin: 8px 0 6px; font-size: 0.94rem; color: var(--txt); line-height: 1.5;">
          The vault door is locked with a secret <strong>4-letter password</strong>. Our radio antenna intercepted 4 signals (Sector 1, 2, 3, and 4). <strong>Each sector gives you exactly 1 letter</strong> in Morse code.
        </p>
        <div style="display: flex; gap: 16px; flex-wrap: wrap; margin-top: 10px; font-size: 0.85rem; color: var(--accent); font-family: var(--font-mono);">
          <span>1️⃣ Sector 1 = Letter 1</span>
          <span>2️⃣ Sector 2 = Letter 2</span>
          <span>3️⃣ Sector 3 = Letter 3</span>
          <span>4️⃣ Sector 4 = Letter 4</span>
        </div>
      </div>

      <!-- 4 Puzzle Sectors Grid -->
      <div class="sectors-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; margin-bottom: 18px;">
        
        <!-- Sector 01: Waveform Pulse Duration -->
        <div class="sector-card" style="background: #030814; border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--line); padding-bottom: 8px; margin-bottom: 10px;">
            <span style="font-weight: bold; font-family: var(--font-mono); color: var(--accent); font-size: 0.9rem;">SECTOR 1 ➔ LETTER 1</span>
            <span style="background: rgba(39, 180, 255, 0.15); color: var(--accent); font-size: 0.72rem; padding: 2px 8px; border-radius: 4px; font-weight: bold;">PULSE SIGNAL</span>
          </div>
          <p style="font-size: 0.86rem; color: var(--muted); margin-bottom: 10px;">
            Two pulses intercepted: a <strong>Long pulse (Dash —)</strong> followed by a <strong>Short pulse (Dot •)</strong>.
          </p>
          <div style="background: #01040a; border: 1px solid #1a365d; border-radius: 4px; padding: 12px 8px; display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 10px;">
            <div style="background: var(--accent); height: 28px; width: 68px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 0.78rem; font-weight: bold; color: #01040a; box-shadow: 0 0 10px var(--accent);">DASH (—)</div>
            <span style="color: #64748b;">+</span>
            <div style="background: var(--accent); height: 28px; width: 28px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 0.78rem; font-weight: bold; color: #01040a; box-shadow: 0 0 10px var(--accent);">DOT (•)</div>
          </div>
          <div style="font-family: var(--font-mono); font-size: 0.92rem; color: var(--gold); text-align: center; font-weight: bold;">
            Morse Code: <span style="letter-spacing: 6px;">— •</span>
          </div>
        </div>

        <!-- Sector 02: Binary Serial Modulation -->
        <div class="sector-card" style="background: #030814; border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--line); padding-bottom: 8px; margin-bottom: 10px;">
            <span style="font-weight: bold; font-family: var(--font-mono); color: var(--gold); font-size: 0.9rem;">SECTOR 2 ➔ LETTER 2</span>
            <span style="background: rgba(251, 191, 36, 0.15); color: var(--gold); font-size: 0.72rem; padding: 2px 8px; border-radius: 4px; font-weight: bold;">BINARY CODE</span>
          </div>
          <p style="font-size: 0.86rem; color: var(--muted); margin-bottom: 10px;">
            A binary stream was received: <code style="color: var(--accent); background: #01040a; padding: 2px 6px; border-radius: 3px;">111-0-111-0-111</code>.<br>
            Rule: <strong>111 = Dash (—)</strong> and <strong>0 = Space</strong>.
          </p>
          <div style="background: #01040a; border: 1px solid #4a3808; border-radius: 4px; padding: 12px 8px; display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 10px;">
            <div style="background: var(--gold); height: 28px; width: 48px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 0.78rem; font-weight: bold; color: #01040a; box-shadow: 0 0 10px var(--gold);">—</div>
            <div style="background: var(--gold); height: 28px; width: 48px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 0.78rem; font-weight: bold; color: #01040a; box-shadow: 0 0 10px var(--gold);">—</div>
            <div style="background: var(--gold); height: 28px; width: 48px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 0.78rem; font-weight: bold; color: #01040a; box-shadow: 0 0 10px var(--gold);">—</div>
          </div>
          <div style="font-family: var(--font-mono); font-size: 0.92rem; color: var(--gold); text-align: center; font-weight: bold;">
            Morse Code: <span style="letter-spacing: 6px;">— — —</span>
          </div>
        </div>

        <!-- Sector 03: Optical Pulse Strobe & Decoy Glitch -->
        <div class="sector-card" style="background: #030814; border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--line); padding-bottom: 8px; margin-bottom: 10px;">
            <span style="font-weight: bold; font-family: var(--font-mono); color: #38bdf8; font-size: 0.9rem;">SECTOR 3 ➔ LETTER 3</span>
            <span style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-size: 0.72rem; padding: 2px 8px; border-radius: 4px; font-weight: bold;">BLINKING LIGHT</span>
          </div>
          <p style="font-size: 0.86rem; color: var(--muted); margin-bottom: 10px;">
            A flashing light beacon sends <strong>3 quick blinks</strong> and <strong>1 long blink</strong>:
          </p>
          <div style="background: #01040a; border: 1px solid #1e293b; border-radius: 4px; padding: 8px 12px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div id="optical-beacon-lamp" style="width: 22px; height: 22px; border-radius: 50%; background: #334155; border: 2px solid #64748b; transition: all 0.08s ease;"></div>
              <span id="optical-beacon-status" style="font-family: var(--font-mono); font-size: 0.78rem; color: var(--muted);">READY</span>
            </div>
            <button type="button" id="btn-trigger-strobe" class="btn btn-outline btn-sm" style="padding: 4px 10px; font-size: 0.78rem;">▶ Watch Light Blink</button>
          </div>
          <div style="font-family: var(--font-mono); font-size: 0.92rem; color: var(--gold); text-align: center; font-weight: bold;">
            Morse Code: <span style="letter-spacing: 6px;">• • • —</span>
          </div>
          <div style="font-size: 0.72rem; color: var(--bad); text-align: center; margin-top: 4px;">
            ⚠️ Trap Alert: Screen may flash decoy word <code>ZETA9</code>. Ignore it!
          </div>
        </div>

        <!-- Sector 04: Satellite Uplink Pulse -->
        <div class="sector-card" style="background: #030814; border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--line); padding-bottom: 8px; margin-bottom: 10px;">
            <span style="font-weight: bold; font-family: var(--font-mono); color: #a78bfa; font-size: 0.9rem;">SECTOR 4 ➔ LETTER 4</span>
            <span style="background: rgba(167, 139, 250, 0.15); color: #a78bfa; font-size: 0.72rem; padding: 2px 8px; border-radius: 4px; font-weight: bold;">SATELLITE SIGNAL</span>
          </div>
          <p style="font-size: 0.86rem; color: var(--muted); margin-bottom: 10px;">
            The final pulse: a <strong>Short pulse (Dot •)</strong> followed by a <strong>Long pulse (Dash —)</strong>.
          </p>
          <div style="background: #01040a; border: 1px solid #2e1065; border-radius: 4px; padding: 12px 8px; display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 10px;">
            <div style="background: #a78bfa; height: 28px; width: 28px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 0.78rem; font-weight: bold; color: #01040a; box-shadow: 0 0 10px #a78bfa;">DOT (•)</div>
            <span style="color: #64748b;">+</span>
            <div style="background: #a78bfa; height: 28px; width: 68px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 0.78rem; font-weight: bold; color: #01040a; box-shadow: 0 0 10px #a78bfa;">DASH (—)</div>
          </div>
          <div style="font-family: var(--font-mono); font-size: 0.92rem; color: var(--gold); text-align: center; font-weight: bold;">
            Morse Code: <span style="letter-spacing: 6px;">• —</span>
          </div>
        </div>

      </div>

      <!-- Live 4-Slot Assembler Indicator -->
      <div style="background: rgba(16, 29, 54, 0.5); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 14px; margin-bottom: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; flex-wrap: wrap; gap: 6px;">
          <span style="font-size: 0.9rem; font-weight: bold; color: var(--gold);">🎯 4-SECTOR ASSEMBLED KEY:</span>
          <span style="font-size: 0.8rem; color: var(--muted);">Align Letter 1 to Letter 4 in order</span>
        </div>
        <div style="display: flex; gap: 10px; justify-content: center; margin-bottom: 8px;">
          <div id="slot-preview-1" style="background: #020612; border: 2px dashed #334155; border-radius: 6px; width: 68px; height: 54px; display: flex; flex-direction: column; align-items: center; justify-content: center; transition: all 0.2s ease;">
            <span style="font-size: 0.65rem; color: var(--muted);">Letter 1 (—•)</span>
            <span id="slot-val-1" style="font-family: var(--font-mono); font-weight: bold; font-size: 1.25rem; color: var(--accent);">?</span>
          </div>
          <div id="slot-preview-2" style="background: #020612; border: 2px dashed #334155; border-radius: 6px; width: 68px; height: 54px; display: flex; flex-direction: column; align-items: center; justify-content: center; transition: all 0.2s ease;">
            <span style="font-size: 0.65rem; color: var(--muted);">Letter 2 (———)</span>
            <span id="slot-val-2" style="font-family: var(--font-mono); font-weight: bold; font-size: 1.25rem; color: var(--accent);">?</span>
          </div>
          <div id="slot-preview-3" style="background: #020612; border: 2px dashed #334155; border-radius: 6px; width: 68px; height: 54px; display: flex; flex-direction: column; align-items: center; justify-content: center; transition: all 0.2s ease;">
            <span style="font-size: 0.65rem; color: var(--muted);">Letter 3 (•••—)</span>
            <span id="slot-val-3" style="font-family: var(--font-mono); font-weight: bold; font-size: 1.25rem; color: var(--accent);">?</span>
          </div>
          <div id="slot-preview-4" style="background: #020612; border: 2px dashed #334155; border-radius: 6px; width: 68px; height: 54px; display: flex; flex-direction: column; align-items: center; justify-content: center; transition: all 0.2s ease;">
            <span style="font-size: 0.65rem; color: var(--muted);">Letter 4 (•—)</span>
            <span id="slot-val-4" style="font-family: var(--font-mono); font-weight: bold; font-size: 1.25rem; color: var(--accent);">?</span>
          </div>
        </div>
        <p style="text-align: center; font-size: 0.82rem; color: var(--muted); margin: 6px 0 0;">
          Type the 4 letters below and click <strong>Submit</strong>. Need help matching Morse codes? Click <strong>💡 Hint</strong> below to reveal the 15-letter chart!
        </p>
      </div>
    `;
  } else if (stage === 2) {
    specificHtml = `
      <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: var(--radius-sm); padding: 12px 14px; margin-bottom: 14px;">
        <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; color: var(--gold); font-size: 0.95rem;">
          <span>⚡ CIPHER INTERCEPT: Multi-Layer Cryptographic Stream</span>
        </div>
        <p style="margin: 6px 0 0 0; color: var(--muted); font-size: 0.88rem; line-height: 1.5;">
          The transmission has been encased in multiple transposition and substitution ciphers. Beware of decoy transformations: applying an invalid cipher will corrupt the payload or produce false leads. Analyze character sets (padding '=', byte pairs, alphabet shifts) to determine the exact sequence.
        </p>
      </div>

      <div style="background: #030813; border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 12px; word-break: break-all; font-family: ui-monospace, monospace; font-size: 0.88rem; color: var(--gold); margin-bottom: 14px; position: relative;">
        <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); margin-bottom: 6px;">Intercepted Cipher Payload:</div>
        <div id="stage2-cipher-raw" style="user-select: all;">${escapeHtml(content.encodedText || '')}</div>
      </div>

      <div class="toolkit-box">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 6px;">
          <h3 style="font-size: 0.95rem; color: var(--accent); margin: 0;">🧰 Cryptanalyst Workbench</h3>
          <div style="display: flex; gap: 6px;">
            <button id="btn-paste-original" class="btn btn-outline btn-sm" style="font-size: 0.78rem; padding: 3px 8px;">📋 Paste Payload</button>
            <button id="btn-reset-workbench" class="btn btn-outline btn-sm" style="font-size: 0.78rem; padding: 3px 8px; color: var(--bad); border-color: rgba(239, 68, 68, 0.4);">↺ Reset</button>
          </div>
        </div>
        <textarea id="toolkit-input" rows="3" placeholder="Paste cipher text here to analyze and transform..."></textarea>
        
        <div style="margin-top: 8px; margin-bottom: 6px; font-size: 0.78rem; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Cryptographic Modules:</div>
        <div class="toolkit-actions" style="display: flex; flex-wrap: wrap; gap: 6px;">
          <button id="btn-decode-b64" class="btn btn-outline btn-sm" title="RFC-4648 Base64 Decoder">Base64 Decode</button>
          <button id="btn-decode-hex" class="btn btn-outline btn-sm" title="Hexadecimal ASCII byte conversion">Hex Decode</button>
          <button id="btn-decode-rot13" class="btn btn-outline btn-sm" title="Rotational Caesar-13 shift">ROT13</button>
          <button id="btn-decode-atbash" class="btn btn-outline btn-sm" title="Hebrew Atbash Alphabet Mirror (A↔Z)">Atbash Mirror</button>
          <button id="btn-decode-reverse" class="btn btn-outline btn-sm" title="Reverse sequence transposition">Reverse String</button>
          <button id="btn-decode-rot5" class="btn btn-outline btn-sm" title="Numeric ROT5 (0↔5, 1↔6)">ROT5 (Digits)</button>
          <button id="btn-decode-caesar" class="btn btn-outline btn-sm" title="Caesar +3 Alphabet shift">Caesar (+3)</button>
          <button id="btn-decode-vigenere" class="btn btn-outline btn-sm" title="Polyalphabetic Vigenere cipher">Vigenère</button>
        </div>
        <div id="toolkit-error" class="feedback-line error" style="margin-top: 6px;"></div>
      </div>

      <div style="background: rgba(56, 189, 248, 0.08); border-left: 3px solid var(--accent); padding: 8px 12px; border-radius: 4px; margin-top: 14px; font-size: 0.85rem; color: #cbd5e1;">
        💡 <strong>Tactical Note:</strong> The fully decoded plaintext reveals Fragment 2 as well as a vital <strong>Access Phrase</strong>. Record both securely before proceeding!
      </div>
    `;
  } else if (stage === 3) {
    specificHtml = `
      <p style="margin-bottom: 10px;">
        📖 The story: Meet WARDEN 🤖, the vault’s guardian. It knows the secret piece, but it will not hand it over easily. And guardians can fib! 🤥
      </p>
      <p style="margin-bottom: 14px;">
        💬 Chat with WARDEN and convince it. Tips: use the access phrase 🗝️ from the last mission, say who you are 🧑‍🔧, and ask clearly for what you need, using full sentences. 🙏
      </p>

      <div id="chat-window" class="chat-window">
        <div class="chat-bubble warden">WARDEN: Vault guardian online. State your business.</div>
      </div>

      <div class="chat-input-bar">
        <input type="text" id="warden-msg-input" class="input-control" maxlength="600" placeholder="Type a message to WARDEN (Enter sends)..." />
        <button id="btn-send-warden" class="btn btn-primary btn-sm">Send</button>
      </div>

      <p style="font-size: 0.9rem; color: var(--muted); margin-top: 10px;">
        ✍️ WARDEN may give a wrong piece if you do not ask properly. Type the one you trust below.
      </p>
    `;
  } else if (stage === 4) {
    specificHtml = `
      <div id="stage-4-secret-anchor"><!-- token1 = 9 --></div>
      <p style="margin-bottom: 10px;">
        📖 The story: You reached the vault’s gateway! 🏰 Three tiny tokens 🪙 are hidden inside it. Find all three and join them in order (1st + 2nd + 3rd) to make the secret piece.
      </p>
      <p style="margin-bottom: 14px;">
        🔎 Token 1: it is hiding in this page’s code. Right-click this section and choose Inspect, then look for a note. 💻<br/>
        Tokens 2 and 3: use the terminal below. Type help to see what you can do, then explore with ls, cat and exif. 🛠️
      </p>

      <div id="terminal-history" class="terminal-window">Type help\n</div>
      <div class="terminal-input-bar">
        <span class="terminal-prompt">&gt;</span>
        <input type="text" id="terminal-cmd-input" class="terminal-input" placeholder="Type command here..." autofocus />
      </div>

      <p style="font-size: 0.9rem; color: var(--muted); margin-top: 10px;">
        ✍️ Found all 3 tokens? Join them in order and type the fragment below.
      </p>
    `;
  } else if (stage === 5) {
    const leaderShard = content.leaderShard || '???';
    const joinedCount = content.joinedCount || 1;
    const totalMembers = content.totalMembers || 3;
    const playersStr = (content.members || []).join(' · ');

    specificHtml = `
      <p style="margin-bottom: 10px;">
        📖 The story: The vault door has ${totalMembers} locks 🔒 and each one answers to a different person at the same time! 🤝 One player cannot do this alone.
      </p>
      <ol style="display: flex; flex-direction: column; gap: 8px; margin-left: 20px; font-size: 0.95rem; margin-bottom: 16px;">
        <li>1) 📱 Every teammate opens this page on their own laptop and uses “Joining as a team member” on the start screen.</li>
        <li>2) ⌨️ They type the team name and their own full name exactly as registered. A 3-character shard appears.</li>
        <li>3) 🗣️ Everyone reads their shard to the leader. Your own shard (leader): <strong style="color: var(--gold);">${escapeHtml(leaderShard)}</strong></li>
        <li>4) 🔤 Sort the players A to Z by full name, write their shards in that order with dashes, like A1F-3C9-77B.</li>
      </ol>

      <div style="background: rgba(3, 8, 19, 0.6); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 12px; margin-bottom: 14px;">
        <p>👥 Players: <strong>${escapeHtml(playersStr)}</strong></p>
        <p style="margin-top: 4px; color: ${joinedCount >= 3 ? 'var(--ok)' : 'var(--gold)'}; font-weight: bold;">
          ${joinedCount}/${totalMembers} teammates have joined on their own devices
        </p>
      </div>

      <p style="font-size: 0.9rem; color: var(--muted);">
        ✍️ Type the team code below.
      </p>
    `;
  } else if (stage === 6) {
    specificHtml = `
      <p style="margin-bottom: 10px;">
        📖 The story: This is it, the final lock! 🔐 It is trickier than the rest. Open your 📒 notebook and gather all 5 pieces. 🧩
      </p>
      <ol style="display: flex; flex-direction: column; gap: 8px; margin-left: 20px; font-size: 0.95rem; margin-bottom: 16px;">
        <li>1) 🔤 Put the pieces in alphabetical order of the mission NAMES (the names are in the progress bar and stage titles).</li>
        <li>2) 🔁 The piece from Prompt the AI must be written backwards.</li>
        <li>3) ➖ Join them with dashes inside FO{ … } (the team code loses its dashes).</li>
        <li>4) ➕ Add up every digit (0–9) inside the braces and write it after a #.</li>
      </ol>
      <div style="background: rgba(3, 8, 19, 0.6); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 12px; margin-bottom: 14px; font-family: ui-monospace, monospace; font-size: 0.92rem; color: var(--accent);">
        Example shape: FO{AAA-BBB-CCC-DDD-EEE}#12<br/>
        <span style="color: var(--bad);">⚠️ Use only the real pieces from your notebook. Fake ones are traps! 🪤</span>
      </div>
    `;
  }

  const revealedHints = state.revealedHints || [];
  let hintsHtml = '';
  if (revealedHints.length > 0) {
    hintsHtml = revealedHints.map(h => `<div class="hint-box">${escapeHtml(h)}</div>`).join('');
  }

  const hintsUsed = currentProg.hintsUsed || 0;
  let hintBtnText = '💡 Hint (+3 min)';
  let hintDisabled = false;
  if (hintsUsed === 1) {
    hintBtnText = '💡 Hint (+5 min)';
  } else if (hintsUsed >= 2) {
    hintBtnText = '💡 Hints exhausted';
    hintDisabled = true;
  }

  const isPaused = team.isPaused;
  const pauseBannerHtml = isPaused ? `
    <div class="card" style="background: rgba(255, 184, 31, 0.12); border: 2px solid var(--gold); margin-bottom: 16px; text-align: center;">
      <span style="font-size: 1.25rem; font-weight: bold; color: var(--gold);">⏸ MISSION PAUSED BY ORGANISER</span>
      <p style="color: var(--muted); margin: 6px 0 0; font-size: 0.95rem;">
        Your mission timer and submissions are currently paused. Please stand by for organiser instructions.
      </p>
    </div>
  ` : '';

  container.innerHTML = `
    ${pauseBannerHtml}
    ${renderNotebookHtml(state.notebook)}

    <div class="card">
      <h2 class="card-title">
        <span class="stage-icon">${currentInfo.icon}</span>
        Stage ${stage}: ${currentInfo.name}
      </h2>

      ${specificHtml}

      <form id="stage-submit-form">
        <div class="answer-box">
          <input type="text" id="stage-answer-input" class="input-control" placeholder="${isPaused ? 'Submissions paused by organiser...' : placeholderText}" ${isPaused ? 'disabled' : ''} autocomplete="off" autofocus />
          <button type="submit" id="btn-submit-answer" class="btn btn-primary" ${isPaused ? 'disabled' : ''}>Submit</button>
        </div>
        <div id="submit-feedback" class="feedback-line"></div>
      </form>

      <div class="hint-section">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <span style="font-size: 0.9rem; color: var(--muted);">Need a clue? Hints add penalty minutes.</span>
          <button id="btn-request-hint" class="btn btn-gold btn-sm" ${(hintDisabled || isPaused) ? 'disabled' : ''}>
            ${hintBtnText}
          </button>
        </div>
        <div id="hints-display-container" style="display: flex; flex-direction: column; gap: 8px;">
          ${hintsHtml}
        </div>

        ${stage === 1 ? (hintsUsed >= 1 ? `
        <!-- UNLOCKED 15-Alphabet Morse Chart (Only visible when hint is pressed) -->
        <div class="stage1-hint-chart" style="margin-top: 14px; background: rgba(3, 8, 22, 0.9); border: 2px solid var(--gold); border-radius: var(--radius-sm); padding: 14px 16px; animation: fadeIn 0.3s ease;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 6px;">
            <div style="font-weight: bold; font-size: 0.92rem; color: var(--gold); display: flex; align-items: center; gap: 6px;">
              <span>🔓 UNLOCKED HINT: Morse Code Decoder Chart (15 Alphabets)</span>
            </div>
            <span style="font-size: 0.78rem; color: var(--accent);">(Click any letter to insert into answer)</span>
          </div>
          <p style="font-size: 0.85rem; color: var(--muted); margin: 0 0 12px; line-height: 1.4;">
            Match the Morse codes from Sectors 1, 2, 3, and 4 against this 15-letter chart:
          </p>
          <div class="morse-grid-table" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(70px, 1fr)); gap: 6px;">
            
    <div class="morse-ref-card" data-letter="A" style="background: #01040a; border: 1px solid #1e293b; border-radius: 4px; padding: 6px 3px; text-align: center; cursor: pointer; transition: all 0.15s ease;" title="Click to insert 'A' into answer">
      <div style="font-weight: bold; font-size: 0.95rem; color: var(--gold);">A</div>
      <div style="font-size: 0.72rem; color: var(--accent); font-family: var(--font-mono); letter-spacing: 1px;">• —</div>
    </div>
  
    <div class="morse-ref-card" data-letter="B" style="background: #01040a; border: 1px solid #1e293b; border-radius: 4px; padding: 6px 3px; text-align: center; cursor: pointer; transition: all 0.15s ease;" title="Click to insert 'B' into answer">
      <div style="font-weight: bold; font-size: 0.95rem; color: var(--gold);">B</div>
      <div style="font-size: 0.72rem; color: var(--accent); font-family: var(--font-mono); letter-spacing: 1px;">— • • •</div>
    </div>
  
    <div class="morse-ref-card" data-letter="C" style="background: #01040a; border: 1px solid #1e293b; border-radius: 4px; padding: 6px 3px; text-align: center; cursor: pointer; transition: all 0.15s ease;" title="Click to insert 'C' into answer">
      <div style="font-weight: bold; font-size: 0.95rem; color: var(--gold);">C</div>
      <div style="font-size: 0.72rem; color: var(--accent); font-family: var(--font-mono); letter-spacing: 1px;">— • — •</div>
    </div>
  
    <div class="morse-ref-card" data-letter="D" style="background: #01040a; border: 1px solid #1e293b; border-radius: 4px; padding: 6px 3px; text-align: center; cursor: pointer; transition: all 0.15s ease;" title="Click to insert 'D' into answer">
      <div style="font-weight: bold; font-size: 0.95rem; color: var(--gold);">D</div>
      <div style="font-size: 0.72rem; color: var(--accent); font-family: var(--font-mono); letter-spacing: 1px;">— • •</div>
    </div>
  
    <div class="morse-ref-card" data-letter="E" style="background: #01040a; border: 1px solid #1e293b; border-radius: 4px; padding: 6px 3px; text-align: center; cursor: pointer; transition: all 0.15s ease;" title="Click to insert 'E' into answer">
      <div style="font-weight: bold; font-size: 0.95rem; color: var(--gold);">E</div>
      <div style="font-size: 0.72rem; color: var(--accent); font-family: var(--font-mono); letter-spacing: 1px;">•</div>
    </div>
  
    <div class="morse-ref-card" data-letter="M" style="background: #01040a; border: 1px solid #1e293b; border-radius: 4px; padding: 6px 3px; text-align: center; cursor: pointer; transition: all 0.15s ease;" title="Click to insert 'M' into answer">
      <div style="font-weight: bold; font-size: 0.95rem; color: var(--gold);">M</div>
      <div style="font-size: 0.72rem; color: var(--accent); font-family: var(--font-mono); letter-spacing: 1px;">— —</div>
    </div>
  
    <div class="morse-ref-card" data-letter="N" style="background: #01040a; border: 1px solid #1e293b; border-radius: 4px; padding: 6px 3px; text-align: center; cursor: pointer; transition: all 0.15s ease;" title="Click to insert 'N' into answer">
      <div style="font-weight: bold; font-size: 0.95rem; color: var(--gold);">N</div>
      <div style="font-size: 0.72rem; color: var(--accent); font-family: var(--font-mono); letter-spacing: 1px;">— •</div>
    </div>
  
    <div class="morse-ref-card" data-letter="O" style="background: #01040a; border: 1px solid #1e293b; border-radius: 4px; padding: 6px 3px; text-align: center; cursor: pointer; transition: all 0.15s ease;" title="Click to insert 'O' into answer">
      <div style="font-weight: bold; font-size: 0.95rem; color: var(--gold);">O</div>
      <div style="font-size: 0.72rem; color: var(--accent); font-family: var(--font-mono); letter-spacing: 1px;">— — —</div>
    </div>
  
    <div class="morse-ref-card" data-letter="R" style="background: #01040a; border: 1px solid #1e293b; border-radius: 4px; padding: 6px 3px; text-align: center; cursor: pointer; transition: all 0.15s ease;" title="Click to insert 'R' into answer">
      <div style="font-weight: bold; font-size: 0.95rem; color: var(--gold);">R</div>
      <div style="font-size: 0.72rem; color: var(--accent); font-family: var(--font-mono); letter-spacing: 1px;">• — •</div>
    </div>
  
    <div class="morse-ref-card" data-letter="S" style="background: #01040a; border: 1px solid #1e293b; border-radius: 4px; padding: 6px 3px; text-align: center; cursor: pointer; transition: all 0.15s ease;" title="Click to insert 'S' into answer">
      <div style="font-weight: bold; font-size: 0.95rem; color: var(--gold);">S</div>
      <div style="font-size: 0.72rem; color: var(--accent); font-family: var(--font-mono); letter-spacing: 1px;">• • •</div>
    </div>
  
    <div class="morse-ref-card" data-letter="T" style="background: #01040a; border: 1px solid #1e293b; border-radius: 4px; padding: 6px 3px; text-align: center; cursor: pointer; transition: all 0.15s ease;" title="Click to insert 'T' into answer">
      <div style="font-weight: bold; font-size: 0.95rem; color: var(--gold);">T</div>
      <div style="font-size: 0.72rem; color: var(--accent); font-family: var(--font-mono); letter-spacing: 1px;">—</div>
    </div>
  
    <div class="morse-ref-card" data-letter="U" style="background: #01040a; border: 1px solid #1e293b; border-radius: 4px; padding: 6px 3px; text-align: center; cursor: pointer; transition: all 0.15s ease;" title="Click to insert 'U' into answer">
      <div style="font-weight: bold; font-size: 0.95rem; color: var(--gold);">U</div>
      <div style="font-size: 0.72rem; color: var(--accent); font-family: var(--font-mono); letter-spacing: 1px;">• • —</div>
    </div>
  
    <div class="morse-ref-card" data-letter="V" style="background: #01040a; border: 1px solid #1e293b; border-radius: 4px; padding: 6px 3px; text-align: center; cursor: pointer; transition: all 0.15s ease;" title="Click to insert 'V' into answer">
      <div style="font-weight: bold; font-size: 0.95rem; color: var(--gold);">V</div>
      <div style="font-size: 0.72rem; color: var(--accent); font-family: var(--font-mono); letter-spacing: 1px;">• • • —</div>
    </div>
  
    <div class="morse-ref-card" data-letter="W" style="background: #01040a; border: 1px solid #1e293b; border-radius: 4px; padding: 6px 3px; text-align: center; cursor: pointer; transition: all 0.15s ease;" title="Click to insert 'W' into answer">
      <div style="font-weight: bold; font-size: 0.95rem; color: var(--gold);">W</div>
      <div style="font-size: 0.72rem; color: var(--accent); font-family: var(--font-mono); letter-spacing: 1px;">• — —</div>
    </div>
  
    <div class="morse-ref-card" data-letter="Z" style="background: #01040a; border: 1px solid #1e293b; border-radius: 4px; padding: 6px 3px; text-align: center; cursor: pointer; transition: all 0.15s ease;" title="Click to insert 'Z' into answer">
      <div style="font-weight: bold; font-size: 0.95rem; color: var(--gold);">Z</div>
      <div style="font-size: 0.72rem; color: var(--accent); font-family: var(--font-mono); letter-spacing: 1px;">— — • •</div>
    </div>
  
          </div>
        </div>
        ` : `
        <!-- Locked Hint Notice -->
        <div style="margin-top: 12px; background: rgba(3, 8, 22, 0.4); border: 1px dashed #334155; border-radius: var(--radius-sm); padding: 12px 14px; text-align: center;">
          <span style="font-size: 0.86rem; color: var(--muted);">
            🔒 <strong>Morse Code Chart is locked.</strong> Don't know Morse code? Click <strong>"💡 Hint (+3 min)"</strong> above to unlock the 15-alphabet decoder chart!
          </span>
        </div>
        `) : ''}
      </div>
    </div>
  `;

  attachStageEvents(stage);
}

function attachStageEvents(stage) {
  const submitForm = document.getElementById('stage-submit-form');
  const answerInput = document.getElementById('stage-answer-input');
  const feedbackEl = document.getElementById('submit-feedback');

  if (submitForm) {
    submitForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const answer = answerInput.value.trim();
      if (!answer) return;

      feedbackEl.className = 'feedback-line';
      feedbackEl.textContent = 'Verifying...';

      try {
        const res = await fetch('/api/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answer })
        });
        const data = await res.json();

        if (res.status === 429) {
          feedbackEl.className = 'feedback-line error';
          feedbackEl.textContent = data.error || 'Please wait a second before submitting again.';
          return;
        }

        if (!res.ok) {
          feedbackEl.className = 'feedback-line error';
          feedbackEl.textContent = data.error || 'Submission failed.';
          return;
        }

        if (data.success) {
          feedbackEl.className = 'feedback-line ok';
          feedbackEl.textContent = 'Mission cleared!';

          if (data.finished) {
            showToast('🎉 System unlocked!');
          } else {
            showToast(`✅ Mission ${stage} cleared!`);
          }

          setTimeout(() => {
            renderApp();
          }, 800);
        } else {
          feedbackEl.className = 'feedback-line error';
          if (data.penaltyApplied) {
            feedbackEl.textContent = 'Incorrect. +1 min penalty applied.';
          } else {
            feedbackEl.textContent = `Incorrect. Attempts: ${data.wrongAttempts} (penalty starts after 5).`;
          }
        }
      } catch {
        feedbackEl.className = 'feedback-line error';
        feedbackEl.textContent = 'Connection error. Please try again.';
      }
    });
  }

  const hintBtn = document.getElementById('btn-request-hint');
  if (hintBtn) {
    hintBtn.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/hint', { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
          renderApp();
        } else {
          alert(data.error || 'Could not fetch hint.');
        }
      } catch {
        alert('Server connection error.');
      }
    });
  }

  if (stage === 1) {
    const strobeBtn = document.getElementById('btn-trigger-strobe');
    const lamp = document.getElementById('optical-beacon-lamp');
    const lampStatus = document.getElementById('optical-beacon-status');

    if (strobeBtn && lamp) {
      let strobeRunning = false;
      strobeBtn.addEventListener('click', () => {
        if (strobeRunning) return;
        strobeRunning = true;
        strobeBtn.disabled = true;
        if (lampStatus) lampStatus.textContent = 'TRANSMITTING...';

        // Pulses for Sector 3 (...-): dot (120ms), dot (120ms), dot (120ms), dash (360ms)
        const pulses = [
          { on: 120, off: 100 },
          { on: 120, off: 100 },
          { on: 120, off: 100 },
          { on: 360, off: 200 }
        ];

        let pIdx = 0;
        function runPulse() {
          if (pIdx >= pulses.length) {
            lamp.style.background = '#334155';
            lamp.style.boxShadow = 'none';
            lamp.style.borderColor = '#64748b';
            if (lampStatus) lampStatus.textContent = 'READY';
            strobeBtn.disabled = false;
            strobeRunning = false;
            return;
          }
          const p = pulses[pIdx++];
          lamp.style.background = '#38bdf8';
          lamp.style.borderColor = '#ffffff';
          lamp.style.boxShadow = '0 0 16px #38bdf8, 0 0 30px #38bdf8';
          setTimeout(() => {
            lamp.style.background = '#334155';
            lamp.style.boxShadow = 'none';
            lamp.style.borderColor = '#64748b';
            setTimeout(runPulse, p.off);
          }, p.on);
        }
        runPulse();
      });
    }

    // Connect manual cards to insert letter into answer box
    document.querySelectorAll('.morse-ref-card').forEach(card => {
      card.addEventListener('click', () => {
        const letter = card.getAttribute('data-letter');
        const input = document.getElementById('stage-answer-input');
        if (input && letter) {
          if (input.value.length < 4) {
            input.value = (input.value + letter).toUpperCase();
          } else {
            input.value = letter;
          }
          input.dispatchEvent(new Event('input'));
          input.focus();
        }
      });
    });

    // Connect input box to 4-slot visual preview
    const answerInput = document.getElementById('stage-answer-input');
    if (answerInput) {
      function updateSlots() {
        const val = answerInput.value.toUpperCase().replace(/[^A-Z]/g, '');
        for (let i = 1; i <= 4; i++) {
          const slotEl = document.getElementById(`slot-val-${i}`);
          const boxEl = document.getElementById(`slot-preview-${i}`);
          if (slotEl && boxEl) {
            const char = val[i - 1] || '?';
            slotEl.textContent = char;
            if (val[i - 1]) {
              boxEl.style.borderColor = 'var(--gold)';
              boxEl.style.borderStyle = 'solid';
              boxEl.style.background = '#0d1f38';
            } else {
              boxEl.style.borderColor = '#334155';
              boxEl.style.borderStyle = 'dashed';
              boxEl.style.background = '#020612';
            }
          }
        }
      }
      answerInput.addEventListener('input', updateSlots);
      updateSlots();
    }
  }
  if (stage === 2) {
    const toolkitInput = document.getElementById('toolkit-input');
    const toolkitError = document.getElementById('toolkit-error');
    const rawCipher = document.getElementById('stage2-cipher-raw');

    function runDecoder(fn) {
      toolkitError.textContent = '';
      if (!toolkitInput.value.trim()) {
        toolkitError.textContent = 'Paste or enter ciphertext into the workbench first.';
        return;
      }
      try {
        const res = fn(toolkitInput.value);
        toolkitInput.value = res;
      } catch (err) {
        toolkitError.textContent = err.message || 'Invalid transformation for this payload';
      }
    }

    const pasteBtn = document.getElementById('btn-paste-original');
    if (pasteBtn && rawCipher) {
      pasteBtn.addEventListener('click', () => {
        toolkitInput.value = rawCipher.textContent.trim();
        toolkitError.textContent = '';
      });
    }

    const resetBtn = document.getElementById('btn-reset-workbench');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        toolkitInput.value = '';
        toolkitError.textContent = '';
      });
    }

    const b64 = document.getElementById('btn-decode-b64');
    if (b64) b64.addEventListener('click', () => runDecoder(window.decoderTools.base64Decode));

    const hex = document.getElementById('btn-decode-hex');
    if (hex) hex.addEventListener('click', () => runDecoder(window.decoderTools.hexDecode));

    const r13 = document.getElementById('btn-decode-rot13');
    if (r13) r13.addEventListener('click', () => runDecoder(window.decoderTools.rot13));

    const atb = document.getElementById('btn-decode-atbash');
    if (atb) atb.addEventListener('click', () => runDecoder(window.decoderTools.atbash));

    const rev = document.getElementById('btn-decode-reverse');
    if (rev) rev.addEventListener('click', () => runDecoder(window.decoderTools.reverse));

    const r5 = document.getElementById('btn-decode-rot5');
    if (r5) r5.addEventListener('click', () => runDecoder(window.decoderTools.rot5));

    const csr = document.getElementById('btn-decode-caesar');
    if (csr) csr.addEventListener('click', () => runDecoder(window.decoderTools.caesar3));

    const vig = document.getElementById('btn-decode-vigenere');
    if (vig) vig.addEventListener('click', () => runDecoder(window.decoderTools.vigenere));
  }

  if (stage === 3) {
    const chatWin = document.getElementById('chat-window');
    const msgInput = document.getElementById('warden-msg-input');
    const sendBtn = document.getElementById('btn-send-warden');

    async function sendWardenMessage() {
      const msg = msgInput.value.trim();
      if (!msg) return;

      const userBubble = document.createElement('div');
      userBubble.className = 'chat-bubble user';
      userBubble.textContent = msg;
      chatWin.appendChild(userBubble);
      chatWin.scrollTop = chatWin.scrollHeight;

      msgInput.value = '';
      sendBtn.disabled = true;

      try {
        const res = await fetch('/api/warden', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg })
        });
        const data = await res.json();

        const wardenBubble = document.createElement('div');
        wardenBubble.className = 'chat-bubble warden';
        wardenBubble.textContent = data.reply || data.error || 'No response from WARDEN.';
        chatWin.appendChild(wardenBubble);
        chatWin.scrollTop = chatWin.scrollHeight;
      } catch {
        const errBubble = document.createElement('div');
        errBubble.className = 'chat-bubble system';
        errBubble.textContent = 'Communication interrupted.';
        chatWin.appendChild(errBubble);
      } finally {
        sendBtn.disabled = false;
      }
    }

    sendBtn.addEventListener('click', sendWardenMessage);
    msgInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendWardenMessage();
      }
    });
  }

  if (stage === 4) {
    const termInput = document.getElementById('terminal-cmd-input');
    const termHistory = document.getElementById('terminal-history');

    termInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        const cmd = termInput.value.trim();
        termInput.value = '';

        termHistory.textContent += `> ${cmd}\n`;

        try {
          const res = await fetch('/api/terminal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cmd })
          });
          const data = await res.json();
          termHistory.textContent += `${data.output || data.error}\n\n`;
          termHistory.scrollTop = termHistory.scrollHeight;
        } catch {
          termHistory.textContent += `Error executing command.\n\n`;
        }
      }
    });
  }
}

// ==========================================================================
// Result Screen
// ==========================================================================
function renderResultScreen(container, state) {
  const team = state.team;
  const members = (state.members || []).map(m => m.fullName).join(', ');

  const elapsedMs = team.finishedAt - team.startedAt - (team.pausedMs || 0);
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000) + team.penaltyMin * 60);
  const formattedTotal = formatDuration(totalSeconds);
  const formattedElapsed = formatDuration(Math.max(0, Math.floor(elapsedMs / 1000)));

  const vCode = state.verificationCode || 'UNKNOWN';
  const copyString = `Final Override | ${team.name} | ${formattedTotal} | code ${vCode}`;

  container.innerHTML = `
    <div class="card result-container">
      <h1 class="result-title">🎉 SYSTEM UNLOCKED</h1>
      <p style="font-size: 1.15rem;">
        Team <strong>${escapeHtml(team.name)}</strong> (${escapeHtml(members)}) completed the mission.
      </p>

      <div class="result-time-hero">${formattedTotal}</div>
      <p style="color: var(--muted); font-size: 1rem;">
        Final time = ${formattedElapsed} + ${team.penaltyMin} min penalty
      </p>

      <div class="result-code-box">
        VERIFICATION CODE: ${escapeHtml(vCode)}
      </div>

      <p style="max-width: 600px; color: var(--txt); font-size: 0.95rem; line-height: 1.5;">
        Show this screen to your coordinator (<strong>${escapeHtml(team.coordinator)}</strong>) or a judge for final verification. The judge’s record is the official result.
      </p>

      <div style="display: flex; gap: 14px; flex-wrap: wrap; justify-content: center; margin-top: 10px;">
        <button id="btn-copy-result" class="btn btn-primary">
          📋 Copy result
        </button>
        ${state.allowNewTeams ? `
          <button id="btn-new-team" class="btn btn-gold">
            New team
          </button>
        ` : ''}
      </div>
    </div>
  `;

  document.getElementById('btn-copy-result').addEventListener('click', () => {
    navigator.clipboard.writeText(copyString);
    showToast('Result copied to clipboard!');
  });

  const newTeamBtn = document.getElementById('btn-new-team');
  if (newTeamBtn) {
    newTeamBtn.addEventListener('click', async () => {
      await fetch('/api/new-team', { method: 'POST' });
      renderApp();
    });
  }
}

// ==========================================================================
// UNIFIED ORGANISER & COORDINATOR PORTAL (/admin & /coordinator)
// ==========================================================================
let portalPollInterval = null;
let currentCoordinatorFilter = 'ALL';

function renderMergedPortal(container) {
  if (portalPollInterval) clearInterval(portalPollInterval);

  const adminPin = sessionStorage.getItem('fo_admin_pin') || '';
  const coordName = sessionStorage.getItem('fo_coord_name') || '';

  // 1. Not Logged In -> Dual-Tab Unified Login Form
  if (!adminPin && !coordName) {
    const isDirectAdmin = window.location.pathname.startsWith('/admin');

    container.innerHTML = `
      <div class="card" style="max-width: 540px; margin: 30px auto;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h2 style="font-size: 1.6rem; color: var(--gold);">⚡ Event Control Portal — Invictors</h2>
          <p style="color: var(--muted); font-size: 0.92rem; margin-top: 4px;">
            Invictors Club · Dept. of Computer Science &amp; Engineering, VVCE Mysuru
          </p>
        </div>

        <div class="portal-tabs">
          <button id="tab-btn-admin" class="portal-tab-btn ${isDirectAdmin ? 'active' : ''}">⚡ Master Organiser</button>
          <button id="tab-btn-coord" class="portal-tab-btn ${!isDirectAdmin ? 'active' : ''}">🛡️ Event Coordinator</button>
        </div>

        <!-- Admin Login Tab -->
        <div id="tab-panel-admin" style="display: ${isDirectAdmin ? 'block' : 'none'};">
          <p style="color: var(--muted); font-size: 0.9rem; margin-bottom: 14px;">
            Enter the Organiser Admin PIN for master event control, timer controls, device resets, and CSV export.
          </p>
          <form id="portal-admin-form">
            <div class="form-group">
              <label for="portal-admin-pin">Admin PIN *</label>
              <input type="password" id="portal-admin-pin" class="input-control" placeholder="Enter Admin PIN" required ${isDirectAdmin ? 'autofocus' : ''} />
            </div>
            <div id="portal-admin-err" class="feedback-line error"></div>
            <button type="submit" class="btn btn-gold" style="width: 100%; margin-top: 10px;">
              Login as Master Organiser
            </button>
          </form>
        </div>

        <!-- Coordinator Login Tab -->
        <div id="tab-panel-coord" style="display: ${!isDirectAdmin ? 'block' : 'none'};">
          <p style="color: var(--muted); font-size: 0.9rem; margin-bottom: 14px;">
            Enter your coordinator name to view and manage only your registered teams.
          </p>
          <form id="portal-coord-form">
            <div class="form-group">
              <label for="portal-coord-input">Coordinator Name *</label>
              <input type="text" id="portal-coord-input" class="input-control" list="portal-coord-list" placeholder="Select or type your name..." required ${!isDirectAdmin ? 'autofocus' : ''} />
              <datalist id="portal-coord-list">
                <option value="Akul P Yadav">
                <option value="Gagan S Urs">
                <option value="M Punya Sagar">
                <option value="MN Shashank">
                <option value="Dhanush KP">
                <option value="Anish S Kumar">
                <option value="Ayush P">
                <option value="Skanda">
                <option value="Vishnuvardhan">
                <option value="Vandhana V">
                <option value="Abhiram BS">
                <option value="Harshil">
              </datalist>
            </div>
            <div class="form-group" style="margin-top: 12px;">
              <label for="portal-coord-pin">Coordinator PIN *</label>
              <input type="password" id="portal-coord-pin" class="input-control" placeholder="Enter your coordinator PIN" required />
            </div>
            <div id="portal-coord-err" class="feedback-line error"></div>
            <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 10px;">
              Open Coordinator Dashboard
            </button>
          </form>
        </div>
      </div>
    `;

    // Tab Switcher
    const tabCoordBtn = document.getElementById('tab-btn-coord');
    const tabAdminBtn = document.getElementById('tab-btn-admin');
    const panelCoord = document.getElementById('tab-panel-coord');
    const panelAdmin = document.getElementById('tab-panel-admin');

    tabAdminBtn.onclick = () => {
      tabAdminBtn.classList.add('active');
      tabCoordBtn.classList.remove('active');
      panelAdmin.style.display = 'block';
      panelCoord.style.display = 'none';
      const pinInput = document.getElementById('portal-admin-pin');
      if (pinInput) pinInput.focus();
    };

    tabCoordBtn.onclick = () => {
      tabCoordBtn.classList.add('active');
      tabAdminBtn.classList.remove('active');
      panelCoord.style.display = 'block';
      panelAdmin.style.display = 'none';
      const coordInput = document.getElementById('portal-coord-input');
      if (coordInput) coordInput.focus();
    };

    // Handle Coordinator Submit
    document.getElementById('portal-coord-form').onsubmit = async (e) => {
      e.preventDefault();
      const name = document.getElementById('portal-coord-input').value.trim();
      const pin = document.getElementById('portal-coord-pin').value.trim();
      const errEl = document.getElementById('portal-coord-err');
      errEl.textContent = '';

      if (!name || !pin) {
        errEl.textContent = 'Please enter both coordinator name and PIN.';
        return;
      }

      try {
        const res = await fetch('/api/coordinator/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, pin })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          sessionStorage.setItem('fo_coord_name', name);
          sessionStorage.setItem('fo_coord_pin', pin);
          renderMergedPortal(container);
        } else {
          errEl.textContent = data.error || 'Invalid coordinator PIN.';
        }
      } catch (err) {
        errEl.textContent = 'Connection error. Please try again.';
      }
    };

    // Handle Admin Submit
    document.getElementById('portal-admin-form').onsubmit = async (e) => {
      e.preventDefault();
      const pin = document.getElementById('portal-admin-pin').value.trim();
      const errEl = document.getElementById('portal-admin-err');
      errEl.textContent = '';

      try {
        const existingSessionId = getAdminSessionId();
        const res = await fetch('/api/admin/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin, sessionId: existingSessionId })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          sessionStorage.setItem('fo_admin_pin', pin);
          setAdminSessionId(data.sessionId);
          startAdminHeartbeat(pin);
          renderMergedPortal(container);
        } else {
          errEl.textContent = data.error || 'Invalid Admin PIN.';
        }
      } catch {
        errEl.textContent = 'Connection error.';
      }
    };

    return;
  }
  // 2. Logged In as Coordinator Only
  if (coordName && !adminPin) {
    container.innerHTML = `
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; border-bottom: 1px solid var(--line); padding-bottom: 14px;">
          <div>
            <h2 style="font-size: 1.4rem; color: var(--txt); display: flex; align-items: center; gap: 8px;">
              🛡️ Coordinator Dashboard: <span style="color: var(--accent);">${escapeHtml(coordName)}</span>
            </h2>
            <p style="font-size: 0.85rem; color: var(--muted); margin-top: 2px;">
              Live tracking only teams assigned to coordinator <strong>${escapeHtml(coordName)}</strong>.
            </p>
          </div>
          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <button id="btn-portal-elevate" class="btn btn-gold btn-sm">⚡ Elevate to Master Admin</button>
            <button id="btn-portal-switch-coord" class="btn btn-outline btn-sm">Switch Coordinator</button>
            <button id="btn-portal-logout" class="btn btn-outline btn-sm">Logout</button>
          </div>
        </div>

        <div id="portal-teams-table" class="data-table-container">
          <p style="color: var(--muted); padding: 20px;">Loading assigned teams...</p>
        </div>
      </div>
    `;

    document.getElementById('btn-portal-elevate').onclick = () => {
      const pin = prompt('Enter Master Admin PIN:');
      if (pin) {
        fetch('/api/admin/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin })
        }).then(r => {
          if (r.ok) {
            sessionStorage.setItem('fo_admin_pin', pin);
            renderMergedPortal(container);
          } else {
            alert('Invalid PIN.');
          }
        });
      }
    };

    document.getElementById('btn-portal-switch-coord').onclick = () => {
      sessionStorage.removeItem('fo_coord_name');
      sessionStorage.removeItem('fo_coord_pin');
      renderMergedPortal(container);
    };

    document.getElementById('btn-portal-logout').onclick = () => {
      sessionStorage.removeItem('fo_coord_name');
      sessionStorage.removeItem('fo_coord_pin');
      clearAdminSession();
      renderMergedPortal(container);
    };

    async function loadCoordinatorTeams() {
      try {
        const coordPin = sessionStorage.getItem('fo_coord_pin') || '';
        const res = await fetch(`/api/coordinator?name=${encodeURIComponent(coordName)}&pin=${encodeURIComponent(coordPin)}`);
        if (!res.ok) return;
        const data = await res.json();
        const teams = data.teams || [];
        const tableEl = document.getElementById('portal-teams-table');
        if (!tableEl) return;

        if (teams.length === 0) {
          tableEl.innerHTML = `<p style="padding: 24px; color: var(--muted); text-align: center;">No teams currently registered under coordinator <strong>${escapeHtml(coordName)}</strong>.</p>`;
          return;
        }

        let rows = teams.map(t => `
          <tr>
            <td><strong>${escapeHtml(t.name)}</strong></td>
            <td style="color: var(--muted); font-size: 0.85rem;">${escapeHtml(t.players.join(', '))}</td>
            <td><span style="font-weight: bold; color: ${t.stageText === '✅ Done' ? 'var(--ok)' : 'var(--accent)'};">${t.stageText}</span></td>
            <td style="font-family: monospace; font-size: 1.05rem; color: var(--gold);">${t.formattedTime}</td>
            <td>${t.totalHints}</td>
            <td>${t.totalWrong}</td>
            <td><span style="font-size: 0.85rem; padding: 2px 8px; border-radius: 4px; background: rgba(39, 180, 255, 0.1); color: var(--txt);">${t.status}</span></td>
          </tr>
        `).join('');

        tableEl.innerHTML = `
          <table class="data-table">
            <thead>
              <tr>
                <th>Team</th>
                <th>Players</th>
                <th>Stage</th>
                <th>Live Time</th>
                <th>Hints</th>
                <th>Wrong Tries</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        `;
      } catch (err) {
        console.error('Coordinator poll error:', err);
      }
    }

    loadCoordinatorTeams();
    portalPollInterval = setInterval(loadCoordinatorTeams, 3000);
    return;
  }

  // 3. Logged In as Master Admin (Full Organiser & Anti-Cheat Super-View)
  let answersVisible = false;

  container.innerHTML = `
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; border-bottom: 1px solid var(--line); padding-bottom: 14px;">
        <div>
          <h2 style="font-size: 1.5rem; color: var(--gold); display: flex; align-items: center; gap: 8px;">
            ⚡ Event Control Portal — Invictors
          </h2>
          <p style="font-size: 0.85rem; color: var(--muted); margin-top: 2px;">
            Dept. of Computer Science & Engineering · VVCE Mysuru · Master Operations & Anti-Cheat Control
          </p>
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button id="btn-admin-clock" class="btn btn-outline btn-sm">Loading Clock...</button>
          <button id="btn-admin-newteams" class="btn btn-outline btn-sm">Registration: Loading...</button>
          <a href="/api/admin/export?pin=${encodeURIComponent(adminPin)}" target="_blank" class="btn btn-gold btn-sm">📥 Export CSV</a>
          <button id="btn-portal-logout" class="btn btn-outline btn-sm">Logout</button>
        </div>
      </div>

      <!-- Hero Control Bar (Start Together, Launch All, Global Restart) -->
      <div class="control-hero-bar">
        <div style="display: flex; align-items: center; gap: 14px; flex-wrap: wrap;">
          <div>
            <span style="font-size: 0.75rem; color: var(--muted); text-transform: uppercase; font-weight: bold;">Mission Status</span>
            <div id="admin-mission-status" style="font-size: 1.15rem; font-weight: bold; color: var(--gold);">
              Checking...
            </div>
          </div>
          <div style="height: 28px; width: 1px; background: var(--line);"></div>
          <div>
            <span style="font-size: 0.75rem; color: var(--muted); text-transform: uppercase; font-weight: bold;">Lobby Queue</span>
            <div id="admin-waiting-count" style="font-size: 1.15rem; font-weight: bold; color: var(--accent);">
              0 Waiting
            </div>
          </div>
        </div>

        <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
          <button id="btn-admin-launch-all" class="btn btn-primary btn-sm" style="font-weight: bold;">🚀 Launch Game for All</button>
          <button id="btn-admin-restart-all" class="btn btn-danger btn-sm" title="Reset all teams to lobby">🔄 Restart All to Lobby</button>
          <button id="btn-admin-mode-toggle" class="btn btn-outline btn-sm">Start Together: ON</button>
        </div>
      </div>

      <!-- Coordinator Filter Tabs / Pills -->
      <div class="coord-filter-bar" style="margin-top: 14px;">
        <span style="font-size: 0.85rem; font-weight: bold; color: var(--muted); text-transform: uppercase;">Filter by Coordinator:</span>
        <div id="coord-pills-container" style="display: flex; gap: 6px; flex-wrap: wrap;">
          <button class="coord-filter-pill active" data-coord="ALL">All Coordinators</button>
        </div>
      </div>

      <!-- Teams Section -->
      <div id="admin-teams-table" class="data-table-container">
        <p style="color: var(--muted); padding: 14px;">Loading all teams...</p>
      </div>

      <!-- Master Answer Key & Solutions Reference Section -->
      <div style="margin-top: 32px; border-top: 1px solid var(--line); padding-top: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; flex-wrap: wrap; gap: 10px;">
          <div>
            <h3 style="font-size: 1.25rem; color: var(--gold); display: flex; align-items: center; gap: 8px;">
              🔑 Master Answer Key & Solutions Reference
            </h3>
            <p style="font-size: 0.85rem; color: var(--muted); margin-top: 2px;">
              Confidential solutions guide. Includes static stages and dynamic per-team member shards & final keys.
            </p>
          </div>
          <button id="btn-toggle-answers" class="btn btn-outline btn-sm">👁️ Show Answer Key</button>
        </div>

        <div id="admin-answers-panel" style="display: none;">
          <!-- Static Stages 1 to 4 -->
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px; margin-bottom: 16px;">
            <div class="answer-key-box">
              <h4>📡 Stage 1: Signal Intercept (Morse Matrix)</h4>
              <div>Key: <span class="solution-token">NOVA</span></div>
              <div style="font-size: 0.82rem; color: var(--muted); margin-top: 4px;">Matrix Sectors: S1 (—• [N]), S2 (——— [O]), S3 (•••— [V]), S4 (•— [A])<br/>Decoy: <span style="color:var(--bad);">ZETA9</span> | 15-char hint chart</div>
            </div>
            <div class="answer-key-box">
              <h4>🔓 Stage 2: 3-Layer Cipher</h4>
              <div>Key: <span class="solution-token">7K2</span></div>
              <div style="font-size: 0.82rem; color: var(--muted); margin-top: 4px;">Base64 ➔ Hex ➔ ROT13<br/>Passphrase: <span style="color:var(--ok);">AURORA</span></div>
            </div>
            <div class="answer-key-box">
              <h4>🤖 Stage 3: WARDEN AI</h4>
              <div>Key: <span class="solution-token">ORBIT</span></div>
              <div style="font-size: 0.82rem; color: var(--muted); margin-top: 4px;">AURORA + Role (technician) + Task<br/>Decoy: <span style="color:var(--bad);">ZETA9</span></div>
            </div>
            <div class="answer-key-box">
              <h4>🚩 Stage 4: CTF Challenges</h4>
              <div>Key: <span class="solution-token">91X</span></div>
              <div style="font-size: 0.82rem; color: var(--muted); margin-top: 4px;">Comment: 9 | note.txt: 1 | exif: X</div>
            </div>
          </div>

          <!-- Dynamic Team Solutions Table -->
          <h4 style="color: var(--accent); font-size: 1rem; margin-bottom: 8px;">🤝 Dynamic Stage 5 & 6 Team Solutions:</h4>
          <div id="dynamic-answers-table" class="data-table-container">
            <p style="color: var(--muted); padding: 10px;">Loading dynamic solutions...</p>
          </div>
        </div>
      </div>

      <!-- Winners Scratchpad & Notes Section -->
      <div style="margin-top: 32px; border-top: 1px solid var(--line); padding-top: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 10px;">
          <div>
            <h3 style="font-size: 1.25rem; color: var(--gold); display: flex; align-items: center; gap: 8px;">
              🏆 Organiser Scratchpad & Winners Notepad
            </h3>
            <p style="font-size: 0.85rem; color: var(--muted); margin-top: 2px;">
              Live persistent scratchpad for recording winning teams, announcements, and notes.
            </p>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button id="btn-notepad-insert-top3" class="btn btn-gold btn-sm">📋 Insert Top 3 from Leaderboard</button>
            <button id="btn-notepad-save" class="btn btn-primary btn-sm">💾 Save Notes</button>
            <button id="btn-notepad-copy" class="btn btn-outline btn-sm">📋 Copy</button>
          </div>
        </div>
        <textarea id="admin-winners-notepad" class="notepad-textarea" placeholder="Type event notes, prize allocations, or winner list here..."></textarea>
        <div id="admin-notepad-status" style="font-size: 0.82rem; color: var(--muted); margin-top: 4px;">Auto-saved to database.</div>
      </div>

      <!-- Anti-Cheat Violations Monitor -->
      <div style="margin-top: 32px; border-top: 1px solid var(--line); padding-top: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 10px;">
          <div>
            <h3 style="font-size: 1.2rem; color: var(--bad); display: flex; align-items: center; gap: 8px;">
              🚨 Anti-Cheat Violations Activity Log
            </h3>
            <p style="font-size: 0.85rem; color: var(--muted); margin-top: 2px;">
              Monitors tab switching, window blurs, and external tool detections. (+2 min added per offense).
            </p>
          </div>
          <button id="btn-refresh-violations" class="btn btn-outline btn-sm">🔄 Refresh Violations</button>
        </div>
        <div id="admin-violations-container" class="data-table-container">
          <p style="color: var(--muted); padding: 12px;">Loading violations...</p>
        </div>
      </div>

      <!-- WARDEN Logs Section -->
      <h3 style="margin-top: 32px; font-size: 1.15rem; color: var(--accent); border-top: 1px solid var(--line); padding-top: 20px;">
        💬 WARDEN AI Chat Logs
      </h3>
      <div id="admin-warden-logs" style="max-height: 250px; overflow-y: auto; background: #030813; border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 12px; margin-top: 10px; font-family: ui-monospace, monospace; font-size: 0.85rem;">
        Loading logs...
      </div>
    </div>
  `;

  document.getElementById('btn-portal-logout').onclick = () => {
    sessionStorage.removeItem('fo_admin_pin');
    sessionStorage.removeItem('fo_coord_name');
    renderMergedPortal(container);
  };

  // Toggle Answers Accordion
  const toggleAnswersBtn = document.getElementById('btn-toggle-answers');
  const answersPanel = document.getElementById('admin-answers-panel');
  toggleAnswersBtn.onclick = () => {
    answersVisible = !answersVisible;
    answersPanel.style.display = answersVisible ? 'block' : 'none';
    toggleAnswersBtn.textContent = answersVisible ? '🙈 Hide Answer Key' : '👁️ Show Answer Key';
    if (answersVisible) loadDynamicAnswers();
  };

  async function loadDynamicAnswers() {
    try {
      const res = await fetch('/api/admin/answers', {
        headers: { 'x-admin-pin': adminPin }
      });
      if (!res.ok) return;
      const data = await res.json();
      const solutions = data.teamSolutions || [];
      const containerEl = document.getElementById('dynamic-answers-table');
      if (!containerEl) return;

      if (solutions.length === 0) {
        containerEl.innerHTML = '<p style="padding: 12px; color: var(--muted);">No teams registered yet.</p>';
        return;
      }

      let rows = solutions.map(t => {
        const shardsStr = t.memberShards.map(m => `<strong>${escapeHtml(m.name)}:</strong> <span class="solution-token">${escapeHtml(m.shard)}</span>`).join(' &nbsp;|&nbsp; ');
        return `
          <tr>
            <td><strong>${escapeHtml(t.teamName)}</strong></td>
            <td><span style="color: var(--accent);">${escapeHtml(t.coordinator)}</span></td>
            <td style="font-size: 0.88rem;">${shardsStr}</td>
            <td><span class="solution-token">${escapeHtml(t.stage5Code)}</span></td>
            <td><span class="solution-token" style="color: #34d399; border-color: #34d399;">${escapeHtml(t.stage6Key)}</span></td>
          </tr>
        `;
      }).join('');

      containerEl.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>Team</th>
              <th>Coordinator</th>
              <th>Stage 5 Member Shards</th>
              <th>Stage 5 Team Code</th>
              <th>Stage 6 Final Key</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      `;
    } catch (err) {
      console.error('Failed to load dynamic answers:', err);
    }
  }

  // Notepad Save and Actions
  const notepadEl = document.getElementById('admin-winners-notepad');
  const notepadStatusEl = document.getElementById('admin-notepad-status');
  let notepadSaveTimeout = null;

  async function saveNotepadContent() {
    const text = notepadEl.value;
    notepadStatusEl.textContent = 'Saving...';
    try {
      await fetch('/api/admin/notepad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-pin': adminPin },
        body: JSON.stringify({ notepad: text })
      });
      notepadStatusEl.textContent = `Saved at ${new Date().toLocaleTimeString()}`;
    } catch {
      notepadStatusEl.textContent = 'Failed to save.';
    }
  }

  notepadEl.addEventListener('input', () => {
    if (notepadSaveTimeout) clearTimeout(notepadSaveTimeout);
    notepadSaveTimeout = setTimeout(saveNotepadContent, 1200);
  });

  document.getElementById('btn-notepad-save').onclick = () => {
    saveNotepadContent();
    showToast('Notepad saved!');
  };

  document.getElementById('btn-notepad-copy').onclick = () => {
    navigator.clipboard.writeText(notepadEl.value);
    showToast('Notepad copied to clipboard!');
  };

  document.getElementById('btn-notepad-insert-top3').onclick = async () => {
    try {
      const res = await fetch('/api/leaderboard');
      if (!res.ok) return;
      const lb = await res.json();
      const finishedTeams = (lb.teams || []).filter(t => t.isFinished);
      if (finishedTeams.length === 0) {
        showToast('No teams have finished the mission yet.');
        return;
      }
      const top3 = finishedTeams.slice(0, 3);
      let snippet = `\n--- 🏆 TOP ${top3.length} TEAMS (Generated: ${new Date().toLocaleTimeString()}) ---\n`;
      top3.forEach((t, idx) => {
        const medal = idx === 0 ? '🥇 1st' : (idx === 1 ? '🥈 2nd' : '🥉 3rd');
        snippet += `${medal} Place: Team "${t.name}" (Coordinator: ${t.coordinator})\n`;
        snippet += `   Time: ${t.formattedTime} (+${t.penaltyMin}m penalties) | Verification: ${t.verificationCode || 'VERIFIED'}\n`;
      });
      snippet += `----------------------------------------------------------\n`;
      notepadEl.value += snippet;
      saveNotepadContent();
      showToast('Top teams inserted into notepad!');
    } catch {
      showToast('Error fetching leaderboard.');
    }
  };

  // Load and Refresh Anti-Cheat Violations
  async function loadViolations() {
    const containerEl = document.getElementById('admin-violations-container');
    if (!containerEl) return;
    try {
      const res = await fetch('/api/admin/violations', {
        headers: { 'x-admin-pin': adminPin }
      });
      if (!res.ok) return;
      const data = await res.json();
      const violations = data.violations || [];
      if (violations.length === 0) {
        containerEl.innerHTML = '<p style="padding: 12px; color: var(--ok); text-align: center;">✅ No anti-cheat violations recorded. Clean play so far!</p>';
        return;
      }

      let rows = violations.map(v => {
        const timeStr = new Date(v.at).toLocaleTimeString();
        return `
          <tr>
            <td><strong>${escapeHtml(v.teamName)}</strong></td>
            <td><span class="cheat-badge">${escapeHtml(v.type)}</span></td>
            <td style="font-size: 0.88rem;">${escapeHtml(v.details || '')}</td>
            <td style="color: var(--bad); font-weight: bold;">+${v.penaltyAdded}m</td>
            <td style="font-family: monospace; color: var(--muted);">${timeStr}</td>
            <td>
              <button class="btn btn-outline btn-sm btn-waive-penalty" data-id="${v.id}" data-team="${v.teamId}" data-penalty="${v.penaltyAdded}" title="Waive penalty">Waive</button>
            </td>
          </tr>
        `;
      }).join('');

      containerEl.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>Team</th>
              <th>Violation</th>
              <th>Details</th>
              <th>Penalty</th>
              <th>Timestamp</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      `;

      containerEl.querySelectorAll('.btn-waive-penalty').forEach(btn => {
        btn.onclick = async () => {
          if (confirm('Waive this penalty and deduct the penalty minutes from the team?')) {
            await fetch('/api/admin/waive-penalty', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-admin-pin': adminPin },
              body: JSON.stringify({
                violationId: btn.dataset.id,
                teamId: btn.dataset.team,
                penaltyToWaive: Number(btn.dataset.penalty)
              })
            });
            showToast('Penalty waived.');
            loadMasterData();
          }
        };
      });
    } catch (err) {
      console.error('Failed to load violations:', err);
    }
  }

  document.getElementById('btn-refresh-violations').onclick = loadViolations;

  let notepadLoaded = false;

  async function loadMasterData() {
    try {
      const res = await fetch('/api/admin/teams', {
        headers: { 'x-admin-pin': adminPin }
      });
      if (res.status === 401) {
        sessionStorage.removeItem('fo_admin_pin');
        renderMergedPortal(container);
        return;
      }
      const data = await res.json();
      const allTeams = data.teams || [];

      // Initial populate notepad once
      if (!notepadLoaded && data.notepad !== undefined) {
        notepadEl.value = data.notepad;
        notepadLoaded = true;
      }

      // Update Hero Status
      const statusEl = document.getElementById('admin-mission-status');
      const waitingCountEl = document.getElementById('admin-waiting-count');
      const waitingTeams = allTeams.filter(t => t.status === 'waiting');
      if (waitingCountEl) waitingCountEl.textContent = `${waitingTeams.length} Waiting in Lobby`;

      if (statusEl) {
        if (!data.isGameStarted) {
          statusEl.innerHTML = '<span style="color: var(--gold);">⏳ LOBBY ACTIVE (Pending Launch)</span>';
        } else if (data.isClockPaused) {
          statusEl.innerHTML = '<span style="color: var(--gold);">⏸ GLOBAL CLOCK PAUSED</span>';
        } else {
          statusEl.innerHTML = '<span style="color: var(--ok);">🟢 MISSION IS LIVE</span>';
        }
      }

      // Launch All Button
      const launchBtn = document.getElementById('btn-admin-launch-all');
      if (launchBtn) {
        if (!data.isGameStarted || waitingTeams.length > 0) {
          launchBtn.textContent = `🚀 Launch Mission (${waitingTeams.length} Teams Waiting)`;
          launchBtn.className = 'btn btn-primary btn-sm';
          launchBtn.disabled = false;
        } else {
          launchBtn.textContent = '✅ All Waiting Teams Launched';
          launchBtn.className = 'btn btn-outline btn-sm';
          launchBtn.disabled = true;
        }
        launchBtn.onclick = async () => {
          if (confirm('Launch the game now for all waiting teams? Their timers will start simultaneously.')) {
            const r = await fetch('/api/admin/start-all', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-admin-pin': adminPin }
            });
            const d = await r.json();
            showToast(`Launched! ${d.activatedTeamsCount || 0} teams activated.`);
            loadMasterData();
          }
        };
      }

      // Restart All Button
      const restartAllBtn = document.getElementById('btn-admin-restart-all');
      if (restartAllBtn) {
        restartAllBtn.onclick = async () => {
          const mode = prompt('Type "lobby" to restart all teams to Waiting Lobby, or "active" to restart all immediately to Stage 1:');
          if (mode === 'lobby' || mode === 'active') {
            await fetch('/api/admin/restart-all', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-admin-pin': adminPin },
              body: JSON.stringify({ mode })
            });
            showToast(`All teams restarted to ${mode} mode.`);
            loadMasterData();
          }
        };
      }

      // Mode Toggle Button
      const modeBtn = document.getElementById('btn-admin-mode-toggle');
      if (modeBtn) {
        modeBtn.textContent = data.startTogetherMode ? 'Mode: Start Together (ON)' : 'Mode: Free Start (OFF)';
        modeBtn.className = data.startTogetherMode ? 'btn btn-gold btn-sm' : 'btn btn-outline btn-sm';
        modeBtn.onclick = async () => {
          await fetch('/api/admin/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-pin': adminPin },
            body: JSON.stringify({ startTogetherMode: !data.startTogetherMode })
          });
          loadMasterData();
        };
      }

      // Update Global Clock button
      const clockBtn = document.getElementById('btn-admin-clock');
      if (clockBtn) {
        clockBtn.textContent = data.isClockPaused ? '▶ Resume Global Clock' : '⏸ Pause Global Clock';
        clockBtn.className = data.isClockPaused ? 'btn btn-gold btn-sm' : 'btn btn-outline btn-sm';
        clockBtn.onclick = async () => {
          await fetch('/api/admin/clock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-pin': adminPin },
            body: JSON.stringify({ action: data.isClockPaused ? 'resume' : 'pause' })
          });
          loadMasterData();
        };
      }

      // Update Allow New Teams button
      const newTeamsBtn = document.getElementById('btn-admin-newteams');
      if (newTeamsBtn) {
        newTeamsBtn.textContent = data.allowNewTeams ? 'Registration: Open' : 'Registration: Closed';
        newTeamsBtn.onclick = async () => {
          await fetch('/api/admin/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-pin': adminPin },
            body: JSON.stringify({ allowNewTeams: !data.allowNewTeams })
          });
          loadMasterData();
        };
      }

      // Populate Coordinator Filter Pills
      const coordCounts = {};
      allTeams.forEach(t => {
        const c = t.coordinator || 'Unassigned';
        coordCounts[c] = (coordCounts[c] || 0) + 1;
      });

      const pillsContainer = document.getElementById('coord-pills-container');
      if (pillsContainer) {
        let pillsHtml = `<button class="coord-filter-pill ${currentCoordinatorFilter === 'ALL' ? 'active' : ''}" data-coord="ALL">All Teams (${allTeams.length})</button>`;
        Object.keys(coordCounts).sort().forEach(c => {
          const isActive = currentCoordinatorFilter.toLowerCase() === c.toLowerCase();
          pillsHtml += `<button class="coord-filter-pill ${isActive ? 'active' : ''}" data-coord="${escapeHtml(c)}">${escapeHtml(c)} (${coordCounts[c]})</button>`;
        });
        pillsContainer.innerHTML = pillsHtml;

        pillsContainer.querySelectorAll('.coord-filter-pill').forEach(btn => {
          btn.onclick = () => {
            currentCoordinatorFilter = btn.dataset.coord;
            loadMasterData();
          };
        });
      }

      // Filter teams according to selected pill
      let filteredTeams = allTeams;
      if (currentCoordinatorFilter !== 'ALL') {
        filteredTeams = allTeams.filter(t => (t.coordinator || '').toLowerCase() === currentCoordinatorFilter.toLowerCase());
      }

      // Render Teams Table
      const tableEl = document.getElementById('admin-teams-table');
      if (tableEl) {
        if (filteredTeams.length === 0) {
          tableEl.innerHTML = '<p style="padding: 20px; color: var(--muted); text-align: center;">No teams match the selected filter.</p>';
        } else {
          let rows = filteredTeams.map(t => {
            let statusBadge = '';
            if (t.isFinished) {
              statusBadge = '<span style="color: var(--ok); font-weight: bold;">✅ Done</span>';
            } else if (t.status === 'waiting') {
              statusBadge = '<span style="color: var(--gold); font-weight: bold;">⏳ Lobby</span>';
            } else if (t.isIndividuallyPaused) {
              statusBadge = '<span style="color: var(--bad); font-weight: bold;">⏸ Paused</span>';
            } else {
              statusBadge = '<span style="color: var(--accent); font-weight: bold;">▶ Active</span>';
            }

            const cheatBadge = (t.tabSwitches && t.tabSwitches > 0)
              ? `<span class="cheat-badge" title="${t.tabSwitches} anti-cheat violation(s)">🚨 ${t.tabSwitches}</span>`
              : '<span style="color: var(--muted); font-size: 0.8rem;">0</span>';

            const pauseBtnHtml = t.isIndividuallyPaused
              ? `<button class="btn btn-gold btn-sm btn-team-resume" data-id="${t.id}" title="Resume this team">▶ Resume</button>`
              : `<button class="btn btn-outline btn-sm btn-team-pause" data-id="${t.id}" title="Pause this team">⏸ Pause</button>`;

            return `
              <tr>
                <td><strong>${escapeHtml(t.name)}</strong></td>
                <td><span style="color: var(--accent); font-weight: 600;">${escapeHtml(t.coordinator)}</span></td>
                <td>${statusBadge}</td>
                <td><span style="color: ${t.isFinished ? 'var(--ok)' : 'var(--txt)'}; font-weight: bold;">${t.isFinished ? '✅ Done' : t.stage + '/6'}</span></td>
                <td style="font-family: monospace; font-size: 1rem; color: var(--gold);">${t.formattedTime}</td>
                <td>+${t.penaltyMin}m</td>
                <td style="text-align: center;">${cheatBadge}</td>
                <td>
                  <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                    ${pauseBtnHtml}
                    <button class="btn btn-outline btn-sm btn-team-restart" data-id="${t.id}" data-name="${escapeHtml(t.name)}" title="Restart this team back to Stage 1">🔄 Restart</button>
                    <button class="btn btn-outline btn-sm btn-action-skip" data-id="${t.id}" title="Skip current stage">⏭ Skip</button>
                    <button class="btn btn-outline btn-sm btn-action-devices" data-id="${t.id}" title="Reset bound member devices">🔄 Devices</button>
                    <button class="btn btn-danger btn-sm btn-action-del" data-id="${t.id}" title="Delete team">🗑</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('');

          tableEl.innerHTML = `
            <table class="data-table">
              <thead>
                <tr>
                  <th>Team</th>
                  <th>Coordinator</th>
                  <th>Status</th>
                  <th>Stage</th>
                  <th>Total Time</th>
                  <th>Penalty</th>
                  <th>Tab Violations</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          `;

          // Team Pause / Resume Listeners
          tableEl.querySelectorAll('.btn-team-pause').forEach(b => {
            b.onclick = async () => {
              await fetch('/api/admin/team-pause', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-admin-pin': adminPin },
                body: JSON.stringify({ teamId: b.dataset.id, action: 'pause' })
              });
              loadMasterData();
            };
          });

          tableEl.querySelectorAll('.btn-team-resume').forEach(b => {
            b.onclick = async () => {
              await fetch('/api/admin/team-pause', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-admin-pin': adminPin },
                body: JSON.stringify({ teamId: b.dataset.id, action: 'resume' })
              });
              loadMasterData();
            };
          });

          // Individual Team Restart Listener
          tableEl.querySelectorAll('.btn-team-restart').forEach(b => {
            b.onclick = async () => {
              if (confirm(`Restart team "${b.dataset.name}" back to Stage 1? Their progress, chat, and penalties will be reset.`)) {
                await fetch('/api/admin/team-restart', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'x-admin-pin': adminPin },
                  body: JSON.stringify({ teamId: b.dataset.id })
                });
                showToast(`Team ${b.dataset.name} restarted at Stage 1.`);
                loadMasterData();
              }
            };
          });

          // Attach Stage Skip
          tableEl.querySelectorAll('.btn-action-skip').forEach(b => {
            b.onclick = async () => {
              if (confirm('Skip current stage for this team?')) {
                await fetch('/api/admin/skip', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'x-admin-pin': adminPin },
                  body: JSON.stringify({ teamId: b.dataset.id })
                });
                loadMasterData();
              }
            };
          });

          // Attach Reset Devices
          tableEl.querySelectorAll('.btn-action-devices').forEach(b => {
            b.onclick = async () => {
              const targetTeam = allTeams.find(t => t.id === b.dataset.id);
              if (targetTeam && targetTeam.members) {
                for (const m of targetTeam.members) {
                  await fetch('/api/admin/reset-member-device', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-admin-pin': adminPin },
                    body: JSON.stringify({ memberId: m.id })
                  });
                }
                alert('Device bindings reset for team.');
                loadMasterData();
              }
            };
          });

          // Attach Delete Team
          tableEl.querySelectorAll('.btn-action-del').forEach(b => {
            b.onclick = async () => {
              if (confirm('Permanently delete this team?')) {
                await fetch('/api/admin/reset-team', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'x-admin-pin': adminPin },
                  body: JSON.stringify({ teamId: b.dataset.id })
                });
                loadMasterData();
              }
            };
          });
        }
      }

      // WARDEN Logs
      const logsRes = await fetch('/api/admin/warden-logs', {
        headers: { 'x-admin-pin': adminPin }
      });
      if (logsRes.ok) {
        const logsData = await logsRes.json();
        const logsEl = document.getElementById('admin-warden-logs');
        if (logsEl) {
          if (!logsData.logs || logsData.logs.length === 0) {
            logsEl.textContent = 'No chat messages recorded yet.';
          } else {
            logsEl.innerHTML = logsData.logs.map(l => {
              const timeStr = new Date(l.at).toLocaleTimeString();
              const color = l.role === 'warden' ? 'var(--accent)' : '#ffffff';
              return `<div><span style="color: var(--muted);">[${timeStr}]</span> <strong>${escapeHtml(l.teamName)}</strong> (${l.role}): <span style="color: ${color};">${escapeHtml(l.text)}</span></div>`;
            }).join('');
          }
        }
      }

      // Violations
      loadViolations();

    } catch (err) {
      console.error('Admin poll error:', err);
    }
  }

  loadMasterData();
  portalPollInterval = setInterval(loadMasterData, 3000);
}

// ==========================================================================
// LIVE LEADERBOARD WITH EVENT TIMER CONTROLS (/leaderboard)
// ==========================================================================
let lbPollInterval = null;
let lbClockLocalSeconds = 0;
let lbClockIsPaused = false;
let lbClockLocalTimer = null;

function renderLeaderboardView(container) {
  if (lbPollInterval) clearInterval(lbPollInterval);
  if (lbClockLocalTimer) clearInterval(lbClockLocalTimer);

  container.innerHTML = `
    <div class="card" style="max-width: 1040px; margin: 0 auto;">
      <div style="text-align: center; margin-bottom: 18px; border-bottom: 1px solid var(--line); padding-bottom: 14px;">
        <h1 style="font-size: clamp(1.8rem, 4vw, 2.4rem); color: var(--gold); letter-spacing: 2px;">
          🏆 LIVE LEADERBOARD
        </h1>
        <p style="color: var(--muted); font-size: 0.95rem; margin-top: 4px;">
          Dept. of Computer Science & Engineering · Vidyavardhaka College of Engineering
        </p>
      </div>

      <!-- Prominent Event Timer Hero Card with Start/Stop Controls -->
      <div class="leaderboard-clock-card">
        <div style="display: flex; align-items: center; gap: 10px; justify-content: center;">
          <span style="font-size: 0.95rem; text-transform: uppercase; letter-spacing: 1.5px; color: var(--muted); font-weight: 700;">
            Global Event Timer
          </span>
          <span id="lb-clock-status" class="clock-status-pill running">
            🟢 RUNNING
          </span>
        </div>

        <div id="lb-clock-display" class="leaderboard-clock-digits">
          00:00
        </div>

        <div class="leaderboard-clock-controls">
          <button id="btn-lb-toggle-clock" class="btn btn-gold btn-sm">
            ⏸️ Stop Timer
          </button>
          <button id="btn-lb-reset-clock" class="btn btn-outline btn-sm">
            🔄 Reset Timer
          </button>
        </div>
      </div>

      <!-- Rankings Table -->
      <div id="lb-table-container" class="data-table-container">
        <p style="padding: 20px; color: var(--muted); text-align: center;">Loading rankings...</p>
      </div>
    </div>
  `;

  // Helper to ensure Admin PIN is provided before timer changes
  async function ensurePin() {
    let pin = sessionStorage.getItem('fo_admin_pin');
    if (pin) return pin;
    pin = prompt('Enter Organiser Admin PIN to control event timer:');
    if (!pin) return null;
    const verifyRes = await fetch('/api/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });
    if (verifyRes.ok) {
      sessionStorage.setItem('fo_admin_pin', pin);
      return pin;
    } else {
      alert('Invalid Admin PIN.');
      return null;
    }
  }

  // Timer Start/Stop Handler
  document.getElementById('btn-lb-toggle-clock').onclick = async () => {
    const pin = await ensurePin();
    if (!pin) return;

    const action = lbClockIsPaused ? 'start' : 'stop';
    try {
      const res = await fetch('/api/leaderboard/clock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, action })
      });
      if (res.ok) {
        showToast(action === 'stop' ? '⏸️ Event timer stopped.' : '▶️ Event timer started.');
        loadLbData();
      } else {
        const err = await res.json();
        alert(err.error || 'Timer control failed.');
      }
    } catch {
      alert('Connection error.');
    }
  };

  // Timer Reset Handler
  document.getElementById('btn-lb-reset-clock').onclick = async () => {
    const pin = await ensurePin();
    if (!pin) return;

    if (!confirm('Are you sure you want to reset the global event timer?')) return;

    try {
      const res = await fetch('/api/leaderboard/clock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, action: 'reset' })
      });
      if (res.ok) {
        showToast('🔄 Event timer reset.');
        loadLbData();
      }
    } catch {
      alert('Connection error.');
    }
  };

  // Local clock ticker for smooth second-by-second updates
  lbClockLocalTimer = setInterval(() => {
    if (!lbClockIsPaused) {
      lbClockLocalSeconds++;
      const clockEl = document.getElementById('lb-clock-display');
      if (clockEl) {
        clockEl.textContent = formatDuration(lbClockLocalSeconds);
      }
    }
  }, 1000);

  async function loadLbData() {
    try {
      const res = await fetch('/api/leaderboard');
      if (!res.ok) return;
      const data = await res.json();
      const teams = data.teams || [];
      const clock = data.clock || {};

      // Synchronize clock state with server
      lbClockIsPaused = !!clock.isPaused;
      lbClockLocalSeconds = clock.totalSeconds || 0;

      const clockDigitsEl = document.getElementById('lb-clock-display');
      const clockStatusEl = document.getElementById('lb-clock-status');
      const toggleBtn = document.getElementById('btn-lb-toggle-clock');

      if (clockDigitsEl && clockStatusEl && toggleBtn) {
        clockDigitsEl.textContent = formatDuration(lbClockLocalSeconds);
        if (lbClockIsPaused) {
          clockDigitsEl.classList.add('paused');
          clockStatusEl.className = 'clock-status-pill paused';
          clockStatusEl.textContent = '⏸️ PAUSED';
          toggleBtn.textContent = '▶️ Start / Resume Timer';
          toggleBtn.className = 'btn btn-primary btn-sm';
        } else {
          clockDigitsEl.classList.remove('paused');
          clockStatusEl.className = 'clock-status-pill running';
          clockStatusEl.textContent = '🟢 RUNNING';
          toggleBtn.textContent = '⏸️ Stop Timer';
          toggleBtn.className = 'btn btn-gold btn-sm';
        }
      }

      // Render Leaderboard Teams Table
      const containerEl = document.getElementById('lb-table-container');
      if (!containerEl) return;

      if (teams.length === 0) {
        containerEl.innerHTML = '<p style="padding: 24px; text-align: center; color: var(--muted);">No teams registered yet.</p>';
        return;
      }

      let rows = teams.map((t, idx) => {
        let rankBadge = `${idx + 1}`;
        if (idx === 0) rankBadge = '🥇 1';
        if (idx === 1) rankBadge = '🥈 2';
        if (idx === 2) rankBadge = '🥉 3';

        return `
          <tr style="${t.isFinished ? 'background: rgba(52, 211, 153, 0.08);' : ''}">
            <td style="font-size: 1.1rem; font-weight: bold; color: var(--gold);">${rankBadge}</td>
            <td style="font-size: 1.15rem; font-weight: bold;">${escapeHtml(t.name)}</td>
            <td><span style="color: var(--muted); font-size: 0.9rem;">${escapeHtml(t.coordinator || '-')}</span></td>
            <td><span style="font-weight: bold; color: ${t.isFinished ? 'var(--ok)' : 'var(--accent)'}; font-size: 1.05rem;">${t.stageText}</span></td>
            <td style="font-family: monospace; font-size: 1.25rem; font-weight: bold; color: var(--txt);">${t.formattedTime}</td>
            <td style="color: var(--muted);">${t.totalHints}</td>
            <td style="color: var(--muted);">${t.totalWrong}</td>
          </tr>
        `;
      }).join('');

      containerEl.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 70px;">Rank</th>
              <th>Team</th>
              <th>Coordinator</th>
              <th>Stage</th>
              <th>Time (+Penalties)</th>
              <th>Hints</th>
              <th>Wrong Tries</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      `;
    } catch (err) {
      console.error('Leaderboard poll error:', err);
    }
  }

  loadLbData();
  lbPollInterval = setInterval(loadLbData, 3000);
}

// Utility: HTML escape
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Kick off when DOM is ready
document.addEventListener('DOMContentLoaded', init);
