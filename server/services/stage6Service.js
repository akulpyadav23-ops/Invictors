// Stage 6 Service: Final Integration (Phase 4.7)
// Master override synthesis from the 5 notebook fragments and machine hint network.
// Zero legacy dependencies: no legacy bracketed wrappers, no checksum/digit-sum, no reverse rule, no alphabetical-by-mission-name.

const { getMission } = require('../content/loader');
const { norm } = require('../lib/hmac');

// Single config-driven final answer derivation function
// Used for both generation (admin answer key) and verification (player submissions).
// NOTE FOR ORGANIZERS: Define your custom event derivation formula here and in mission.json.
function deriveFinalAnswer(teamName, notebookFragments, memberCodes = []) {
  const mission = getMission();
  const stage6Config = mission.stages['6'];

  // Default placeholder derivation rule:
  // Sequential mission fragments 1 through 5 concatenated with hyphens
  const f1 = notebookFragments['1'] || mission.stages['1'].answer;
  const f2 = (notebookFragments['2'] || mission.stages['2'].answer).toUpperCase();
  const f3 = notebookFragments['3'] || mission.stages['3'].answer;
  const f4 = notebookFragments['4'] || mission.stages['4'].answer;
  const f5 = notebookFragments['5'] || (memberCodes.length > 0 ? [...memberCodes].sort().join('-') : 'SYNC-OK');

  return `${f1}-${f2}-${f3}-${f4}-${f5}`.toUpperCase();
}

class Stage6Service {
  constructor(repos) {
    this.repos = repos;
    this.mission = getMission();
  }

  // State payload for Stage 6 client view
  getStatePayload(team) {
    const stage6Config = this.mission.stages['6'];

    // Retrieve solved fragments 1 to 5 from database progress records
    const progressList = this.repos.progress.getByTeamId(team.id);
    const notebook = {};
    progressList.forEach((p) => {
      if (p.stage <= 5 && p.fragment) {
        notebook[p.stage] = p.fragment;
      }
    });

    return {
      title: 'Stage 6: Final Integration',
      story:
        stage6Config.story ||
        'This is the final lock! Open your dossier notebook to retrieve the 5 fragments collected across each completed mission. Synthesize the master override key to breach the security grid.',
      instruction:
        stage6Config.instruction ||
        'Derive the final override key using the 5 notebook fragments and the active machine network nodes revealed in your mission hint.',
      machines: stage6Config.machines || [],
      notebook
    };
  }

  // Validate submission against derived final answer
  validateSubmission(team, rawInput, notebookFragments, memberCodes = []) {
    const expectedAnswer = deriveFinalAnswer(team.name, notebookFragments, memberCodes);
    const isCorrect = norm(rawInput) === norm(expectedAnswer);

    return {
      isCorrect,
      expectedAnswer,
      finished: isCorrect
    };
  }
}

module.exports = {
  Stage6Service,
  deriveFinalAnswer
};
