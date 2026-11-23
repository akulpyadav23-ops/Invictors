// FINAL OVERRIDE — Main Application Client

let gameState = null;
let liveTimerInterval = null;
let lobbyPollInterval = null;
let hintTickerInterval = null;
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
  if (hintTickerInterval) {
    clearInterval(hintTickerInterval);
    hintTickerInterval = null;
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

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 14px; padding-top: 10px; border-top: 1px dashed var(--line); font-size: 0.88rem;">
          <span style="color: var(--muted); font-weight: 600;">Assigned Mission Set:</span>
          <span class="badge" style="background: rgba(56, 189, 248, 0.2); color: var(--accent); border: 1px solid var(--accent); font-weight: bold; padding: 3px 10px; font-size: 0.82rem;">
            🎯 Set ${escapeHtml(team.set || 'A')} — ${escapeHtml(team.setName || 'Cosmic Vault Alpha')}
          </span>
        </div>
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
  const setKey = team.set || 'A';
  const setColors = { A: '#38bdf8', B: '#f59e0b', C: '#c084fc', D: '#f472b6' };
  const setColor = setColors[setKey] || '#38bdf8';
  document.getElementById('status-team-name').innerHTML = `${escapeHtml(team.name)} <span class="badge" style="background: rgba(15,23,42,0.85); border: 1px solid ${setColor}; color: ${setColor}; font-size: 0.72rem; padding: 1px 6px; font-weight: bold; margin-left: 5px;">Set ${escapeHtml(setKey)}</span>`;
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
    if (syncTicks % 10 === 0) {
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
  let coordinators = ['Tanu', 'Surabhi', 'Abhivishnu', 'Chandrashekar', 'Thrisha', 'Arun', 'Divya', 'Kiran', 'Pooja', 'Rakshith'];
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
          <div class="stage-poster-title">CTF Challenges</div>
          <div class="stage-poster-desc">Security Control Room: Access logs, dark camera feed & symbol keypad</div>
        </div>
        <div class="stage-poster-card s5">
          <div class="stage-badge-num">5</div>
          <div style="font-size: 1.6rem;">🔢</div>
          <div class="stage-poster-title">Hex Decryption</div>
          <div class="stage-poster-desc">Solve memory bus puzzle & decode hex stream to ASCII</div>
        </div>
      </div>
    </div>

    <!-- CRITICAL PRE-MISSION BRIEFING & STRATEGIC NOTICE -->
    <div class="card" style="border: 2px solid var(--gold); background: linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(15, 23, 42, 0.95)); box-shadow: 0 0 25px rgba(245, 158, 11, 0.2);">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 10px;">
        <span style="font-size: 2rem; filter: drop-shadow(0 0 10px var(--gold));">⚠️</span>
        <div>
          <h2 style="font-size: 1.35rem; color: var(--gold); margin: 0; font-family: var(--font-display); letter-spacing: 1px;">
            IMPORTANT NOTICE · READ &amp; ANALYZE BEFORE ENTERING
          </h2>
          <span style="font-size: 0.82rem; color: var(--accent); text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px;">Crucial Operational Intelligence for Mission Completion</span>
        </div>
      </div>
      <p style="font-size: 1.02rem; line-height: 1.7; color: var(--txt); margin: 0 0 12px 0;">
        <strong>What you must know before entering the game:</strong> Carefully inspect and analyze everything on this front briefing page before you start. Do not rush into registration without reviewing the mission parameters!
      </p>
      <div style="background: rgba(3, 8, 20, 0.9); border: 1px solid rgba(245, 158, 11, 0.4); border-left: 5px solid var(--gold); border-radius: var(--radius-sm); padding: 14px 16px; font-size: 0.95rem; color: #fef08a; line-height: 1.65;">
        🔍 <strong>Vital Clue for Stage 6 Override:</strong> Observe and record the exact <strong>Mission Names</strong> displayed on this briefing board (<em>Signal Intercept</em>, <em>Decoding</em>, <em>Prompt the AI</em>, <em>CTF Challenges</em>, <em>Hex Decryption</em>). When your squad unlocks the final master override in <strong>Stage 6</strong>, the system requires you to arrange and synthesize your recovered pieces based on these exact mission names! Take note of them now before lockdown begins!
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
        <li><strong style="color: var(--stage5-color);">5️⃣ Team Collaboration:</strong> Teams of 3–4 members collaborate around one command console. Stage 5 features an advanced Hexadecimal Memory Core puzzle.</li>
        <li><strong style="color: var(--bad);">🚨 Anti-Cheat:</strong> Tab switches and switching to unauthorized tools incur an automatic <span style="color:var(--bad);">+2m penalty</span>.</li>
      </ul>
    </div>

    <!-- Register Team Form -->
    <div class="card">
      <h2 class="card-title">📝 Register your team (3 or 4 players)</h2>
      <form id="team-register-form">
        <div class="form-group">
          <label for="reg-team-name">Team name or ID (max 24 characters) *</label>
          <input type="text" id="reg-team-name" class="input-control" maxlength="24" placeholder="e.g. Trinetra, BugBusters, TheDynamos" required />
          <div id="reg-team-verify-badge" style="margin-top: 6px; font-size: 0.84rem; min-height: 22px;"></div>
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
  `;

  const regTeamInput = document.getElementById('reg-team-name');
  const regVerifyBadge = document.getElementById('reg-team-verify-badge');
  let regVerifyTimeout = null;

  if (regTeamInput && regVerifyBadge) {
    regTeamInput.addEventListener('input', () => {
      const val = regTeamInput.value.trim();
      if (!val) {
        regVerifyBadge.innerHTML = '';
        return;
      }
      clearTimeout(regVerifyTimeout);
      regVerifyTimeout = setTimeout(async () => {
        try {
          const res = await fetch(`/api/verify-team?name=${encodeURIComponent(val)}`);
          if (!res.ok) return;
          const data = await res.json();
          const setColors = { A: '#38bdf8', B: '#f59e0b', C: '#c084fc', D: '#f472b6' };
          const color = setColors[data.setKey] || '#38bdf8';
          regVerifyBadge.innerHTML = `
            <span style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 4px; background: rgba(15, 23, 42, 0.85); border: 1px solid ${color}; color: ${color}; font-weight: 600; font-size: 0.82rem;">
              <span>🎯 Verified Squad:</span>
              <strong style="color: #fff;">${escapeHtml(data.teamName)}</strong>
              <span>➔ Assigned to</span>
              <span style="text-decoration: underline; font-weight: 700;">Set ${data.setKey} (${escapeHtml(data.setName)})</span>
            </span>
          `;
        } catch (_) {}
      }, 200);
    });
  }

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
    const s1Sectors = content.sectors || [
      { id: 1, title: 'Sector 01: Waveform Pulse Duration', tech: 'PULSE SIGNAL', morse: '— •' },
      { id: 2, title: 'Sector 02: Binary Serial Modulation', tech: 'BINARY CODE', morse: '— — —' },
      { id: 3, title: 'Sector 03: Optical Pulse Strobe', tech: 'BLINKING LIGHT', morse: '• • • —' },
      { id: 4, title: 'Sector 04: Satellite Uplink Pulse', tech: 'SATELLITE SIGNAL', morse: '• —' }
    ];

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
        
        <!-- Sector 01 -->
        <div class="sector-card" style="background: #030814; border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--line); padding-bottom: 8px; margin-bottom: 10px;">
            <span style="font-weight: bold; font-family: var(--font-mono); color: var(--accent); font-size: 0.9rem;">SECTOR 1 ➔ LETTER 1</span>
            <span style="background: rgba(39, 180, 255, 0.15); color: var(--accent); font-size: 0.72rem; padding: 2px 8px; border-radius: 4px; font-weight: bold;">${s1Sectors[0].tech || 'PULSE SIGNAL'}</span>
          </div>
          <p style="font-size: 0.86rem; color: var(--muted); margin-bottom: 10px;">
            Intercepted waveform pattern:
          </p>
          <div style="background: #01040a; border: 1px solid #1a365d; border-radius: 4px; padding: 12px 8px; display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 10px;">
            <div style="font-family: var(--font-mono); font-size: 1.1rem; color: var(--accent); font-weight: bold; letter-spacing: 4px;">${s1Sectors[0].morse}</div>
          </div>
          <div style="font-family: var(--font-mono); font-size: 0.92rem; color: var(--gold); text-align: center; font-weight: bold;">
            Morse Code: <span style="letter-spacing: 6px;">${s1Sectors[0].morse}</span>
          </div>
        </div>

        <!-- Sector 02 -->
        <div class="sector-card" style="background: #030814; border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--line); padding-bottom: 8px; margin-bottom: 10px;">
            <span style="font-weight: bold; font-family: var(--font-mono); color: var(--gold); font-size: 0.9rem;">SECTOR 2 ➔ LETTER 2</span>
            <span style="background: rgba(251, 191, 36, 0.15); color: var(--gold); font-size: 0.72rem; padding: 2px 8px; border-radius: 4px; font-weight: bold;">${s1Sectors[1].tech || 'BINARY CODE'}</span>
          </div>
          <p style="font-size: 0.86rem; color: var(--muted); margin-bottom: 10px;">
            Intercepted binary telemetry stream:
          </p>
          <div style="background: #01040a; border: 1px solid #4a3808; border-radius: 4px; padding: 12px 8px; display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 10px;">
            <div style="font-family: var(--font-mono); font-size: 1.1rem; color: var(--gold); font-weight: bold; letter-spacing: 4px;">${s1Sectors[1].morse}</div>
          </div>
          <div style="font-family: var(--font-mono); font-size: 0.92rem; color: var(--gold); text-align: center; font-weight: bold;">
            Morse Code: <span style="letter-spacing: 6px;">${s1Sectors[1].morse}</span>
          </div>
        </div>

        <!-- Sector 03 -->
        <div class="sector-card" style="background: #030814; border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--line); padding-bottom: 8px; margin-bottom: 10px;">
            <span style="font-weight: bold; font-family: var(--font-mono); color: #38bdf8; font-size: 0.9rem;">SECTOR 3 ➔ LETTER 3</span>
            <span style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-size: 0.72rem; padding: 2px 8px; border-radius: 4px; font-weight: bold;">${s1Sectors[2].tech || 'BLINKING LIGHT'}</span>
          </div>
          <p style="font-size: 0.86rem; color: var(--muted); margin-bottom: 10px;">
            Flashing beacon telemetry:
          </p>
          <div style="background: #01040a; border: 1px solid #1e293b; border-radius: 4px; padding: 8px 12px; display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div id="optical-beacon-lamp" style="width: 22px; height: 22px; border-radius: 50%; background: #334155; border: 2px solid #64748b; transition: all 0.08s ease;"></div>
              <span id="optical-beacon-status" style="font-family: var(--font-mono); font-size: 0.78rem; color: var(--muted);">READY</span>
            </div>
            <button type="button" id="btn-trigger-strobe" class="btn btn-outline btn-sm" style="padding: 4px 10px; font-size: 0.78rem;">▶ Watch Light Blink</button>
          </div>
          <div style="font-family: var(--font-mono); font-size: 0.92rem; color: var(--gold); text-align: center; font-weight: bold;">
            Morse Code: <span style="letter-spacing: 6px;">${s1Sectors[2].morse}</span>
          </div>
          <div style="font-size: 0.72rem; color: var(--bad); text-align: center; margin-top: 4px;">
            ⚠️ Trap Alert: Screen may flash decoy word <code>ZETA9</code>. Ignore it!
          </div>
        </div>

        <!-- Sector 04 -->
        <div class="sector-card" style="background: #030814; border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--line); padding-bottom: 8px; margin-bottom: 10px;">
            <span style="font-weight: bold; font-family: var(--font-mono); color: #a78bfa; font-size: 0.9rem;">SECTOR 4 ➔ LETTER 4</span>
            <span style="background: rgba(167, 139, 250, 0.15); color: #a78bfa; font-size: 0.72rem; padding: 2px 8px; border-radius: 4px; font-weight: bold;">${s1Sectors[3].tech || 'SATELLITE SIGNAL'}</span>
          </div>
          <p style="font-size: 0.86rem; color: var(--muted); margin-bottom: 10px;">
            Final satellite pulse relay:
          </p>
          <div style="background: #01040a; border: 1px solid #2e1065; border-radius: 4px; padding: 12px 8px; display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 10px;">
            <div style="font-family: var(--font-mono); font-size: 1.1rem; color: #a78bfa; font-weight: bold; letter-spacing: 4px;">${s1Sectors[3].morse}</div>
          </div>
          <div style="font-family: var(--font-mono); font-size: 0.92rem; color: var(--gold); text-align: center; font-weight: bold;">
            Morse Code: <span style="letter-spacing: 6px;">${s1Sectors[3].morse}</span>
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
            <span style="font-size: 0.65rem; color: var(--muted);">Letter 1 (${s1Sectors[0].morse})</span>
            <span id="slot-val-1" style="font-family: var(--font-mono); font-weight: bold; font-size: 1.25rem; color: var(--accent);">?</span>
          </div>
          <div id="slot-preview-2" style="background: #020612; border: 2px dashed #334155; border-radius: 6px; width: 68px; height: 54px; display: flex; flex-direction: column; align-items: center; justify-content: center; transition: all 0.2s ease;">
            <span style="font-size: 0.65rem; color: var(--muted);">Letter 2 (${s1Sectors[1].morse})</span>
            <span id="slot-val-2" style="font-family: var(--font-mono); font-weight: bold; font-size: 1.25rem; color: var(--accent);">?</span>
          </div>
          <div id="slot-preview-3" style="background: #020612; border: 2px dashed #334155; border-radius: 6px; width: 68px; height: 54px; display: flex; flex-direction: column; align-items: center; justify-content: center; transition: all 0.2s ease;">
            <span style="font-size: 0.65rem; color: var(--muted);">Letter 3 (${s1Sectors[2].morse})</span>
            <span id="slot-val-3" style="font-family: var(--font-mono); font-weight: bold; font-size: 1.25rem; color: var(--accent);">?</span>
          </div>
          <div id="slot-preview-4" style="background: #020612; border: 2px dashed #334155; border-radius: 6px; width: 68px; height: 54px; display: flex; flex-direction: column; align-items: center; justify-content: center; transition: all 0.2s ease;">
            <span style="font-size: 0.65rem; color: var(--muted);">Letter 4 (${s1Sectors[3].morse})</span>
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
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 6px;">
          <span style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: var(--muted);">Intercepted Cipher Payload:</span>
          <span style="font-size: 0.78rem; font-weight: bold; color: var(--accent); background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.4); border-radius: 4px; padding: 2px 8px;">
            🔀 Shuffled Sequence: ${escapeHtml(content.sequenceHint || 'Multi-Layer Transposition')}
          </span>
        </div>
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
    const logRows = content.logRows || [
      { time: '08:02', user: 'a.rao', door: 'Lab-1', status: 'GRANTED', clearance: 'L2' },
      { time: '08:07', user: 'm.kumar', door: 'Lab-2', status: 'GRANTED', clearance: 'L3' },
      { time: '08:15', user: 's.nair', door: 'Vault Gate', status: 'GRANTED', clearance: 'L4' },
      { time: '08:21', user: 'r.iyer', door: 'Lab-1', status: 'GRANTED', clearance: 'L2' },
      { time: '08:34', user: 'unknown', door: 'Vault Gate', status: 'DENIED', clearance: 'L9' },
      { time: '08:40', user: 'p.shetty', door: 'Lab-3', status: 'GRANTED', clearance: 'L3' },
      { time: '08:46', user: 'd.gowda', door: 'Lab-2', status: 'GRANTED', clearance: 'L2' },
      { time: '08:53', user: 'k.bhat', door: 'Vault Gate', status: 'GRANTED', clearance: 'L4' },
      { time: '09:01', user: 't.menon', door: 'Lab-1', status: 'GRANTED', clearance: 'L3' },
      { time: '09:10', user: 'v.hegde', door: 'Lab-3', status: 'GRANTED', clearance: 'L2' }
    ];
    const targetDigit = content.targetDigit || '1';
    const symbolKey = content.symbol || 'triangle';
    const solvedStations = new Set(content.solvedStations || []);

    const s1Solved = solvedStations.has(1);
    const s2Solved = solvedStations.has(2);
    const s3Solved = solvedStations.has(3);
    const solvedCount = solvedStations.size;

    // SVG shapes mapping
    const svgShapes = {
      triangle: '<polygon points="12,2 22,20 2,20" fill="none" stroke="currentColor" stroke-width="2"/>',
      circle: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/>',
      square: '<rect x="3" y="3" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"/>',
      star: '<polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9" fill="none" stroke="currentColor" stroke-width="2"/>',
      diamond: '<polygon points="12,2 22,12 12,22 2,12" fill="none" stroke="currentColor" stroke-width="2"/>',
      pentagon: '<polygon points="12,2 22,9 18,21 6,21 2,9" fill="none" stroke="currentColor" stroke-width="2"/>',
      hexagon: '<polygon points="12,2 21,7 21,17 12,22 3,17 3,7" fill="none" stroke="currentColor" stroke-width="2"/>',
      cross: '<path d="M12,2 v20 M2,12 h20" stroke="currentColor" stroke-width="2.5"/>'
    };

    const legendItems = [
      { name: 'Triangle', char: 'X', shape: svgShapes.triangle },
      { name: 'Circle', char: 'O', shape: svgShapes.circle },
      { name: 'Square', char: 'K', shape: svgShapes.square },
      { name: 'Star', char: 'S', shape: svgShapes.star },
      { name: 'Diamond', char: 'D', shape: svgShapes.diamond },
      { name: 'Pentagon', char: 'G', shape: svgShapes.pentagon },
      { name: 'Hexagon', char: 'Z', shape: svgShapes.hexagon },
      { name: 'Cross', char: 'Y', shape: svgShapes.cross }
    ];

    specificHtml = `
      <div style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(56, 189, 248, 0.35); border-radius: var(--radius-sm); padding: 14px; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 6px;">
          <span style="font-weight: 700; color: var(--accent); font-size: 1.05rem; display: flex; align-items: center; gap: 8px;">
            🚩 CTF CHALLENGES · SECURITY CONTROL ROOM
          </span>
          <span style="background: rgba(14, 165, 233, 0.15); border: 1px solid var(--accent); color: var(--accent); font-size: 0.78rem; font-weight: bold; padding: 3px 10px; border-radius: 12px; font-family: var(--font-mono);">
            CONTROL ROOM: ACTIVE
          </span>
        </div>
        <p style="margin: 0 0 10px 0; color: var(--muted); font-size: 0.88rem; line-height: 1.5;">
          The Security Control Room requires verification across <strong>3 distinct stations</strong>. Solve each station to recover its character token, then combine them in order (Station 1 + Station 2 + Station 3) to assemble Fragment 4.
        </p>
        <div style="display: flex; align-items: center; justify-content: space-between; background: #020612; border: 1px solid var(--line); border-radius: 6px; padding: 8px 14px; flex-wrap: wrap; gap: 8px;">
          <span style="font-size: 0.85rem; font-weight: bold; color: var(--gold);">
            Verified Stations: <span id="stations-solved-counter">${solvedCount}</span> / 3
          </span>
          <div style="display: flex; gap: 8px;">
            <span id="badge-st1" style="font-size: 0.75rem; font-weight: bold; padding: 2px 8px; border-radius: 4px; ${s1Solved ? 'background: rgba(34, 197, 94, 0.2); color: var(--ok); border: 1px solid var(--ok);' : 'background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid #ef4444;'}">
              ${s1Solved ? 'Station 1: ✓' : 'Station 1: ✕'}
            </span>
            <span id="badge-st2" style="font-size: 0.75rem; font-weight: bold; padding: 2px 8px; border-radius: 4px; ${s2Solved ? 'background: rgba(34, 197, 94, 0.2); color: var(--ok); border: 1px solid var(--ok);' : 'background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid #ef4444;'}">
              ${s2Solved ? 'Station 2: ✓' : 'Station 2: ✕'}
            </span>
            <span id="badge-st3" style="font-size: 0.75rem; font-weight: bold; padding: 2px 8px; border-radius: 4px; ${s3Solved ? 'background: rgba(34, 197, 94, 0.2); color: var(--ok); border: 1px solid var(--ok);' : 'background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid #ef4444;'}">
              ${s3Solved ? 'Station 3: ✓' : 'Station 3: ✕'}
            </span>
          </div>
        </div>
      </div>

      <!-- Station 1: Access Logs Table -->
      <div class="station-card" id="station-card-1" style="background: #020612; border: 1px solid ${s1Solved ? 'var(--ok)' : 'var(--line)'}; border-radius: var(--radius-sm); padding: 14px; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 6px;">
          <div style="font-size: 0.9rem; font-weight: bold; color: var(--gold); display: flex; align-items: center; gap: 8px;">
            <span>📋 STATION 1: ACCESS LOGS AUDIT</span>
            ${s1Solved ? '<span style="color: var(--ok); font-size: 0.78rem; background: rgba(34, 197, 94, 0.15); padding: 2px 8px; border-radius: 4px;">VERIFIED ✅</span>' : ''}
          </div>
          <span style="font-size: 0.78rem; color: var(--muted);">Token 1 of 3</span>
        </div>
        <p style="font-size: 0.84rem; color: var(--muted); margin: 0 0 10px 0; line-height: 1.45;">
          Inspect the 10 door access logs below. Identify the <strong>single breach attempt (DENIED status)</strong> and extract its clearance digit.
        </p>
        <div style="max-height: 220px; overflow-y: auto; border: 1px solid #1e293b; border-radius: 4px; margin-bottom: 10px;">
          <table style="width: 100%; border-collapse: collapse; font-family: var(--font-mono); font-size: 0.78rem; text-align: left;">
            <thead>
              <tr style="background: #0f172a; color: var(--muted); border-bottom: 1px solid #334155;">
                <th style="padding: 6px 10px;">TIME</th>
                <th style="padding: 6px 10px;">USER</th>
                <th style="padding: 6px 10px;">DOOR</th>
                <th style="padding: 6px 10px;">STATUS</th>
                <th style="padding: 6px 10px;">CLEARANCE</th>
              </tr>
            </thead>
            <tbody>
              ${logRows.map(r => {
                const isDenied = r.status === 'DENIED';
                return `
                  <tr style="border-bottom: 1px solid rgba(51, 65, 85, 0.3); ${isDenied ? 'background: rgba(239, 68, 68, 0.15); font-weight: bold;' : ''}">
                    <td style="padding: 5px 10px; color: ${isDenied ? '#fca5a5' : '#94a3b8'};">${escapeHtml(r.time)}</td>
                    <td style="padding: 5px 10px; color: ${isDenied ? '#fca5a5' : 'var(--txt)'};">${escapeHtml(r.user)}</td>
                    <td style="padding: 5px 10px; color: ${isDenied ? '#fca5a5' : '#94a3b8'};">${escapeHtml(r.door)}</td>
                    <td style="padding: 5px 10px; color: ${isDenied ? 'var(--bad)' : 'var(--ok)'}; font-weight: bold;">${escapeHtml(r.status)}</td>
                    <td style="padding: 5px 10px; color: ${isDenied ? 'var(--gold)' : '#94a3b8'}; font-weight: bold;">${escapeHtml(r.clearance)}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <input type="text" id="station1-input" class="input-control" placeholder="Enter clearance digit or level (e.g. 9 or L9)" style="max-width: 280px; font-family: var(--font-mono); font-size: 0.85rem;" ${s1Solved ? 'disabled value="VERIFIED"' : ''} />
          <button type="button" id="btn-check-station-1" class="btn btn-primary btn-sm" ${s1Solved ? 'disabled' : ''}>Check Station 1</button>
          <div id="st1-feedback" class="feedback-line" style="margin: 0; font-size: 0.82rem;"></div>
        </div>
      </div>

      <!-- Station 2: Dark Camera Feed with Interactive Brightness Slider -->
      <div class="station-card" id="station-card-2" style="background: #020612; border: 1px solid ${s2Solved ? 'var(--ok)' : 'var(--line)'}; border-radius: var(--radius-sm); padding: 14px; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 6px;">
          <div style="font-size: 0.9rem; font-weight: bold; color: var(--gold); display: flex; align-items: center; gap: 8px;">
            <span>📹 STATION 2: CAMERA FEED 04 CALIBRATION</span>
            ${s2Solved ? '<span style="color: var(--ok); font-size: 0.78rem; background: rgba(34, 197, 94, 0.15); padding: 2px 8px; border-radius: 4px;">VERIFIED ✅</span>' : ''}
          </div>
          <span style="font-size: 0.78rem; color: var(--muted);">Token 2 of 3</span>
        </div>
        <p style="font-size: 0.84rem; color: var(--muted); margin: 0 0 10px 0; line-height: 1.45;">
          The camera feed from Sector 4 is extremely underexposed. Adjust the <strong>Brightness Slider</strong> below to reveal the hidden security digit.
        </p>

        <!-- Camera Monitor Screen -->
        <div style="background: #000; border: 2px solid #1e293b; border-radius: 6px; padding: 16px; position: relative; overflow: hidden; margin-bottom: 10px; min-height: 130px; display: flex; align-items: center; justify-content: center; box-shadow: inset 0 0 30px rgba(0,0,0,0.9);">
          <div style="position: absolute; top: 8px; left: 10px; font-family: var(--font-mono); font-size: 0.72rem; color: #ef4444; display: flex; align-items: center; gap: 6px;">
            <span style="width: 8px; height: 8px; border-radius: 50%; background: #ef4444; animation: pulse 1s infinite;"></span>
            <span>CAM-04 · LIVE</span>
          </div>
          <div style="position: absolute; top: 8px; right: 10px; font-family: var(--font-mono); font-size: 0.72rem; color: #64748b;">
            ISO 3200 · EV -4.0
          </div>
          <!-- Hidden Digit Display that illuminates with slider -->
          <div id="station2-monitor-screen" style="text-align: center; user-select: none;">
            <div id="station2-digit-val" style="font-family: var(--font-display); font-size: 4rem; font-weight: 900; color: #022c22; opacity: 0.08; filter: blur(2px); transition: all 0.15s ease;">
              ${escapeHtml(targetDigit)}
            </div>
            <div id="station2-cam-hint" style="font-size: 0.72rem; font-family: var(--font-mono); color: #334155;">
              [FEED DARK · BOOST SENSOR GAIN]
            </div>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 10px; background: rgba(15, 23, 42, 0.7); padding: 8px 12px; border-radius: 4px; border: 1px solid #1e293b;">
          <span style="font-size: 0.8rem; color: var(--gold); font-weight: bold; white-space: nowrap;">☀️ Brightness:</span>
          <input type="range" id="station-brightness-slider" min="0" max="100" value="5" style="flex: 1; accent-color: var(--accent); cursor: pointer;" />
          <span id="brightness-val-label" style="font-family: var(--font-mono); font-size: 0.82rem; color: var(--accent); min-width: 40px; text-align: right;">5%</span>
        </div>

        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <input type="text" id="station2-input" class="input-control" placeholder="Enter the revealed digit (0-9)" style="max-width: 280px; font-family: var(--font-mono); font-size: 0.85rem;" ${s2Solved ? 'disabled value="VERIFIED"' : ''} />
          <button type="button" id="btn-check-station-2" class="btn btn-primary btn-sm" ${s2Solved ? 'disabled' : ''}>Check Station 2</button>
          <div id="st2-feedback" class="feedback-line" style="margin: 0; font-size: 0.82rem;"></div>
        </div>
      </div>

      <!-- Station 3: Symbol Keypad & Legend -->
      <div class="station-card" id="station-card-3" style="background: #020612; border: 1px solid ${s3Solved ? 'var(--ok)' : 'var(--line)'}; border-radius: var(--radius-sm); padding: 14px; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 6px;">
          <div style="font-size: 0.9rem; font-weight: bold; color: var(--gold); display: flex; align-items: center; gap: 8px;">
            <span>🔣 STATION 3: SYMBOL KEYPAD &amp; GLYPH MATCHER</span>
            ${s3Solved ? '<span style="color: var(--ok); font-size: 0.78rem; background: rgba(34, 197, 94, 0.15); padding: 2px 8px; border-radius: 4px;">VERIFIED ✅</span>' : ''}
          </div>
          <span style="font-size: 0.78rem; color: var(--muted);">Token 3 of 3</span>
        </div>
        <p style="font-size: 0.84rem; color: var(--muted); margin: 0 0 10px 0; line-height: 1.45;">
          The control panel beacon is flashing an active security symbol. Match the glowing symbol against the <strong>Symbol Legend</strong> to extract its designated letter.
        </p>

        <!-- Active Glowing Glyph Display -->
        <div style="display: flex; justify-content: center; align-items: center; gap: 14px; background: rgba(15, 23, 42, 0.8); border: 1px solid #1e293b; border-radius: 6px; padding: 14px; margin-bottom: 12px;">
          <div style="text-align: center;">
            <div style="font-size: 0.72rem; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); margin-bottom: 6px;">ACTIVE SECURITY GLYPH</div>
            <div style="display: inline-flex; align-items: center; justify-content: center; width: 60px; height: 60px; border-radius: 8px; background: #01040a; border: 2px solid var(--accent); box-shadow: 0 0 20px rgba(56, 189, 248, 0.4); color: var(--accent);">
              <svg width="34" height="34" viewBox="0 0 24 24" style="filter: drop-shadow(0 0 6px var(--accent));">
                ${svgShapes[symbolKey] || svgShapes.triangle}
              </svg>
            </div>
          </div>
        </div>

        <!-- 8-Symbol Legend Grid -->
        <div style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; color: var(--gold); font-weight: bold; margin-bottom: 6px;">
          Symbol Reference Legend (Click to Select):
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(75px, 1fr)); gap: 6px; margin-bottom: 12px;">
          ${legendItems.map(item => `
            <div class="symbol-legend-item" data-char="${item.char}" style="background: #01040a; border: 1px solid #1e293b; border-radius: 4px; padding: 6px 4px; text-align: center; cursor: pointer; transition: all 0.15s ease;" title="${item.name} ➔ ${item.char}">
              <div style="display: flex; justify-content: center; color: var(--muted); margin-bottom: 3px;">
                <svg width="20" height="20" viewBox="0 0 24 24">${item.shape}</svg>
              </div>
              <div style="font-family: var(--font-mono); font-weight: bold; font-size: 0.85rem; color: var(--gold);">${item.char}</div>
            </div>
          `).join('')}
        </div>

        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
          <input type="text" id="station3-input" class="input-control" placeholder="Enter symbol letter (e.g. X)" style="max-width: 280px; font-family: var(--font-mono); font-size: 0.85rem;" ${s3Solved ? 'disabled value="VERIFIED"' : ''} />
          <button type="button" id="btn-check-station-3" class="btn btn-primary btn-sm" ${s3Solved ? 'disabled' : ''}>Check Station 3</button>
          <div id="st3-feedback" class="feedback-line" style="margin: 0; font-size: 0.82rem;"></div>
        </div>
      </div>

      <div style="background: rgba(3, 8, 20, 0.8); border: 1px dashed var(--line); border-radius: var(--radius-sm); padding: 12px; font-size: 0.88rem; color: var(--muted);">
        ✍️ After solving Station 1, 2, and 3, join the 3 characters in order (Station 1 + 2 + 3) to assemble Fragment 4, and submit below!
      </div>
    `;
  } else if (stage === 5) {
    const hexMatrix = content.matrix || [
      ['48', '1A', '3F', '7C'],
      ['45', '9B', '02', 'E1'],
      ['58', '88', 'D4', '5A'],
      ['38', 'FF', '11', '6E'],
      ['32', 'CC', '4A', 'B9'],
      ['44', '00', '8F', '23']
    ];
    const hexStream = content.hexStream || '48 45 58 38 32 44';
    const channels = ['A', 'B', 'C', 'D', 'E', 'F'];

    specificHtml = `
      <div style="background: rgba(15, 23, 42, 0.75); border: 1px solid rgba(168, 85, 247, 0.35); border-radius: var(--radius-sm); padding: 14px; margin-bottom: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 6px;">
          <span style="font-weight: 700; color: #c084fc; font-size: 1rem; display: flex; align-items: center; gap: 8px;">
            🔢 CENTRAL MEMORY BUS &amp; HEXADECIMAL CORE
          </span>
          <span style="background: rgba(168, 85, 247, 0.15); border: 1px solid #c084fc; color: #c084fc; font-size: 0.78rem; font-weight: bold; padding: 2px 8px; border-radius: 4px; font-family: var(--font-mono);">
            MEMORY BUS: ACTIVE
          </span>
        </div>
        <p style="margin: 0; color: var(--muted); font-size: 0.88rem; line-height: 1.5;">
          The firewall breach has unlocked the mainframe's hexadecimal core memory bus. Solve the memory vector line to extract the raw hexadecimal stream, then decode the hex bytes into ASCII text to reveal Fragment 5.
        </p>
      </div>

      <!-- Hex Memory Matrix Grid -->
      <div style="background: #020612; border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 14px; margin-bottom: 14px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 6px;">
          <div style="font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px; color: var(--gold); font-weight: 700;">
            ⚡ 6x4 Hexadecimal Memory Registers:
          </div>
          <button type="button" id="btn-read-bus" class="btn btn-primary btn-sm" style="font-size: 0.78rem; padding: 4px 10px;">⚡ Read Active Bus Line (Col 1)</button>
        </div>

        <p style="font-size: 0.82rem; color: var(--muted); margin: 0 0 10px 0;">
          Vector Clue: The high-voltage memory line is located along <strong>Column 1</strong> across Channels A through F.
        </p>

        <div style="overflow-x: auto;">
          <table id="hex-memory-grid" style="width: 100%; border-collapse: collapse; font-family: var(--font-mono); font-size: 0.9rem; text-align: center;">
            <thead>
              <tr style="border-bottom: 1px solid #334155; color: var(--muted); font-size: 0.75rem;">
                <th style="padding: 6px;">CH</th>
                <th style="padding: 6px; color: var(--accent);">COL 1 [BUS]</th>
                <th style="padding: 6px;">COL 2</th>
                <th style="padding: 6px;">COL 3</th>
                <th style="padding: 6px;">COL 4</th>
              </tr>
            </thead>
            <tbody>
              ${hexMatrix.map((row, idx) => `
                <tr style="border-bottom: 1px solid rgba(51, 65, 85, 0.4);">
                  <td style="color: var(--muted); font-weight: bold; padding: 6px;">${channels[idx] || (idx + 1)}</td>
                  <td class="hex-cell active-col" style="padding: 6px; background: rgba(56, 189, 248, 0.12); color: var(--accent); font-weight: bold; border-radius: 4px;">${escapeHtml(row[0] || '')}</td>
                  <td style="padding: 6px; color: #64748b;">${escapeHtml(row[1] || '')}</td>
                  <td style="padding: 6px; color: #64748b;">${escapeHtml(row[2] || '')}</td>
                  <td style="padding: 6px; color: #64748b;">${escapeHtml(row[3] || '')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Hex Stream Buffer & Decoder Workbench -->
      <div class="toolkit-box">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 6px;">
          <h3 style="font-size: 0.95rem; color: #c084fc; margin: 0;">🧰 Hexadecimal ASCII Decoder Workbench</h3>
          <button type="button" id="btn-load-stream" class="btn btn-outline btn-sm" style="font-size: 0.78rem; padding: 3px 8px;">📋 Paste Bus Stream</button>
        </div>
        <textarea id="hex-workbench-input" rows="2" placeholder="Paste or type hexadecimal bytes here (e.g. 48 45 58 38 32 44)..."></textarea>
        <div style="display: flex; gap: 8px; margin-top: 8px; align-items: center; flex-wrap: wrap;">
          <button type="button" id="btn-convert-hex" class="btn btn-gold btn-sm">Decode Hex to Text</button>
          <div id="hex-decode-output" style="font-family: var(--font-mono); font-size: 0.95rem; font-weight: bold; color: var(--ok); min-height: 24px; padding: 4px 8px;"></div>
        </div>
      </div>

      <p style="font-size: 0.9rem; color: var(--muted); margin-top: 10px;">
        ✍️ Decode the hexadecimal sequence and type the resulting fragment below.
      </p>
    `;
  } else if (stage === 6) {
    specificHtml = `
      <p style="margin-bottom: 10px;">
        📖 The story: This is it, the final lock! 🔐 Open your 📒 notebook and gather all 5 pieces. 🧩
      </p>
      <ol style="display: flex; flex-direction: column; gap: 8px; margin-left: 20px; font-size: 0.95rem; margin-bottom: 16px;">
        <li>1) 🔤 Put the pieces in alphabetical order of the mission NAMES: <strong>CTF Challenges</strong>, <strong>Decoding</strong>, <strong>Hex Decryption</strong>, <strong>Prompt the AI</strong>, and <strong>Signal Intercept</strong>.</li>
        <li>2) 🔁 The piece from Prompt the AI must be written backwards.</li>
        <li>3) ➖ Join them with dashes inside <code>FO{ … }</code>.</li>
        <li>4) ➕ Add up every digit (0–9) inside the braces and write it after a <code>#</code>.</li>
      </ol>
      <div style="background: rgba(3, 8, 19, 0.6); border: 1px solid var(--line); border-radius: var(--radius-sm); padding: 12px; margin-bottom: 14px; font-family: ui-monospace, monospace; font-size: 0.92rem; color: var(--accent);">
        Example shape: FO{AAA-BBB-CCC-DDD-EEE}#29<br/>
        <span style="color: var(--bad);">⚠️ Use only the real pieces from your notebook. Fake ones are traps! 🪤</span>
      </div>
    `;
  }

  const revealedHints = state.revealedHints || [];
  let hintsHtml = '';
  const now = Date.now();

  const hint1StorageKey = `fo_hint_expires_${team.id}_${stage}_1`;
  const hint1Exp = parseInt(sessionStorage.getItem(hint1StorageKey) || '0', 10);
  const hint1RemainingSec = Math.max(0, Math.ceil((hint1Exp - now) / 1000));

  if (revealedHints.length > 0) {
    hintsHtml = revealedHints.map((h, idx) => {
      const hintNum = idx + 1;
      const storageKey = `fo_hint_expires_${team.id}_${stage}_${hintNum}`;
      let expiresAt = parseInt(sessionStorage.getItem(storageKey) || '0', 10);

      // If hint was revealed on server, but no client timer exists yet:
      if (!expiresAt) {
        expiresAt = now + 30000;
        sessionStorage.setItem(storageKey, String(expiresAt));
      }

      const remainingMs = expiresAt - now;
      const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));

      if (remainingSec > 0) {
        return `
          <div class="hint-box active-timed-hint" id="hint-timed-card-${hintNum}" style="border: 2px solid var(--gold); background: rgba(245, 158, 11, 0.08); padding: 12px 14px; border-radius: var(--radius-sm); margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed rgba(245, 158, 11, 0.4); padding-bottom: 6px; margin-bottom: 8px; flex-wrap: wrap; gap: 4px;">
              <span style="font-weight: bold; color: var(--gold); font-size: 0.88rem; display: flex; align-items: center; gap: 6px;">
                💡 HINT ${hintNum} UNLOCKED
              </span>
              <span class="hint-timer-pill" id="hint-timer-pill-${hintNum}" style="background: rgba(239, 68, 68, 0.2); border: 1px solid var(--bad); color: #fca5a5; font-family: var(--font-mono); font-size: 0.82rem; font-weight: bold; padding: 2px 10px; border-radius: 12px; display: inline-flex; align-items: center; gap: 4px;">
                ⏱️ <span class="hint-sec-val" data-hint="${hintNum}">${remainingSec}</span>s remaining
              </span>
            </div>
            <div class="hint-body-text" style="font-size: 0.95rem; color: #fef3c7; line-height: 1.55;">
              ${escapeHtml(h)}
            </div>
          </div>
        `;
      } else {
        return `
          <div class="hint-box expired-hint" style="border: 1px solid var(--line); background: rgba(15, 23, 42, 0.6); padding: 10px 14px; border-radius: var(--radius-sm); color: var(--muted); margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">
              <span style="font-size: 0.85rem; font-weight: bold; color: var(--muted); display: flex; align-items: center; gap: 6px;">
                🔒 HINT ${hintNum} EXPIRED
              </span>
              <span style="font-size: 0.75rem; color: var(--bad); font-weight: bold; text-transform: uppercase;">30s Window Closed</span>
            </div>
            <p style="margin: 4px 0 0; font-size: 0.82rem; color: #64748b; font-style: italic;">
              The 30-second viewing period for this hint has elapsed. Hint content has been securely hidden. Penalty minutes remain applied.
            </p>
          </div>
        `;
      }
    }).join('');
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
          <div>
            <span style="font-size: 0.9rem; color: var(--muted);">Need a clue? Hints add penalty minutes.</span>
            <div style="font-size: 0.78rem; color: var(--gold); margin-top: 2px;">⏱️ Warning: Hints are displayed for <strong>30 seconds only</strong> before auto-hiding!</div>
          </div>
          <button id="btn-request-hint" class="btn btn-gold btn-sm" ${(hintDisabled || isPaused) ? 'disabled' : ''}>
            ${hintBtnText}
          </button>
        </div>
        <div id="hints-display-container" style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px;">
          ${hintsHtml}
        </div>

        ${stage === 1 ? (hintsUsed >= 1 ? (hint1RemainingSec > 0 ? `
        <!-- UNLOCKED 15-Alphabet Morse Chart (Only visible during 30s Hint 1 Window) -->
        <div class="stage1-hint-chart" style="margin-top: 14px; background: rgba(3, 8, 22, 0.9); border: 2px solid var(--gold); border-radius: var(--radius-sm); padding: 14px 16px; animation: fadeIn 0.3s ease;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; flex-wrap: wrap; gap: 6px;">
            <div style="font-weight: bold; font-size: 0.92rem; color: var(--gold); display: flex; align-items: center; gap: 6px;">
              <span>🔓 UNLOCKED HINT: Morse Code Decoder Chart (15 Alphabets)</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="background: rgba(239, 68, 68, 0.2); border: 1px solid var(--bad); color: #fca5a5; font-family: var(--font-mono); font-size: 0.8rem; font-weight: bold; padding: 2px 8px; border-radius: 10px;">
                ⏱️ <span class="hint-sec-val" data-hint="1">${hint1RemainingSec}</span>s remaining
              </span>
              <span style="font-size: 0.78rem; color: var(--accent);">(Click any letter to insert into answer)</span>
            </div>
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
        <!-- EXPIRED Morse Chart Notice -->
        <div class="hint-box expired-hint" style="margin-top: 14px; border: 1px solid var(--line); background: rgba(15, 23, 42, 0.6); padding: 10px 14px; border-radius: var(--radius-sm); color: var(--muted);">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 0.85rem; font-weight: bold; color: var(--muted); display: flex; align-items: center; gap: 6px;">
              🔒 MORSE CODE CHART AUTO-LOCKED
            </span>
            <span style="font-size: 0.75rem; color: var(--bad); font-weight: bold; text-transform: uppercase;">30s Window Closed</span>
          </div>
          <p style="margin: 4px 0 0; font-size: 0.82rem; color: #64748b; font-style: italic;">
            The 30-second viewing period for Hint 1 has elapsed. The Morse decoder chart has been automatically hidden.
          </p>
        </div>
        `) : `
        <!-- Locked Hint Notice -->
        <div style="margin-top: 12px; background: rgba(3, 8, 22, 0.4); border: 1px dashed #334155; border-radius: var(--radius-sm); padding: 12px 14px; text-align: center;">
          <span style="font-size: 0.86rem; color: var(--muted);">
            🔒 <strong>Morse Code Chart is locked.</strong> Don't know Morse code? Click <strong>"💡 Hint (+3 min)"</strong> above to unlock the 15-alphabet decoder chart! (30-second viewing window applies).
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

  // 30-Second Hint Countdown Ticker
  if (hintTickerInterval) {
    clearInterval(hintTickerInterval);
    hintTickerInterval = null;
  }
  const badgeEls = document.querySelectorAll('.hint-sec-val');
  if (badgeEls && badgeEls.length > 0) {
    hintTickerInterval = setInterval(() => {
      let anyActive = false;
      badgeEls.forEach(el => {
        const cur = parseInt(el.textContent, 10);
        if (cur > 1) {
          el.textContent = cur - 1;
          anyActive = true;
        } else if (cur === 1) {
          el.textContent = '0';
          const hintId = el.getAttribute('data-hint');
          // Smoothly update the expired hint in-place without triggering a destructive full re-render
          const card = document.getElementById(`hint-timed-card-${hintId}`);
          if (card) {
            card.className = 'hint-box expired-hint';
            card.style.borderColor = 'var(--line)';
            card.style.background = 'rgba(15, 23, 42, 0.6)';
            card.innerHTML = `
              <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 4px;">
                <span style="font-size: 0.85rem; font-weight: bold; color: var(--muted); display: flex; align-items: center; gap: 6px;">
                  🔒 HINT ${hintId} EXPIRED
                </span>
                <span style="font-size: 0.75rem; color: var(--bad); font-weight: bold; text-transform: uppercase;">30s Window Closed</span>
              </div>
              <p style="margin: 4px 0 0; font-size: 0.82rem; color: #64748b; font-style: italic;">
                The 30-second viewing period for this hint has elapsed. Hint content has been securely hidden. Penalty minutes remain applied.
              </p>
            `;
          }
          // Remove Stage 1 Morse decoder chart when Hint 1 expires
          const morseChart = document.querySelector('.stage1-hint-chart');
          if (morseChart && hintId === '1') {
            morseChart.remove();
          }
        }
      });
      if (!anyActive) {
        clearInterval(hintTickerInterval);
        hintTickerInterval = null;
      }
    }, 1000);
  }

  const hintBtn = document.getElementById('btn-request-hint');
  if (hintBtn) {
    hintBtn.addEventListener('click', async () => {
      if (!confirm('Unlock hint? Penalty will be added to your score and the hint will be visible for 30 SECONDS ONLY before auto-hiding.')) {
        return;
      }
      hintBtn.disabled = true;
      hintBtn.textContent = 'Unlocking...';
      try {
        const res = await fetch('/api/hint', { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
          const tId = (gameState && gameState.team && gameState.team.id) || 'team';
          sessionStorage.setItem(`fo_hint_expires_${tId}_${stage}_${data.hintsUsed}`, String(Date.now() + 30000));
          showToast(`💡 Hint ${data.hintsUsed} unlocked! You have 30 seconds to view it before it hides.`);
          renderApp();
        } else {
          alert(data.error || 'Could not fetch hint.');
          renderApp();
        }
      } catch {
        alert('Server connection error.');
        renderApp();
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
    const s1Btn = document.getElementById('btn-check-station-1');
    const s1Input = document.getElementById('station1-input');
    const s1Fb = document.getElementById('st1-feedback');

    const s2Slider = document.getElementById('station-brightness-slider');
    const s2Label = document.getElementById('brightness-val-label');
    const s2DigitEl = document.getElementById('station2-digit-val');
    const s2CamHint = document.getElementById('station2-cam-hint');
    const s2Btn = document.getElementById('btn-check-station-2');
    const s2Input = document.getElementById('station2-input');
    const s2Fb = document.getElementById('st2-feedback');

    const s3Btn = document.getElementById('btn-check-station-3');
    const s3Input = document.getElementById('station3-input');
    const s3Fb = document.getElementById('st3-feedback');
    const legendItems = document.querySelectorAll('.symbol-legend-item');

    // Keep track of verified tokens in memory
    const stationTokens = { 1: '', 2: '', 3: '' };

    function checkAllStationsDone() {
      if (stationTokens[1] && stationTokens[2] && stationTokens[3]) {
        const fullToken = stationTokens[1] + stationTokens[2] + stationTokens[3];
        const ansInput = document.getElementById('stage-answer-input');
        if (ansInput) {
          ansInput.value = fullToken;
          ansInput.focus();
        }
        showToast(`🎉 All 3 Stations verified! Fragment ${fullToken} assembled.`);
      }
    }

    async function checkStation(stationNum, val, inputEl, btnEl, fbEl, cardId, badgeId) {
      const v = (val || '').trim();
      if (!v) {
        if (fbEl) { fbEl.className = 'feedback-line error'; fbEl.textContent = 'Please enter a value.'; }
        return;
      }
      if (btnEl) btnEl.disabled = true;
      if (fbEl) { fbEl.className = 'feedback-line'; fbEl.textContent = 'Checking...'; }

      try {
        const res = await fetch('/api/stage4/check-station', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ station: stationNum, value: v })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          if (fbEl) { fbEl.className = 'feedback-line ok'; fbEl.textContent = 'Verified! ✅'; }
          if (inputEl) { inputEl.disabled = true; inputEl.value = 'VERIFIED'; }
          const card = document.getElementById(cardId);
          if (card) card.style.borderColor = 'var(--ok)';
          const badge = document.getElementById(badgeId);
          if (badge) {
            badge.style.background = 'rgba(34, 197, 94, 0.2)';
            badge.style.color = 'var(--ok)';
            badge.style.borderColor = 'var(--ok)';
            badge.textContent = `Station ${stationNum}: ✓`;
          }
          const counter = document.getElementById('stations-solved-counter');
          if (counter && data.solvedStations) counter.textContent = data.solvedStations.length;

          let tokenChar = v.toUpperCase();
          if (stationNum === 1 && tokenChar.startsWith('L')) tokenChar = tokenChar.slice(1);
          stationTokens[stationNum] = tokenChar;

          checkAllStationsDone();
        } else {
          if (fbEl) {
            fbEl.className = 'feedback-line error';
            fbEl.textContent = data.message || 'Incorrect station value.';
          }
          if (btnEl) btnEl.disabled = false;
        }
      } catch (err) {
        if (fbEl) { fbEl.className = 'feedback-line error'; fbEl.textContent = 'Verification error.'; }
        if (btnEl) btnEl.disabled = false;
      }
    }

    if (s1Btn && s1Input) {
      s1Btn.addEventListener('click', () => checkStation(1, s1Input.value, s1Input, s1Btn, s1Fb, 'station-card-1', 'badge-st1'));
      s1Input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          checkStation(1, s1Input.value, s1Input, s1Btn, s1Fb, 'station-card-1', 'badge-st1');
        }
      });
    }

    // Slider for Station 2 Camera Feed
    if (s2Slider && s2DigitEl && s2Label) {
      s2Slider.addEventListener('input', () => {
        const val = parseInt(s2Slider.value, 10);
        s2Label.textContent = `${val}%`;
        if (val < 15) {
          s2DigitEl.style.opacity = '0.08';
          s2DigitEl.style.color = '#022c22';
          s2DigitEl.style.filter = 'blur(2px)';
          if (s2CamHint) s2CamHint.textContent = '[FEED DARK · BOOST SENSOR GAIN]';
        } else if (val < 50) {
          const norm = (val - 15) / 35;
          s2DigitEl.style.opacity = String(0.1 + norm * 0.4);
          s2DigitEl.style.color = '#15803d';
          s2DigitEl.style.filter = 'blur(1px)';
          if (s2CamHint) s2CamHint.textContent = '[EXPOSURE RISING · ADJUST FURTHER]';
        } else {
          s2DigitEl.style.opacity = '1';
          s2DigitEl.style.color = '#22c55e';
          s2DigitEl.style.filter = 'drop-shadow(0 0 12px #22c55e)';
          if (s2CamHint) s2CamHint.textContent = 'REC [LIVE] · DIGIT CLEAR';
        }
      });
    }

    if (s2Btn && s2Input) {
      s2Btn.addEventListener('click', () => checkStation(2, s2Input.value, s2Input, s2Btn, s2Fb, 'station-card-2', 'badge-st2'));
      s2Input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          checkStation(2, s2Input.value, s2Input, s2Btn, s2Fb, 'station-card-2', 'badge-st2');
        }
      });
    }

    // Station 3 Symbol Legend selection
    legendItems.forEach(item => {
      item.addEventListener('click', () => {
        const char = item.getAttribute('data-char');
        if (s3Input && !s3Input.disabled) {
          s3Input.value = char;
          s3Input.focus();
        }
      });
    });

    if (s3Btn && s3Input) {
      s3Btn.addEventListener('click', () => checkStation(3, s3Input.value, s3Input, s3Btn, s3Fb, 'station-card-3', 'badge-st3'));
      s3Input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          checkStation(3, s3Input.value, s3Input, s3Btn, s3Fb, 'station-card-3', 'badge-st3');
        }
      });
    }
  }

  if (stage === 5) {
    const readBusBtn = document.getElementById('btn-read-bus');
    const loadStreamBtn = document.getElementById('btn-load-stream');
    const hexInput = document.getElementById('hex-workbench-input');
    const convertBtn = document.getElementById('btn-convert-hex');
    const hexOutput = document.getElementById('hex-decode-output');

    const stream = (content && content.hexStream) ? content.hexStream : '48 45 58 38 32 44';

    function loadBusStream() {
      if (hexInput) hexInput.value = stream;
      const activeCells = document.querySelectorAll('.hex-cell.active-col');
      activeCells.forEach(cell => {
        cell.style.background = 'rgba(168, 85, 247, 0.35)';
        cell.style.color = '#c084fc';
        setTimeout(() => {
          cell.style.background = 'rgba(56, 189, 248, 0.12)';
          cell.style.color = 'var(--accent)';
        }, 1200);
      });
    }

    if (readBusBtn) readBusBtn.addEventListener('click', loadBusStream);
    if (loadStreamBtn) loadStreamBtn.addEventListener('click', loadBusStream);

    if (convertBtn && hexInput && hexOutput) {
      convertBtn.addEventListener('click', () => {
        const raw = hexInput.value.trim().replace(/0x/g, '').replace(/[\s,]+/g, ' ');
        if (!raw) {
          hexOutput.textContent = 'Please enter or paste hex bytes.';
          hexOutput.style.color = 'var(--bad)';
          return;
        }
        try {
          const bytes = raw.split(' ').filter(b => b.length > 0);
          let decoded = '';
          for (const b of bytes) {
            decoded += String.fromCharCode(parseInt(b, 16));
          }
          hexOutput.style.color = 'var(--ok)';
          hexOutput.innerHTML = `Decoded Plaintext: <strong style="color: var(--gold);">${escapeHtml(decoded)}</strong> (Auto-filled below!)`;
          const ansInput = document.getElementById('stage-answer-input');
          if (ansInput) ansInput.value = decoded;
        } catch (_) {
          hexOutput.textContent = 'Invalid hexadecimal string format.';
          hexOutput.style.color = 'var(--bad)';
        }
      });
    }
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
          <!-- 4 Question Sets (Set A, B, C, D) Reference -->
          <div style="font-size: 0.95rem; font-weight: bold; color: var(--gold); margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <span>📚 4 Balanced Question Sets (A, B, C, D) Master Overview:</span>
            <span style="font-size: 0.8rem; color: var(--muted); font-weight: normal;">Each set features distinct Morse, Shuffled Cryptographic Sequences, CTF Nodes, Hex Buses & Formulas.</span>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; margin-bottom: 20px;">
            <div class="answer-key-box" style="border-left: 4px solid var(--accent); background: rgba(3, 8, 22, 0.75);">
              <h4 style="color: var(--accent); display: flex; justify-content: space-between; align-items: center;">
                <span>⭐ Set A — Cosmic Vault</span>
                <span class="badge" style="font-size: 0.7rem; background: rgba(56, 189, 248, 0.2); color: var(--accent);">Teams 01–06</span>
              </h4>
              <div style="font-size: 0.78rem; color: var(--muted); margin: 4px 0 8px; line-height: 1.4; border-bottom: 1px dashed var(--line); padding-bottom: 4px;">
                <strong>Squads:</strong> Trinetra, BugBusters, Trio_Byte, Bhai, Cipher, Jupiter
              </div>
              <div style="font-size: 0.8rem; line-height: 1.6;">
                <div>S1 (Morse): <span class="solution-token">NOVA</span> <span style="font-size: 0.7rem; color: var(--muted);">(Decoy: ZETA9)</span></div>
                <div>S2 (Sequence): <span class="badge" style="font-size: 0.7rem; color: var(--gold); border: 1px solid rgba(245, 158, 11, 0.4);">Base64 ➔ Hex ➔ ROT13</span></div>
                <div>S2 (Decoded): <span class="solution-token">7K2</span> | Phrase: <strong style="color:var(--ok);">AURORA</strong></div>
                <div>S3 (AI Guardian): <span class="solution-token">ORBIT</span> <span style="font-size: 0.7rem; color: var(--muted);">(Decoy: ZETA9)</span></div>
                <div>S4 (CTF Nodes): <span class="solution-token">91X</span> (L9=9 | Opt=1 | Tri=X)</div>
                <div>S5 (Hex Bus): <span class="solution-token">HEX82D</span> (48 45 58 38 32 44)</div>
                <div>S6 (Final Key): <span class="solution-token" style="color: #34d399; font-size: 0.72rem; word-break: break-all;">FO{91X-7K2-HEX82D-TIBRO-NOVA}#29</span></div>
              </div>
            </div>
            
            <div class="answer-key-box" style="border-left: 4px solid var(--gold); background: rgba(3, 8, 22, 0.75);">
              <h4 style="color: var(--gold); display: flex; justify-content: space-between; align-items: center;">
                <span>🌟 Set B — Cyber Nexus</span>
                <span class="badge" style="font-size: 0.7rem; background: rgba(245, 158, 11, 0.2); color: var(--gold);">Teams 07–12</span>
              </h4>
              <div style="font-size: 0.78rem; color: var(--muted); margin: 4px 0 8px; line-height: 1.4; border-bottom: 1px dashed var(--line); padding-bottom: 4px;">
                <strong>Squads:</strong> Aèsir’s, OneStop, Awake, Init, SyntaxAndHre?, Fab-4
              </div>
              <div style="font-size: 0.8rem; line-height: 1.6;">
                <div>S1 (Morse): <span class="solution-token">LUNA</span> <span style="font-size: 0.7rem; color: var(--muted);">(Decoy: ZETA9)</span></div>
                <div>S2 (Sequence): <span class="badge" style="font-size: 0.7rem; color: var(--gold); border: 1px solid rgba(245, 158, 11, 0.4);">Hex ➔ Base64 ➔ ROT13</span></div>
                <div>S2 (Decoded): <span class="solution-token">4M9</span> | Phrase: <strong style="color:var(--ok);">CYPHER</strong></div>
                <div>S3 (AI Guardian): <span class="solution-token">SOLAR</span> <span style="font-size: 0.7rem; color: var(--muted);">(Decoy: ZETA9)</span></div>
                <div>S4 (CTF Nodes): <span class="solution-token">84Z</span> (L8=8 | Opt=4 | Hex=Z)</div>
                <div>S5 (Hex Bus): <span class="solution-token">CORE7F</span> (43 4F 52 45 37 46)</div>
                <div>S6 (Final Key): <span class="solution-token" style="color: #34d399; font-size: 0.72rem; word-break: break-all;">FO{84Z-4M9-CORE7F-RALOS-LUNA}#32</span></div>
              </div>
            </div>

            <div class="answer-key-box" style="border-left: 4px solid #a855f7; background: rgba(3, 8, 22, 0.75);">
              <h4 style="color: #c084fc; display: flex; justify-content: space-between; align-items: center;">
                <span>🌌 Set C — Quantum Matrix</span>
                <span class="badge" style="font-size: 0.7rem; background: rgba(168, 85, 247, 0.2); color: #c084fc);">Teams 13–18</span>
              </h4>
              <div style="font-size: 0.78rem; color: var(--muted); margin: 4px 0 8px; line-height: 1.4; border-bottom: 1px dashed var(--line); padding-bottom: 4px;">
                <strong>Squads:</strong> TheDynamos, Codex, A³, Huntrix, Nexora, TechTitans
              </div>
              <div style="font-size: 0.8rem; line-height: 1.6;">
                <div>S1 (Morse): <span class="solution-token">VEGA</span> <span style="font-size: 0.7rem; color: var(--muted);">(Decoy: ZETA9)</span></div>
                <div>S2 (Sequence): <span class="badge" style="font-size: 0.7rem; color: var(--gold); border: 1px solid rgba(245, 158, 11, 0.4);">ROT13 ➔ Hex ➔ Base64</span></div>
                <div>S2 (Decoded): <span class="solution-token">3X8</span> | Phrase: <strong style="color:var(--ok);">VORTEX</strong></div>
                <div>S3 (AI Guardian): <span class="solution-token">TITAN</span> <span style="font-size: 0.7rem; color: var(--muted);">(Decoy: ZETA9)</span></div>
                <div>S4 (CTF Nodes): <span class="solution-token">72Y</span> (L7=7 | Opt=2 | Cross=Y)</div>
                <div>S5 (Hex Bus): <span class="solution-token">BYTE9A</span> (42 59 54 45 39 41)</div>
                <div>S6 (Final Key): <span class="solution-token" style="color: #34d399; font-size: 0.72rem; word-break: break-all;">FO{72Y-3X8-BYTE9A-NATIT-VEGA}#29</span></div>
              </div>
            </div>

            <div class="answer-key-box" style="border-left: 4px solid #ec4899; background: rgba(3, 8, 22, 0.75);">
              <h4 style="color: #f472b6; display: flex; justify-content: space-between; align-items: center;">
                <span>🪐 Set D — Stellar Bastion</span>
                <span class="badge" style="font-size: 0.7rem; background: rgba(236, 72, 153, 0.2); color: #f472b6);">Teams 19–23</span>
              </h4>
              <div style="font-size: 0.78rem; color: var(--muted); margin: 4px 0 8px; line-height: 1.4; border-bottom: 1px dashed var(--line); padding-bottom: 4px;">
                <strong>Squads:</strong> TheCosmos, ThirdEye, LapLegends, UpsideDowners, Beginners
              </div>
              <div style="font-size: 0.8rem; line-height: 1.6;">
                <div>S1 (Morse): <span class="solution-token">MARS</span> <span style="font-size: 0.7rem; color: var(--muted);">(Decoy: ZETA9)</span></div>
                <div>S2 (Sequence): <span class="badge" style="font-size: 0.7rem; color: var(--gold); border: 1px solid rgba(245, 158, 11, 0.4);">Base64 ➔ ROT13 ➔ Hex</span></div>
                <div>S2 (Decoded): <span class="solution-token">5P3</span> | Phrase: <strong style="color:var(--ok);">NEBULA</strong></div>
                <div>S3 (AI Guardian): <span class="solution-token">ZENITH</span> <span style="font-size: 0.7rem; color: var(--muted);">(Decoy: ZETA9)</span></div>
                <div>S4 (CTF Nodes): <span class="solution-token">63K</span> (L6=6 | Opt=3 | Sqr=K)</div>
                <div>S5 (Hex Bus): <span class="solution-token">BITS1E</span> (42 49 54 53 31 45)</div>
                <div>S6 (Final Key): <span class="solution-token" style="color: #34d399; font-size: 0.72rem; word-break: break-all;">FO{63K-5P3-BITS1E-HTINEZ-MARS}#18</span></div>
              </div>
            </div>
          </div>

          <!-- Squad Questions & Solution Inspector Tool -->
          <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid var(--accent); border-radius: var(--radius-sm); padding: 14px; margin-bottom: 18px;">
            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;">
              <span style="font-size: 0.95rem; font-weight: bold; color: var(--accent); display: flex; align-items: center; gap: 6px;">
                🔍 Squad Question &amp; Solution Inspector:
              </span>
              <div style="display: flex; gap: 8px; align-items: center;">
                <input type="text" id="inspector-team-search" class="input-control" placeholder="Type squad name (e.g. Trinetra)..." style="font-size: 0.82rem; padding: 4px 10px; width: 220px;" />
                <button id="btn-inspect-clear" class="btn btn-outline btn-sm" style="font-size: 0.75rem; padding: 4px 8px;">Clear</button>
              </div>
            </div>
            <div id="inspector-result-card" style="font-size: 0.85rem; color: var(--muted); line-height: 1.5;">
              Type any squad name above to instantly inspect their assigned question set, cryptographic sequence, and full solutions breakdown.
            </div>
          </div>

          <!-- Dynamic Team Solutions Table -->
          <h4 style="color: var(--accent); font-size: 1rem; margin-bottom: 8px;">📋 Registered Squads Allotment &amp; Live Solutions:</h4>
          <div id="dynamic-answers-table" class="data-table-container">
            <p style="color: var(--muted); padding: 10px;">Loading solutions...</p>
          </div>
        </div>
      </div>

      <!-- Stage Hints Management & Live Editor Section -->
      <div style="margin-top: 32px; border-top: 1px solid var(--line); padding-top: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 10px;">
          <div>
            <h3 style="font-size: 1.25rem; color: var(--gold); display: flex; align-items: center; gap: 8px;">
              💡 Live Stage Hints Manager &amp; Editor (Per Question Set)
            </h3>
            <p style="font-size: 0.85rem; color: var(--muted); margin-top: 2px;">
              Each question set (A, B, C, D) maintains its own custom hints for Stages 1 to 6. Edit and save independently. (30s countdown applies to active players).
            </p>
          </div>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button id="btn-save-current-set-hints" class="btn btn-gold btn-sm">💾 Save Hints for Active Set</button>
            <button id="btn-reset-current-set-hints" class="btn btn-outline btn-sm">↺ Reset Active Set</button>
            <button id="btn-save-all-hints" class="btn btn-primary btn-sm" style="display: none;">💾 Save All</button>
            <button id="btn-reset-hints" class="btn btn-outline btn-sm" style="display: none;">↺ Reset All</button>
          </div>
        </div>

        <!-- 4 Set Selection Tabs -->
        <div style="display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap;" id="admin-hints-set-tabs">
          <button class="btn btn-outline btn-sm admin-hint-set-pill active" data-set="A" style="font-weight: 700;">⭐ Set A (Cosmic Vault)</button>
          <button class="btn btn-outline btn-sm admin-hint-set-pill" data-set="B" style="font-weight: 700;">🌟 Set B (Cyber Nexus)</button>
          <button class="btn btn-outline btn-sm admin-hint-set-pill" data-set="C" style="font-weight: 700;">🌌 Set C (Quantum Matrix)</button>
          <button class="btn btn-outline btn-sm admin-hint-set-pill" data-set="D" style="font-weight: 700;">🪐 Set D (Stellar Bastion)</button>
        </div>

        <div id="admin-hints-editor-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 14px;">
          <p style="color: var(--muted); padding: 12px;">Loading hints editor...</p>
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
      const sets = data.sets || {};
      const containerEl = document.getElementById('dynamic-answers-table');
      if (!containerEl) return;

      // Setup Inspector handler
      const inspectorInput = document.getElementById('inspector-team-search');
      const inspectorCard = document.getElementById('inspector-result-card');
      const inspectorClearBtn = document.getElementById('btn-inspect-clear');

      function inspectTeam(query) {
        if (!query || !query.trim()) {
          inspectorCard.innerHTML = 'Type any squad name above to instantly inspect their assigned question set, cryptographic sequence, and full solutions breakdown.';
          return;
        }
        const qClean = query.trim().toLowerCase();
        // Try match registered solutions first
        let matched = solutions.find(s => s.teamName.toLowerCase().includes(qClean));
        let setKey = 'A';
        let teamName = query.trim();

        if (matched) {
          setKey = matched.setKey || 'A';
          teamName = matched.teamName;
        } else if (data.teamSetMapping) {
          for (const [k, v] of Object.entries(data.teamSetMapping)) {
            if (k.toLowerCase().includes(qClean) || qClean.includes(k.toLowerCase())) {
              setKey = v;
              break;
            }
          }
        }

        const setObj = sets[setKey] || sets.A;
        const setColors = { A: '#38bdf8', B: '#f59e0b', C: '#c084fc', D: '#f472b6' };
        const color = setColors[setKey] || '#38bdf8';

        inspectorCard.innerHTML = `
          <div style="background: rgba(3, 8, 22, 0.95); border: 1px solid ${color}; border-radius: 6px; padding: 14px; margin-top: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 1px solid var(--line); padding-bottom: 8px; flex-wrap: wrap; gap: 6px;">
              <div>
                <span style="font-size: 1.15rem; font-weight: bold; color: #fff;">${escapeHtml(teamName)}</span>
                <span class="badge" style="background: rgba(15,23,42,0.9); border: 1px solid ${color}; color: ${color}; font-weight: bold; margin-left: 8px;">
                  Set ${escapeHtml(setKey)} — ${escapeHtml(setObj.setName)}
                </span>
              </div>
              <span style="font-size: 0.78rem; color: var(--gold); font-weight: 600;">Verified Challenge Matrix</span>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px; font-size: 0.82rem;">
              <div style="background: rgba(15,23,42,0.6); padding: 8px; border-radius: 4px; border: 1px solid var(--line);">
                <div style="font-weight: bold; color: var(--accent); margin-bottom: 3px;">Stage 1: Signal Intercept</div>
                <div>Morse Target: <span class="solution-token">${escapeHtml(setObj[1].answer)}</span></div>
                <div style="font-size: 0.72rem; color: var(--muted); margin-top: 2px;">Decoy Anomaly: ZETA9</div>
              </div>

              <div style="background: rgba(15,23,42,0.6); padding: 8px; border-radius: 4px; border: 1px solid var(--line);">
                <div style="font-weight: bold; color: var(--accent); margin-bottom: 3px;">Stage 2: Decoding</div>
                <div>Shuffled Sequence: <span style="color: var(--gold); font-weight: 700;">${escapeHtml(setObj[2].sequenceHint || '3-Layer Sequence')}</span></div>
                <div>Fragment: <span class="solution-token">${escapeHtml(setObj[2].answer)}</span> | Phrase: <strong style="color:var(--ok);">${escapeHtml(setObj[2].accessPhrase)}</strong></div>
              </div>

              <div style="background: rgba(15,23,42,0.6); padding: 8px; border-radius: 4px; border: 1px solid var(--line);">
                <div style="font-weight: bold; color: var(--accent); margin-bottom: 3px;">Stage 3: Prompt AI</div>
                <div>Required Phrase: <strong style="color:var(--ok);">${escapeHtml(setObj[3].accessPhrase)}</strong></div>
                <div>Secret Token: <span class="solution-token">${escapeHtml(setObj[3].answer)}</span></div>
              </div>

              <div style="background: rgba(15,23,42,0.6); padding: 8px; border-radius: 4px; border: 1px solid var(--line);">
                <div style="font-weight: bold; color: var(--accent); margin-bottom: 3px;">Stage 4: CTF Challenges</div>
                <div>Station 1 Log: <span class="solution-token">${escapeHtml(setObj[4].stations[1].answer)}</span></div>
                <div>Station 2 Optical: <span class="solution-token">${escapeHtml(setObj[4].stations[2].answer)}</span></div>
                <div>Station 3 Symbol: <span class="solution-token">${escapeHtml(setObj[4].stations[3].answer)}</span></div>
                <div style="margin-top: 2px;">Combined Code: <span class="solution-token" style="font-weight: bold;">${escapeHtml(setObj[4].answer)}</span></div>
              </div>

              <div style="background: rgba(15,23,42,0.6); padding: 8px; border-radius: 4px; border: 1px solid var(--line);">
                <div style="font-weight: bold; color: var(--accent); margin-bottom: 3px;">Stage 5: Hex Decryption</div>
                <div>Memory Bus: <code style="font-size: 0.72rem; color: var(--gold);">${escapeHtml(setObj[5].hexStream)}</code></div>
                <div>ASCII Fragment: <span class="solution-token">${escapeHtml(setObj[5].answer)}</span></div>
              </div>

              <div style="background: rgba(15,23,42,0.6); padding: 8px; border-radius: 4px; border: 1px solid var(--line);">
                <div style="font-weight: bold; color: var(--accent); margin-bottom: 3px;">Stage 6: Final Integration</div>
                <div style="font-size: 0.75rem; color: var(--muted); margin-bottom: 3px;">Mission Names Alphabetical Sort</div>
                <div style="word-break: break-all;"><span class="solution-token" style="color: #34d399; border-color: #34d399; font-size: 0.75rem;">${escapeHtml(setObj[6].formula)}</span></div>
              </div>
            </div>
          </div>
        `;
      }

      if (inspectorInput) {
        inspectorInput.oninput = () => inspectTeam(inspectorInput.value);
      }
      if (inspectorClearBtn) {
        inspectorClearBtn.onclick = () => {
          if (inspectorInput) inspectorInput.value = '';
          inspectTeam('');
        };
      }

      if (solutions.length === 0) {
        containerEl.innerHTML = '<p style="padding: 12px; color: var(--muted);">No teams registered yet.</p>';
        return;
      }

      let rows = solutions.map(t => {
        const setColors = { A: '#38bdf8', B: '#f59e0b', C: '#c084fc', D: '#f472b6' };
        const color = setColors[t.setKey] || '#38bdf8';
        return `
          <tr>
            <td><strong>${escapeHtml(t.teamName)}</strong></td>
            <td><span class="badge" style="background: rgba(15,23,42,0.85); border: 1px solid ${color}; color: ${color}; font-weight: bold;">Set ${escapeHtml(t.setKey || 'A')}</span></td>
            <td><span class="solution-token">${escapeHtml(t.stage1Answer || 'NOVA')}</span></td>
            <td>
              <span class="solution-token">${escapeHtml(t.stage2Answer || '7K2')}</span> 
              <span style="font-size: 0.72rem; color: var(--ok);">(${escapeHtml(t.stage2AccessPhrase || 'AURORA')})</span>
            </td>
            <td><span class="solution-token">${escapeHtml(t.stage3Answer || 'ORBIT')}</span></td>
            <td><span class="solution-token">${escapeHtml(t.stage4Answer || '91X')}</span></td>
            <td><span class="solution-token">${escapeHtml(t.stage5Code || 'HEX82D')}</span></td>
            <td><span class="solution-token" style="color: #34d399; border-color: #34d399; font-size: 0.75rem;">${escapeHtml(t.stage6Key)}</span></td>
            <td style="text-align: center;">
              <button class="btn btn-outline btn-sm btn-quick-inspect" data-name="${escapeHtml(t.teamName)}" style="padding: 2px 8px; font-size: 0.72rem;">🔍 Inspect</button>
            </td>
          </tr>
        `;
      }).join('');

      containerEl.innerHTML = `
        <table class="data-table" style="font-size: 0.85rem;">
          <thead>
            <tr>
              <th>Team</th>
              <th>Set</th>
              <th>Stage 1</th>
              <th>Stage 2 (Phrase)</th>
              <th>Stage 3</th>
              <th>Stage 4</th>
              <th>Stage 5</th>
              <th>Stage 6 Key</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      `;

      containerEl.querySelectorAll('.btn-quick-inspect').forEach(btn => {
        btn.onclick = () => {
          const name = btn.dataset.name;
          if (inspectorInput) inspectorInput.value = name;
          inspectTeam(name);
          inspectorCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        };
      });
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

  // Live Stage Hints Manager Logic (Per Question Set)
  let activeHintSet = 'A';
  let allSetsHintsCache = null;

  async function loadAdminHintsEditor(targetSet) {
    if (targetSet) activeHintSet = targetSet.toUpperCase();
    const grid = document.getElementById('admin-hints-editor-grid');
    if (!grid) return;
    try {
      if (!allSetsHintsCache) {
        const res = await fetch('/api/admin/hints', {
          headers: { 'x-admin-pin': adminPin }
        });
        if (!res.ok) return;
        const data = await res.json();
        allSetsHintsCache = data.allSets || {};
      }

      // Update active styling on set tabs
      document.querySelectorAll('.admin-hint-set-pill').forEach(pill => {
        if (pill.dataset.set === activeHintSet) {
          pill.classList.add('active');
          pill.style.background = 'var(--gold)';
          pill.style.color = '#000';
          pill.style.borderColor = 'var(--gold)';
        } else {
          pill.classList.remove('active');
          pill.style.background = 'transparent';
          pill.style.color = 'var(--txt-muted)';
          pill.style.borderColor = 'var(--line)';
        }
      });

      const setInfo = allSetsHintsCache[activeHintSet] || { setName: `Set ${activeHintSet}`, stages: {} };
      const stages = setInfo.stages || {};

      let html = '';
      for (let s = 1; s <= 6; s++) {
        const stageInfo = stages[s] || { name: `Stage ${s}`, icon: '🎯', hints: [] };
        const h1 = (stageInfo.hints && stageInfo.hints[0]) || '';
        const h2 = (stageInfo.hints && stageInfo.hints[1]) || '';
        html += `
          <div class="card" style="background: rgba(3, 8, 22, 0.75); border: 1px solid var(--line); padding: 14px; border-radius: var(--radius-sm);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; border-bottom: 1px solid var(--line); padding-bottom: 6px;">
              <span style="font-weight: bold; color: var(--accent); font-size: 0.95rem;">${stageInfo.icon} Stage ${s}: ${escapeHtml(stageInfo.name)}</span>
              <span style="font-size: 0.75rem; color: var(--gold); font-family: var(--font-mono); font-weight: bold;">⏱️ 30s Window (Set ${activeHintSet})</span>
            </div>
            
            <div style="margin-bottom: 10px;">
              <label style="font-size: 0.78rem; font-weight: bold; color: var(--gold); display: block; margin-bottom: 4px;">
                💡 HINT 1 (+3 min penalty):
              </label>
              <textarea id="admin-hint-${s}-1" class="input-control" rows="2" style="font-size: 0.85rem; width: 100%; resize: vertical;" placeholder="Enter Hint 1 text for Set ${activeHintSet}...">${escapeHtml(h1)}</textarea>
            </div>

            <div>
              <label style="font-size: 0.78rem; font-weight: bold; color: var(--accent); display: block; margin-bottom: 4px;">
                💡 HINT 2 (+5 min penalty):
              </label>
              <textarea id="admin-hint-${s}-2" class="input-control" rows="2" style="font-size: 0.85rem; width: 100%; resize: vertical;" placeholder="Enter Hint 2 text for Set ${activeHintSet}...">${escapeHtml(h2)}</textarea>
            </div>
          </div>
        `;
      }
      grid.innerHTML = html;
    } catch (err) {
      grid.innerHTML = '<p style="color: var(--bad); padding: 10px;">Failed to load stage hints.</p>';
    }
  }

  // Set Pills click listener
  document.querySelectorAll('.admin-hint-set-pill').forEach(pill => {
    pill.onclick = () => {
      loadAdminHintsEditor(pill.dataset.set);
    };
  });

  const saveCurrentSetBtn = document.getElementById('btn-save-current-set-hints');
  if (saveCurrentSetBtn) {
    saveCurrentSetBtn.onclick = async () => {
      saveCurrentSetBtn.disabled = true;
      saveCurrentSetBtn.textContent = 'Saving...';
      const hintsMap = {};
      for (let s = 1; s <= 6; s++) {
        const el1 = document.getElementById(`admin-hint-${s}-1`);
        const el2 = document.getElementById(`admin-hint-${s}-2`);
        const h1 = el1 ? el1.value.trim() : '';
        const h2 = el2 ? el2.value.trim() : '';
        hintsMap[s] = [h1, h2].filter(Boolean);
      }
      try {
        const res = await fetch('/api/admin/hints', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-pin': adminPin },
          body: JSON.stringify({ setKey: activeHintSet, hints: hintsMap })
        });
        const data = await res.json();
        if (res.ok) {
          showToast(`✅ Hints for Set ${activeHintSet} saved successfully! Active teams on Set ${activeHintSet} see them immediately.`);
          if (allSetsHintsCache && allSetsHintsCache[activeHintSet]) {
            for (let s = 1; s <= 6; s++) {
              if (allSetsHintsCache[activeHintSet].stages[s]) {
                allSetsHintsCache[activeHintSet].stages[s].hints = hintsMap[s];
              }
            }
          }
        } else {
          showToast(data.error || 'Failed to save hints.', 'error');
        }
      } catch {
        showToast('Connection error while saving hints.', 'error');
      } finally {
        saveCurrentSetBtn.disabled = false;
        saveCurrentSetBtn.textContent = '💾 Save Hints for Active Set';
      }
    };
  }

  const resetCurrentSetBtn = document.getElementById('btn-reset-current-set-hints');
  if (resetCurrentSetBtn) {
    resetCurrentSetBtn.onclick = async () => {
      if (!confirm(`Reset hints for Set ${activeHintSet} back to system defaults?`)) return;
      try {
        const res = await fetch('/api/admin/hints/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-pin': adminPin },
          body: JSON.stringify({ setKey: activeHintSet })
        });
        const data = await res.json();
        if (res.ok) {
          showToast(`↺ Set ${activeHintSet} hints reset to system defaults.`);
          allSetsHintsCache = data.allSets || null;
          loadAdminHintsEditor(activeHintSet);
        } else {
          showToast('Failed to reset hints.', 'error');
        }
      } catch {
        showToast('Connection error.', 'error');
      }
    };
  }

  const saveHintsBtn = document.getElementById('btn-save-all-hints');
  if (saveHintsBtn) {
    saveHintsBtn.onclick = async () => {
      if (saveCurrentSetBtn) saveCurrentSetBtn.click();
    };
  }

  const resetHintsBtn = document.getElementById('btn-reset-hints');
  if (resetHintsBtn) {
    resetHintsBtn.onclick = async () => {
      if (!confirm('Reset all stage hints across ALL sets back to system defaults?')) return;
      try {
        const res = await fetch('/api/admin/hints/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-admin-pin': adminPin }
        });
        if (res.ok) {
          showToast('↺ All stage hints across all sets reset to system defaults.');
          allSetsHintsCache = null;
          loadAdminHintsEditor(activeHintSet);
        } else {
          showToast('Failed to reset hints.', 'error');
        }
      } catch {
        showToast('Connection error.', 'error');
      }
    };
  }

  loadAdminHintsEditor();

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

            const setKey = t.set || 'A';
            const setColors = { A: '#38bdf8', B: '#f59e0b', C: '#c084fc', D: '#f472b6' };
            const setColor = setColors[setKey] || '#38bdf8';
            const setBadge = `<span class="badge" style="background: rgba(15,23,42,0.85); border: 1px solid ${setColor}; color: ${setColor}; font-weight: bold; font-size: 0.75rem;">Set ${escapeHtml(setKey)}</span>`;

            return `
              <tr>
                <td><strong>${escapeHtml(t.name)}</strong></td>
                <td>${setBadge}</td>
                <td><span style="color: var(--accent); font-weight: 600;">${escapeHtml(t.coordinator)}</span></td>
                <td>${statusBadge}</td>
                <td><span style="color: ${t.isFinished ? 'var(--ok)' : 'var(--txt)'}; font-weight: bold;">${t.isFinished ? '✅ Done' : t.stage + '/6'}</span></td>
                <td style="font-family: monospace; font-size: 1rem; color: var(--gold);">${t.formattedTime}</td>
                <td>+${t.penaltyMin}m</td>
                <td style="text-align: center;">${cheatBadge}</td>
                <td>
                  <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                    <button class="btn btn-outline btn-sm btn-team-inspect-set" data-name="${escapeHtml(t.name)}" title="Inspect assigned question set and solutions">🔍 Set</button>
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
                  <th>Set</th>
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

          // Set Inspect Button Listener
          tableEl.querySelectorAll('.btn-team-inspect-set').forEach(b => {
            b.onclick = () => {
              const name = b.dataset.name;
              const toggleBtn = document.getElementById('btn-toggle-answers');
              const panel = document.getElementById('admin-answers-panel');
              if (panel && panel.style.display === 'none') {
                if (toggleBtn) toggleBtn.click();
              }
              const inspInput = document.getElementById('inspector-team-search');
              if (inspInput) {
                inspInput.value = name;
                inspInput.dispatchEvent(new Event('input'));
              }
              const inspCard = document.getElementById('inspector-result-card');
              if (inspCard) {
                inspCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            };
          });

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
