const { test, describe } = require('node:test');
const assert = require('node:assert');
const Stage1Service = require('../../server/services/stage1Service');
const { getRepositories } = require('../../server/repositories');
const clock = require('../../server/lib/clock');

describe('Stage 1 Unit Tests (Signal Intercept & Morse Matrix)', () => {
  const repos = getRepositories();
  const stage1Service = new Stage1Service(repos);

  test('0-59s (Memorise phase): sectors are hidden from client state', () => {
    const now = Date.now();
    const mockTeam = {
      id: 'test-team-1',
      stage1EnteredAt: now,
      stage1OpensAt: now + 60000,
      chartVisibleUntil: null
    };

    const state = stage1Service.getStatePayload(mockTeam);
    assert.strictEqual(state.phase, 'memorise');
    assert.ok(state.remainingSeconds > 0);
    assert.ok(state.morseChart);
    assert.strictEqual(state.sectors, undefined);
  });

  test('Submissions during memorise phase are rejected with status 400', () => {
    const now = Date.now();
    const mockTeam = {
      id: 'test-team-1',
      stage1EnteredAt: now,
      stage1OpensAt: now + 60000
    };

    try {
      stage1Service.validateSubmission(mockTeam, 'CORE');
      assert.fail('Should reject during memorise window');
    } catch (err) {
      assert.strictEqual(err.status, 400);
      assert.match(err.message, /Memorise phase in progress/);
    }
  });

  test('60s+ (Solve phase): sectors are revealed to the client', () => {
    const past = Date.now() - 70000;
    const mockTeam = {
      id: 'test-team-1',
      stage1EnteredAt: past,
      stage1OpensAt: past + 60000,
      chartVisibleUntil: null
    };

    const state = stage1Service.getStatePayload(mockTeam);
    assert.strictEqual(state.phase, 'solve');
    assert.ok(Array.isArray(state.sectors));
    assert.strictEqual(state.sectors.length, 4);
  });

  test('Decoy answer (APEX8) returns decoy notice and is not correct', () => {
    const past = Date.now() - 70000;
    const mockTeam = {
      id: 'test-team-1',
      stage1EnteredAt: past,
      stage1OpensAt: past + 60000
    };

    const result = stage1Service.validateSubmission(mockTeam, 'APEX8');
    assert.strictEqual(result.isCorrect, false);
    assert.strictEqual(result.isDecoy, true);
  });

  test('Correct answer (CORE) returns isCorrect: true and fragment', () => {
    const past = Date.now() - 70000;
    const mockTeam = {
      id: 'test-team-1',
      stage1EnteredAt: past,
      stage1OpensAt: past + 60000
    };

    const result = stage1Service.validateSubmission(mockTeam, 'CORE');
    assert.strictEqual(result.isCorrect, true);
    assert.strictEqual(result.fragment, 'CORE');
  });
});
