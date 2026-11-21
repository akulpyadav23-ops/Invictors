const express = require('express');
const router = express.Router();
const { requireMember } = require('../middleware/auth');
const { getRepositories } = require('../repositories');

const repos = getRepositories();

// GET /api/notes - Retrieve persistent team notes (Phase 4.1)
router.get('/', requireMember, (req, res) => {
  const notes = repos.notes.get(req.team.id);
  res.json({ notes });
});

// POST /api/notes - Update persistent team notes (max 1000 chars)
router.post('/', requireMember, (req, res) => {
  const { notes } = req.body || {};
  const saved = repos.notes.save(req.team.id, notes);
  res.json({ success: true, notes: saved });
});

module.exports = router;
