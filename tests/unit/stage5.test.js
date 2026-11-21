const { test, describe } = require('node:test');
const assert = require('node:assert');
const TeamService = require('../../server/services/teamService');
const Stage5Service = require('../../server/services/stage5Service');
const { getRepositories } = require('../../server/repositories');

describe('Stage 5 Unit Tests (Code Formats A10 & Multi-Device Sync A9)', () => {
  const repos = getRepositories();
  const teamService = new TeamService(repos);
  const stage5Service = new Stage5Service(repos);

  test('4-player team has exactly 2 mixed and 2 alphabetic codes (Assumption A10)', async () => {
    const res = await teamService.registerTeam({
      teamName: 'Team4_A10_' + Date.now(),
      coordinator: 'Prof. Sharma',
      member1: 'Alpha',
      member2: 'Bravo',
      member3: 'Charlie',
      member4: 'Delta'
    });

    const members = repos.members.getByTeamId(res.team.id);
    assert.strictEqual(members.length, 4);

    const mixed = members.filter(m => m.assignedCodeType === 'mixed');
    const alpha = members.filter(m => m.assignedCodeType === 'alpha');

    assert.strictEqual(mixed.length, 2, 'Must have exactly 2 mixed alphanumeric codes');
    assert.strictEqual(alpha.length, 2, 'Must have exactly 2 alphabetic codes');

    // Verify format strings
    for (const m of mixed) {
      assert.match(m.assignedShard, /[A-Z]/);
      assert.match(m.assignedShard, /[0-9]/);
    }
    for (const a of alpha) {
      assert.match(a.assignedShard, /^[A-Z]+$/);
    }
  });

  test('3-player team has exactly 2 mixed and 1 alphabetic code (Assumption A10)', async () => {
    const res = await teamService.registerTeam({
      teamName: 'Team3_A10_' + Date.now(),
      coordinator: 'Prof. Sharma',
      member1: 'Alpha',
      member2: 'Bravo',
      member3: 'Charlie'
    });

    const members = repos.members.getByTeamId(res.team.id);
    assert.strictEqual(members.length, 3);

    const mixed = members.filter(m => m.assignedCodeType === 'mixed');
    const alpha = members.filter(m => m.assignedCodeType === 'alpha');

    assert.strictEqual(mixed.length, 2, 'Must have exactly 2 mixed codes');
    assert.strictEqual(alpha.length, 1, 'Must have exactly 1 alphabetic code');
  });

  test('Stage 5 submission is blocked until all operatives join on separate devices', async () => {
    const res = await teamService.registerTeam({
      teamName: 'TeamJoin_' + Date.now(),
      coordinator: 'Prof. Sharma',
      member1: 'Leader',
      member2: 'P2',
      member3: 'P3'
    });

    const notebook = { '1': 'CORE', '2': '4M7', '3': 'NEXUS', '4': '82K' };

    // Only leader joined so far
    try {
      stage5Service.validateSubmission(res.team, 'FO-TEST', notebook);
      assert.fail('Should block until all members join');
    } catch (err) {
      assert.strictEqual(err.status, 400);
      assert.match(err.message, /Waiting for all squad operatives to join/);
    }

    // Now P2 and P3 join on separate devices
    await teamService.joinMember({ teamName: res.team.name, fullName: 'P2' });
    await teamService.joinMember({ teamName: res.team.name, fullName: 'P3' });

    // Derive correct answer
    const members = repos.members.getByTeamId(res.team.id);
    const codes = members.map(m => m.assignedShard);
    const expected = stage5Service.deriveFinalAnswer(res.team.name, codes, notebook);

    const validation = stage5Service.validateSubmission(res.team, expected, notebook);
    assert.strictEqual(validation.isCorrect, true);
    assert.strictEqual(validation.finished, true);
  });
});
