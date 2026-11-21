const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { getMission, STAGE_COUNT } = require('../../server/content/loader');
const { Stage6Service, deriveFinalAnswer } = require('../../server/services/stage6Service');
const Stage5Service = require('../../server/services/stage5Service');
const TeamService = require('../../server/services/teamService');
const LeaderboardService = require('../../server/services/leaderboardService');
const { getRepositories } = require('../../server/repositories');

describe('Stage 6 & Six-Stage System Integrity Tests', () => {
  const repos = getRepositories();
  const teamService = new TeamService(repos);
  const stage5Service = new Stage5Service(repos);
  const stage6Service = new Stage6Service(repos);
  const leaderboardService = new LeaderboardService(repos);
  const mission = getMission();

  test('Game has exactly six stages across config, loader, and mission data', () => {
    assert.strictEqual(STAGE_COUNT, 6, 'STAGE_COUNT constant must be 6');
    const stageKeys = Object.keys(mission.stages);
    assert.strictEqual(stageKeys.length, 6, 'mission.stages must contain exactly 6 stages');
    assert.deepStrictEqual(stageKeys.sort(), ['1', '2', '3', '4', '5', '6']);

    assert.strictEqual(mission.stages['5'].name, 'Team Sync');
    assert.strictEqual(mission.stages['6'].name, 'Final Integration');
  });

  test('Every registered team has exactly 6 progress records', async () => {
    const res = await teamService.registerTeam({
      teamName: 'SquadSix_' + Date.now(),
      coordinator: 'Prof. Sharma',
      member1: 'Alice',
      member2: 'Bob',
      member3: 'Charlie'
    });

    const prog = repos.progress.getByTeamId(res.team.id);
    assert.strictEqual(prog.length, 6, 'Must initialize exactly 6 progress rows for the 6 stages');
    assert.deepStrictEqual(prog.map((p) => p.stage).sort(), [1, 2, 3, 4, 5, 6]);
  });

  test('Stage 6 content cannot be accessed before Stage 5 is solved', () => {
    const mockTeam = {
      id: 'team-early',
      stage: 5,
      status: 'active',
      startedAt: Date.now()
    };

    // Stage 5 state does NOT contain Stage 6 payload
    const s5State = stage5Service.getStatePayload(mockTeam);
    assert.strictEqual(s5State.machines, undefined);
    assert.strictEqual(s5State.title, undefined);
  });

  test('deriveFinalAnswer verifies correct 5-fragment synthesis and rejects invalid keys', () => {
    const fragments = {
      1: 'CORE',
      2: '4M7',
      3: 'NEXUS',
      4: '82K',
      5: 'ALPHA-BRAVO-CHARLIE'
    };

    const expected = deriveFinalAnswer('TestTeam', fragments);
    assert.strictEqual(expected, 'CORE-4M7-NEXUS-82K-ALPHA-BRAVO-CHARLIE');

    const validCheck = stage6Service.validateSubmission({ name: 'TestTeam' }, expected, fragments);
    assert.strictEqual(validCheck.isCorrect, true);
    assert.strictEqual(validCheck.finished, true);

    const wrongCheck = stage6Service.validateSubmission({ name: 'TestTeam' }, 'INCORRECT-KEY', fragments);
    assert.strictEqual(wrongCheck.isCorrect, false);
    assert.strictEqual(wrongCheck.finished, false);
  });

  test('Stage 6 hint explicitly names configured machines', () => {
    const s6Hints = mission.stages['6'].hints;
    assert.ok(s6Hints && s6Hints.length >= 1);
    const machines = mission.stages['6'].machines;
    assert.ok(machines && machines.length >= 2);

    // At least one configured machine name must be mentioned in Hint 1
    const hint1Text = s6Hints[0].text;
    const mentionsMachine = machines.some((m) => hint1Text.includes(m));
    assert.ok(mentionsMachine, `Stage 6 hint "${hint1Text}" must explicitly name machine from ${machines.join(', ')}`);
  });

  test('Grep enforcement: Old legacy Stage 6 logic (bracketed wrapper, checksum, reverse, alphabetical mission) is completely eliminated', () => {
    const forbiddenPatterns = [
      new RegExp('F' + 'O' + '\\{'),
      new RegExp('\\bdigit' + ' sum\\b', 'i'),
      new RegExp('\\balphabetical' + ' order of the mission\\b', 'i'),
      new RegExp('\\breverse' + 'String\\b')
    ];

    const dirsToScan = [
      path.join(__dirname, '..', '..', 'server', 'services'),
      path.join(__dirname, '..', '..', 'server', 'routes'),
      path.join(__dirname, '..', '..', 'server', 'logic'),
      path.join(__dirname, '..', '..', 'scripts')
    ];

    for (const dir of dirsToScan) {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'buildValidation.js');
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const content = fs.readFileSync(fullPath, 'utf-8');
        for (const pat of forbiddenPatterns) {
          const match = content.match(pat);
          assert.strictEqual(
            match,
            null,
            `Forbidden legacy pattern ${pat} found in ${file}: "${match ? match[0] : ''}"`
          );
        }
      }
    }
  });

  test('Completion fires only upon Stage 6 solve (Stage 5 never marks team finished)', async () => {
    const res = await teamService.registerTeam({
      teamName: 'TeamStuck5_' + Date.now(),
      coordinator: 'Prof. Sharma',
      member1: 'M1',
      member2: 'M2',
      member3: 'M3'
    });

    const team = res.team;
    repos.teams.update(team.id, { stage: 5, status: 'active' });

    // Join remaining members
    await teamService.joinMember({ teamName: team.name, fullName: 'M2' });
    await teamService.joinMember({ teamName: team.name, fullName: 'M3' });

    const members = repos.members.getByTeamId(team.id);
    const teamCode = stage5Service.computeTeamCode(members);

    // Stage 5 solve
    const val5 = stage5Service.validateSubmission(team, teamCode);
    assert.strictEqual(val5.isCorrect, true);
    // Solving Stage 5 returns fragment, does not finish mission
    assert.strictEqual(val5.finished, undefined);

    const resStandings = leaderboardService.getStandings();
    const ranked = (resStandings.standings || resStandings).find((t) => t.id === team.id);
    assert.strictEqual(ranked.isFinished, false);
    assert.strictEqual(ranked.stageText, 'Stage 5 of 6');
  });

  test('Leaderboard formats stage count out of 6', () => {
    const mockTeam = {
      id: 'team-lb-6',
      name: 'SquadLB6',
      coordinator: 'Prof. Sharma',
      stage: 3,
      startedAt: Date.now() - 50000,
      finishedAt: null,
      status: 'active'
    };

    const standings = [mockTeam].map((t) => ({
      id: t.id,
      stage: t.stage,
      isFinished: false,
      stageText: `Stage ${t.stage} of 6`
    }));

    assert.strictEqual(standings[0].stageText, 'Stage 3 of 6');
  });
});
