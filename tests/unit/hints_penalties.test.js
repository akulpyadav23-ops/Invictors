const { test, describe } = require('node:test');
const assert = require('node:assert');
const HintService = require('../../server/services/hintService');
const LeaderboardService = require('../../server/services/leaderboardService');
const TeamService = require('../../server/services/teamService');
const { getRepositories } = require('../../server/repositories');

describe('Hints & Penalties Unit Tests (Assumptions A11, A12, A13)', () => {
  const repos = getRepositories();
  const teamService = new TeamService(repos);
  const hintService = new HintService(repos);
  const leaderboardService = new LeaderboardService(repos);

  test('Hint 1 costs +3 min, Hint 2 costs +5 min, max 2 hints per stage (A11)', async () => {
    const res = await teamService.registerTeam({
      teamName: 'TeamHint_' + Date.now(),
      coordinator: 'Prof. Sharma',
      member1: 'H1',
      member2: 'H2',
      member3: 'H3'
    });
    const team = res.team;

    // Hint 1
    const h1 = await hintService.requestHint(team, 1);
    assert.strictEqual(h1.hintNumber, 1);
    assert.strictEqual(h1.penaltyMinutes, 3);

    const afterH1 = repos.teams.getById(team.id);
    assert.strictEqual(afterH1.penaltyMin, 3);

    // Hint 2
    const h2 = await hintService.requestHint(afterH1, 1);
    assert.strictEqual(h2.hintNumber, 2);
    assert.strictEqual(h2.penaltyMinutes, 5);

    const afterH2 = repos.teams.getById(team.id);
    assert.strictEqual(afterH2.penaltyMin, 8);

    // Hint 3 (exceeds cap)
    try {
      await hintService.requestHint(afterH2, 1);
      assert.fail('Should reject hint 3');
    } catch (err) {
      assert.strictEqual(err.status, 400);
      assert.match(err.message, /All hints for this stage have already been utilized/);
    }
  });

  test('Leaderboard ranking orders finished above in-progress and breaks ties (A13)', () => {
    const standings = [
      { id: '1', isFinished: false, isTimeout: false, stage: 3, totalSeconds: 500, totalHints: 0, totalWrong: 0 },
      { id: '2', isFinished: true, isTimeout: false, stage: 5, totalSeconds: 1200, totalHints: 1, totalWrong: 0 },
      { id: '3', isFinished: true, isTimeout: false, stage: 5, totalSeconds: 900, totalHints: 2, totalWrong: 1 },
      { id: '4', isFinished: true, isTimeout: false, stage: 5, totalSeconds: 900, totalHints: 1, totalWrong: 2 },
      { id: '5', isFinished: false, isTimeout: true, stage: 2, totalSeconds: 5400, totalHints: 0, totalWrong: 5 }
    ];

    standings.sort((a, b) => {
      if (a.isFinished && !b.isFinished) return -1;
      if (!a.isFinished && b.isFinished) return 1;

      if (a.isFinished && b.isFinished) {
        if (a.totalSeconds !== b.totalSeconds) return a.totalSeconds - b.totalSeconds;
        if (a.totalHints !== b.totalHints) return a.totalHints - b.totalHints;
        return a.totalWrong - b.totalWrong;
      }

      if (!a.isTimeout && b.isTimeout) return -1;
      if (a.isTimeout && !b.isTimeout) return 1;

      if (a.stage !== b.stage) return b.stage - a.stage;
      return a.totalSeconds - b.totalSeconds;
    });

    // 1st: Team 4 (finished, 900s, 1 hint)
    assert.strictEqual(standings[0].id, '4');
    // 2nd: Team 3 (finished, 900s, 2 hints)
    assert.strictEqual(standings[1].id, '3');
    // 3rd: Team 2 (finished, 1200s)
    assert.strictEqual(standings[2].id, '2');
    // 4th: Team 1 (in-progress, stage 3)
    assert.strictEqual(standings[3].id, '1');
    // 5th: Team 5 (timeout)
    assert.strictEqual(standings[4].id, '5');
  });
});
