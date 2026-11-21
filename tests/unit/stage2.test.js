const { test, describe } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const Stage2Service = require('../../server/services/stage2Service');
const { getRepositories } = require('../../server/repositories');

describe('Stage 2 Unit Tests (Deterministic Permutations A4 & Lowercase Enforcement A5)', () => {
  const repos = getRepositories();
  const stage2Service = new Stage2Service(repos);

  test('Deterministic permutations across 200 teams produce valid distinct sequences (A4)', () => {
    const orders = new Set();
    for (let i = 0; i < 200; i++) {
      const mockTeam = {
        id: `mock-team-${i}`,
        seed: crypto.randomBytes(16).toString('hex')
      };
      const order = stage2Service.getDeterministicOrder(mockTeam);
      assert.strictEqual(order.length, 4);
      assert.deepStrictEqual([...order].sort(), [1, 2, 3, 4]);
      orders.add(order.join('-'));
    }

    // 4! = 24 total permutations. With 200 seeded runs, we must observe at least 20 distinct sequences.
    assert.ok(orders.size >= 20, `Expected >= 20 distinct permutations, got ${orders.size}`);
  });

  test('Uppercase or mixed-case answers return lowercase instruction WITHOUT penalty (A5)', () => {
    const mockTeam = { id: 'team-case-test', seed: 'seed123' };

    const uppercaseRes = stage2Service.validateSubmission(mockTeam, '4M7');
    assert.strictEqual(uppercaseRes.isCorrect, false);
    assert.strictEqual(uppercaseRes.requiresLowercaseNotice, true);
    assert.strictEqual(uppercaseRes.message, 'Enter your answer in lowercase');

    const mixedRes = stage2Service.validateSubmission(mockTeam, '4m7A');
    assert.strictEqual(mixedRes.isCorrect, false);
    assert.strictEqual(mixedRes.requiresLowercaseNotice, true);
    assert.strictEqual(mixedRes.message, 'Enter your answer in lowercase');
  });

  test('Correct lowercase answer returns isCorrect: true and uppercase fragment', () => {
    const mockTeam = { id: 'team-case-test', seed: 'seed123' };
    const result = stage2Service.validateSubmission(mockTeam, '4m7');
    assert.strictEqual(result.isCorrect, true);
    assert.strictEqual(result.requiresLowercaseNotice, false);
    assert.strictEqual(result.fragment, '4M7');
  });
});
