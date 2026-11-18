const express = require('express');
const router = express.Router();
const ds = require('../dataService');

router.post('/', async (req, res) => {
  try {
    const leaderToken = req.cookies.fo_leader_token;
    if (!leaderToken) {
      return res.status(401).json({ error: 'Unauthorized: Team session required.' });
    }

    const team = await ds.getTeamByToken(leaderToken);
    if (!team) {
      return res.status(401).json({ error: 'Team not found.' });
    }

    if (team.stage !== 4) {
      return res.status(403).json({ error: 'Terminal is only accessible in Stage 4.' });
    }

    const rawCmd = (req.body.cmd || '').trim();
    const cmd = rawCmd.toLowerCase();

    let output = '';

    if (cmd === 'help') {
      output = 'Commands: ls, ls <folder>, cat <file>, exif <file>';
    } else if (cmd === 'ls') {
      output = 'index.html robots.txt badge.jpg';
    } else if (cmd === 'cat index.html' || cmd === 'cat ./index.html' || cmd === 'cat /index.html') {
      output = '<!DOCTYPE html>\n<!-- token1 = 9 -->\n<html>\n<head><title>Secure Facility Node</title></head>\n<body><h1>Mission 4 CTF Node</h1></body>\n</html>';
    } else if (cmd === 'ls vault-7f3a' || cmd === 'ls vault-7f3a/' || cmd === 'ls /vault-7f3a') {
      output = 'note.txt';
    } else if (cmd === 'cat robots.txt' || cmd === 'cat ./robots.txt' || cmd === 'cat /robots.txt') {
      output = 'User-agent: *\nDisallow: /vault-7f3a/';
    } else if (cmd === 'cat vault-7f3a/note.txt' || cmd === 'cat /vault-7f3a/note.txt' || cmd === 'cat ./vault-7f3a/note.txt') {
      output = 'token2 = 1';
    } else if (cmd === 'exif badge.jpg' || cmd === 'exif ./badge.jpg') {
      output = 'File: badge.jpg\nComment: token3 = X';
    } else {
      output = 'Command not found. Type help';
    }

    return res.json({ output });
  } catch (err) {
    console.error('Terminal error:', err);
    return res.status(500).json({ error: 'Terminal execution failure.' });
  }
});

module.exports = router;
