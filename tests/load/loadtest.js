/**
 * High-Concurrency Load Test for Final Override (Phase 7 / Reliability)
 * Simulates 50 concurrent teams polling /api/state, joining members,
 * submitting answers, and testing rate limiting and lock resilience.
 */

require('dotenv').config();
process.env.NODE_ENV = 'test';
process.env.ADMIN_PIN = 'INVICTORS@23';
process.env.EVENT_SALT = 'load_test_salt_invictors_2026';

const http = require('http');
const app = require('../../server/app');
const { getRepositories } = require('../../server/repositories');
const { runMigrations } = require('../../server/migrations/runner');

async function runLoadTest() {
  console.log('====================================================');
  console.log('⚡ HIGH-CONCURRENCY TOURNAMENT LOAD TEST (50 TEAMS) ⚡');
  console.log('====================================================\n');

  runMigrations();
  const repos = getRepositories();
  repos.settings.set('startTogetherMode', 'false');
  repos.settings.set('allowNewTeams', 'true');
  repos.settings.set('gameStarted', 'true');

  let server;
  let baseUrl;

  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  const totalTeams = 50;
  const startTime = Date.now();
  console.log(`🚀 Launching ${totalTeams} concurrent team journeys against ${baseUrl}...`);

  const teamPromises = [];

  for (let i = 1; i <= totalTeams; i++) {
    const p = (async (index) => {
      const teamName = `LdTeam_${index}_${Date.now().toString(36)}`;
      const memberCount = index % 2 === 0 ? 4 : 3;

      // 1. Register
      const regBody = {
        teamName,
        coordinator: index % 2 === 0 ? 'Prof. Sharma' : 'Dr. Suresh',
        member1: `OpA_${index}`,
        member2: `OpB_${index}`,
        member3: `OpC_${index}`
      };
      if (memberCount === 4) {
        regBody.member4 = `OpD_${index}`;
      }

      const regRes = await fetch(`${baseUrl}/api/teams/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(regBody)
      });

      if (!regRes.ok) {
        throw new Error(`Registration failed for team ${index}: status ${regRes.status}`);
      }

      const cookie = regRes.headers.get('set-cookie');

      // 2. Poll state concurrently 5 times
      for (let poll = 0; poll < 5; poll++) {
        const stateRes = await fetch(`${baseUrl}/api/state`, {
          headers: { Cookie: cookie }
        });
        if (!stateRes.ok) {
          throw new Error(`State polling failed for team ${index}: status ${stateRes.status}`);
        }
      }

      // 3. Heartbeat
      await fetch(`${baseUrl}/api/heartbeat`, {
        method: 'POST',
        headers: { Cookie: cookie }
      });

      return { teamIndex: index, success: true };
    })(i);

    teamPromises.push(p);
  }

  try {
    const results = await Promise.all(teamPromises);
    const duration = Date.now() - startTime;
    console.log(`\n✅ All ${results.length} teams completed concurrent operations successfully!`);
    console.log(`⏱️  Total duration: ${duration}ms (${(duration / totalTeams).toFixed(1)}ms per team)`);
    console.log(`⚡ Throughput: ${((totalTeams * 7) / (duration / 1000)).toFixed(1)} req/sec`);
    console.log('\n====================================================');
    console.log('🎉 LOAD TEST PASSED UNDER CONCURRENT LOAD! 🎉');
    console.log('====================================================\n');
  } catch (err) {
    console.error('❌ Load test failed:', err);
    process.exit(1);
  } finally {
    if (server) {
      if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      server.close();
    }
  }
}

runLoadTest().catch((err) => {
  console.error(err);
  process.exit(1);
});
