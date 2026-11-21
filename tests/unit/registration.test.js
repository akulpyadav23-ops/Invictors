const { test, describe } = require('node:test');
const assert = require('node:assert');
const TeamService = require('../../server/services/teamService');
const { getRepositories } = require('../../server/repositories');

describe('Registration Unit Tests (Assumptions A3, Security)', () => {
  const repos = getRepositories();
  const teamService = new TeamService(repos);

  test('3 players: succeeds and registers team (Member 4 is optional per A3)', async () => {
    const uniqueName = 'Squad_' + Date.now();
    const result = await teamService.registerTeam({
      teamName: uniqueName,
      coordinator: 'Prof. Sharma',
      member1: 'Alice',
      member2: 'Bob',
      member3: 'Charlie',
      member4: ''
    });

    assert.ok(result.team);
    assert.strictEqual(result.team.name, uniqueName);
    assert.strictEqual(result.team.memberCount, 3);
    assert.strictEqual(result.team.stage, 1);
    assert.ok(result.sessionToken);
  });

  test('4 players: succeeds and registers all 4 members', async () => {
    const uniqueName = 'Squad4_' + Date.now();
    const result = await teamService.registerTeam({
      teamName: uniqueName,
      coordinator: 'Prof. Sharma',
      member1: 'Alice',
      member2: 'Bob',
      member3: 'Charlie',
      member4: 'David'
    });

    assert.ok(result.team);
    assert.strictEqual(result.team.memberCount, 4);
    const members = repos.members.getByTeamId(result.team.id);
    assert.strictEqual(members.length, 4);
  });

  test('2 players: fails validation with status 400', async () => {
    try {
      await teamService.registerTeam({
        teamName: 'Squad2_' + Date.now(),
        coordinator: 'Prof. Sharma',
        member1: 'Alice',
        member2: 'Bob',
        member3: '',
        member4: ''
      });
      assert.fail('Should have thrown validation error');
    } catch (err) {
      assert.strictEqual(err.status, 400);
      assert.match(err.message, /needs 3 or 4 players/);
    }
  });

  test('Duplicate member names: fails validation with status 400', async () => {
    try {
      await teamService.registerTeam({
        teamName: 'SquadDup_' + Date.now(),
        coordinator: 'Prof. Sharma',
        member1: 'Alice',
        member2: 'Bob',
        member3: 'alice',
        member4: ''
      });
      assert.fail('Should have thrown validation error for duplicate members');
    } catch (err) {
      assert.strictEqual(err.status, 400);
      assert.match(err.message, /distinct name/);
    }
  });

  test('Team name > 24 characters: fails validation with status 400', async () => {
    try {
      await teamService.registerTeam({
        teamName: 'ThisTeamNameIsWayTooLongForRegistration',
        coordinator: 'Prof. Sharma',
        member1: 'Alice',
        member2: 'Bob',
        member3: 'Charlie'
      });
      assert.fail('Should have thrown validation error');
    } catch (err) {
      assert.strictEqual(err.status, 400);
      assert.match(err.message, /cannot exceed 24 characters/);
    }
  });

  test('Team name with angle brackets: fails validation with status 400 (XSS prevention)', async () => {
    try {
      await teamService.registerTeam({
        teamName: 'Team<script>',
        coordinator: 'Prof. Sharma',
        member1: 'Alice',
        member2: 'Bob',
        member3: 'Charlie'
      });
      assert.fail('Should have thrown validation error');
    } catch (err) {
      assert.strictEqual(err.status, 400);
      assert.match(err.message, /invalid characters/);
    }
  });

  test('Duplicate team name: fails case-insensitively with status 400', async () => {
    const teamName = 'Unique_' + Date.now();
    await teamService.registerTeam({
      teamName,
      coordinator: 'Prof. Sharma',
      member1: 'Alice',
      member2: 'Bob',
      member3: 'Charlie'
    });

    try {
      await teamService.registerTeam({
        teamName: teamName.toLowerCase(),
        coordinator: 'Prof. Sharma',
        member1: 'Dan',
        member2: 'Eve',
        member3: 'Frank'
      });
      assert.fail('Should have thrown duplicate team name error');
    } catch (err) {
      assert.strictEqual(err.status, 400);
      assert.match(err.message, /already taken/);
    }
  });
});
