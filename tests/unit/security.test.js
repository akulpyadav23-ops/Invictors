const { test, describe } = require('node:test');
const assert = require('node:assert');
const { safeCompare } = require('../../server/middleware/auth');
const antiCheatService = require('../../server/services/antiCheatService');
const { getRepositories } = require('../../server/repositories');

describe('Security & Anti-Cheat Unit Tests (Timing Safe & Tab Deduplication)', () => {
  const repos = getRepositories();

  test('Constant-time PIN comparison (safe against timing attacks)', () => {
    const validPin = 'INVICTORS_909';
    assert.strictEqual(safeCompare('INVICTORS_909', validPin), true);
    assert.strictEqual(safeCompare('WRONG_PIN', validPin), false);
    assert.strictEqual(safeCompare('', validPin), false);
    assert.strictEqual(safeCompare(null, validPin), false);
    assert.strictEqual(safeCompare(undefined, validPin), false);
  });

  test('Anti-Cheat: Stage 4 is exempt from tab switch penalties (DevTools permitted)', () => {
    const mockTeam = { id: 'team-sec-1', stage1EnteredAt: Date.now() - 10000, penaltyMin: 0 };
    const result = antiCheatService.recordVisibilityChange(mockTeam, 4);
    assert.strictEqual(result.exempted, true);
    assert.strictEqual(result.penaltyAdded, 0);
  });

  test('Anti-Cheat: 3-second grace period exempts immediate tab switches after stage entry', () => {
    const mockTeam = { id: 'team-sec-2', stage1EnteredAt: Date.now() - 1000, penaltyMin: 0 };
    const result = antiCheatService.recordVisibilityChange(mockTeam, 1);
    assert.strictEqual(result.exempted, true);
    assert.strictEqual(result.penaltyAdded, 0);
  });

  test('Anti-Cheat: Deduplicates multiple events within 5 seconds', () => {
    const now = Date.now() - 10000;
    const teamId = 'team-sec-dedup-' + Date.now();
    const team = repos.teams.create({
      id: teamId,
      name: 'DedupTeam_' + Date.now(),
      coordinator: 'Prof. Sharma',
      memberCount: 3,
      startedAt: now,
      finishedAt: null,
      stage: 2,
      status: 'active',
      sessionToken: 'token_' + Date.now(),
      seed: 'seed',
      stage1EnteredAt: now,
      stage1OpensAt: now,
      created_at: now
    });

    // First switch
    const firstRes = antiCheatService.recordVisibilityChange(team, 2);
    assert.strictEqual(firstRes.penaltyAdded, 1);

    // Second switch immediately after (within 5 seconds)
    const secondRes = antiCheatService.recordVisibilityChange(team, 2);
    assert.strictEqual(secondRes.debounced, true);
    assert.strictEqual(secondRes.penaltyAdded, 0);
  });
});
