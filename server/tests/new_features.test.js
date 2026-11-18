const assert = require('assert');
const path = require('path');
const fs = require('fs');
const http = require('http');

process.env.NODE_ENV = 'test';
process.env.ADMIN_PIN = 'INVICTORS@23';
process.env.EVENT_SALT = 'test_salt_123';

const express = require('express');
const cookieParser = require('cookie-parser');
const db = require('../db');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api', require('../routes/api'));
app.use('/api/admin', require('../routes/admin'));

let server;
let baseUrl;

function parseCookies(res) {
  const setCookie = res.headers.get('set-cookie');
  if (!setCookie) return {};
  const cookies = {};
  setCookie.split(',').forEach(str => {
    const parts = str.split(';')[0].split('=');
    if (parts.length >= 2) {
      cookies[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
  });
  return cookies;
}

async function request(endpoint, options = {}) {
  const url = `${baseUrl}${endpoint}`;
  const headers = options.headers || {};
  if (options.cookies) {
    headers['Cookie'] = Object.entries(options.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }
  if (options.body && typeof options.body === 'object') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body
  });

  let data;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  return { status: res.status, data, headers: res.headers };
}

async function runNewFeatureTests() {
  server = app.listen(0);
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Testing New Features on ${baseUrl}...`);

  try {
    // Clean and initialize settings for Start Together mode test
    const ds = require('../dataService');
    await ds.setSetting('clockPaused', 'false');
    await ds.setSetting('pauseStartedAt', '0');
    await ds.setSetting('allowNewTeams', 'false');
    await ds.setSetting('startTogetherMode', 'true');
    await ds.setSetting('gameStarted', 'false');
    await ds.restartAllTeams('lobby', Date.now());
    const existingAlpha = await ds.getTeamByName('AlphaSquad');
    if (existingAlpha) {
      await ds.deleteTeam(existingAlpha.id);
    }

    console.log('--- Test 1: Start Together Mode Registration & Lobby ---');
    const regRes = await request('/api/teams', {
      method: 'POST',
      body: {
        teamName: 'AlphaSquad',
        coordinator: 'Arun',
        member1: 'Player One',
        member2: 'Player Two',
        member3: 'Player Three'
      }
    });

    assert.strictEqual(regRes.status, 200);
    assert.strictEqual(regRes.data.team.status, 'waiting');
    const leaderCookie = parseCookies(regRes)['fo_leader_token'];
    assert(leaderCookie, 'Leader cookie should be set');

    // Check state in lobby
    const stateRes = await request('/api/state', {
      cookies: { fo_leader_token: leaderCookie }
    });
    assert.strictEqual(stateRes.data.waitingInLobby, true);
    assert.strictEqual(stateRes.data.stageContent, null, 'Stage content hidden while in lobby');

    // Attempt submit while in lobby should fail
    const submitFail = await request('/api/submit', {
      method: 'POST',
      cookies: { fo_leader_token: leaderCookie },
      body: { answer: 'NOVA' }
    });
    assert.strictEqual(submitFail.status, 400);
    assert(submitFail.data.error.includes('has not started yet'), 'Submissions blocked in lobby');

    console.log('✅ Passed Test 1: Team registers into waiting lobby when startTogetherMode is true');

    console.log('--- Test 2: Admin Launch All Teams ---');
    const startAllRes = await request('/api/admin/start-all', {
      method: 'POST',
      headers: { 'x-admin-pin': 'INVICTORS@23' }
    });
    assert.strictEqual(startAllRes.status, 200);
    assert.strictEqual(startAllRes.data.success, true);
    assert(startAllRes.data.activatedTeamsCount >= 1);

    // State now active
    const activeState = await request('/api/state', {
      cookies: { fo_leader_token: leaderCookie }
    });
    assert.strictEqual(activeState.data.waitingInLobby, false);
    assert.strictEqual(activeState.data.team.status, 'active');
    assert(activeState.data.stageContent.morsePattern, 'Morse pattern visible after game start');

    console.log('✅ Passed Test 2: Admin start-all launches all waiting teams simultaneously');

    console.log('--- Test 3: Anti-Cheat Tab Switch Penalty ---');
    const tabPenaltyRes = await request('/api/tab-penalty', {
      method: 'POST',
      cookies: { fo_leader_token: leaderCookie }
    });
    assert.strictEqual(tabPenaltyRes.status, 200);
    assert.strictEqual(tabPenaltyRes.data.tabSwitches, 1);
    assert.strictEqual(tabPenaltyRes.data.penaltyAdded, 2);
    assert.strictEqual(tabPenaltyRes.data.totalPenaltyMin, 2);

    // Check violation in admin log
    const violationsRes = await request('/api/admin/violations', {
      headers: { 'x-admin-pin': 'INVICTORS@23' }
    });
    assert.strictEqual(violationsRes.status, 200);
    assert(violationsRes.data.violations.length >= 1);
    assert(violationsRes.data.violations.some(v => v.type === 'tab_switch'));
    console.log('✅ Passed Test 3: Anti-cheat tab switch applies +2 min penalty and logs violation');

    console.log('--- Test 4: Individual Team Pause & Resume ---');
    const teamId = regRes.data.team.id;
    // Pause team
    const pauseRes = await request('/api/admin/team-pause', {
      method: 'POST',
      headers: { 'x-admin-pin': 'INVICTORS@23' },
      body: { teamId, action: 'pause' }
    });
    assert.strictEqual(pauseRes.status, 200);
    assert.strictEqual(pauseRes.data.isPaused, true);

    // Submitting while paused should fail
    const pausedSubmit = await request('/api/submit', {
      method: 'POST',
      cookies: { fo_leader_token: leaderCookie },
      body: { answer: 'NOVA' }
    });
    assert.strictEqual(pausedSubmit.status, 400);
    assert(pausedSubmit.data.error.includes('paused'));

    // Resume team
    const resumeRes = await request('/api/admin/team-pause', {
      method: 'POST',
      headers: { 'x-admin-pin': 'INVICTORS@23' },
      body: { teamId, action: 'resume' }
    });
    assert.strictEqual(resumeRes.status, 200);
    assert.strictEqual(resumeRes.data.isPaused, false);

    // Solve Stage 1 after resume
    const solve1 = await request('/api/submit', {
      method: 'POST',
      cookies: { fo_leader_token: leaderCookie },
      body: { answer: 'NOVA' }
    });
    assert.strictEqual(solve1.status, 200);
    assert.strictEqual(solve1.data.nextStage, 2);
    console.log('✅ Passed Test 4: Individual team pause & resume correctly freezes and unfreezes submission');

    console.log('--- Test 5: Individual Team Restart ---');
    const restartRes = await request('/api/admin/team-restart', {
      method: 'POST',
      headers: { 'x-admin-pin': 'INVICTORS@23' },
      body: { teamId }
    });
    assert.strictEqual(restartRes.status, 200);

    const afterRestartState = await request('/api/state', {
      cookies: { fo_leader_token: leaderCookie }
    });
    assert.strictEqual(afterRestartState.data.team.stage, 1);
    assert.strictEqual(afterRestartState.data.team.penaltyMin, 0);
    assert.strictEqual(afterRestartState.data.team.tabSwitches, 0);
    console.log('✅ Passed Test 5: Individual team restart resets progress, penalties, and violations to Stage 1');

    console.log('--- Test 6: Master Answer Key & Solutions Endpoint ---');
    const answersRes = await request('/api/admin/answers', {
      headers: { 'x-admin-pin': 'INVICTORS@23' }
    });
    assert.strictEqual(answersRes.status, 200);
    assert.strictEqual(answersRes.data.staticAnswers.stage1.answer, 'NOVA');
    assert.strictEqual(answersRes.data.staticAnswers.stage2.answer, '7K2');
    assert.strictEqual(answersRes.data.staticAnswers.stage3.answer, 'ORBIT');
    assert.strictEqual(answersRes.data.staticAnswers.stage4.answer, '91X');
    assert(answersRes.data.teamSolutions.length >= 1);
    const alphaSol = answersRes.data.teamSolutions.find(t => t.teamName === 'AlphaSquad');
    assert(alphaSol.stage5Code, 'Dynamic Stage 5 code generated');
    assert(alphaSol.stage6Key, 'Dynamic Stage 6 composite key generated');
    assert.strictEqual(alphaSol.memberShards.length, 3);
    console.log('✅ Passed Test 6: Master Answer Key generates static and dynamic team keys accurately');

    console.log('--- Test 7: Winners Scratchpad Persistence ---');
    const testNotes = '1st Place: AlphaSquad (Time: 12:45)\n2nd Place: BetaSquad (Time: 15:30)';
    const saveNotepad = await request('/api/admin/notepad', {
      method: 'POST',
      headers: { 'x-admin-pin': 'INVICTORS@23' },
      body: { notepad: testNotes }
    });
    assert.strictEqual(saveNotepad.status, 200);

    const getNotepad = await request('/api/admin/notepad', {
      headers: { 'x-admin-pin': 'INVICTORS@23' }
    });
    assert.strictEqual(getNotepad.status, 200);
    assert.strictEqual(getNotepad.data.notepad, testNotes);
    console.log('✅ Passed Test 7: Winners Notepad persists and loads notes accurately');

    console.log('\n🎉 ALL NEW FEATURE TESTS PASSED SUCCESSFULLY! 🎉\n');
  } finally {
    server.close();
  }
}

runNewFeatureTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
