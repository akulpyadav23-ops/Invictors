const express = require('express');
const router = express.Router();
const { requireLeader } = require('../middleware/auth');
const HintService = require('../services/hintService');
const lock = require('../lib/lock');
const idempotency = require('../lib/idempotency');

const hintService = new HintService();

// POST /api/hint - Request next hint
router.post('/', requireLeader, async (req, res, next) => {
  const teamId = req.team.id;
  const stage = req.team.stage;
  const idempotencyKey = req.headers['idempotency-key'] || req.body.idempotencyKey;

  if (idempotencyKey) {
    const cached = idempotency.get(idempotencyKey);
    if (cached) return res.status(cached.status).json(cached.data);
  }

  await lock.withLock(teamId, async () => {
    try {
      const result = await hintService.requestHint(req.team, stage, idempotencyKey);
      if (idempotencyKey) {
        idempotency.set(idempotencyKey, { status: 200, data: result });
      }
      return res.json(result);
    } catch (err) {
      next(err);
    }
  });
});

module.exports = router;
