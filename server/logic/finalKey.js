// Final key synthesis helper (Refactored to deriveFinalAnswer)
// Obsolete legacy rules (legacy bracketed wrappers, checksums, reversed pieces, alphabetical mission names) have been removed.

const { deriveFinalAnswer } = require('../services/stage6Service');

function computeFinalKey(f1, f2, f3, f4, f5) {
  return deriveFinalAnswer('TEAM', { 1: f1, 2: f2, 3: f3, 4: f4, 5: f5 });
}

module.exports = {
  computeFinalKey,
  deriveFinalAnswer
};
