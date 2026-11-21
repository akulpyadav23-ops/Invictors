const fs = require('fs');
const path = require('path');

let cachedMission = null;

function loadMissionContent(options = {}) {
  if (cachedMission && !options.reload) {
    return cachedMission;
  }

  const primaryPath = path.join(__dirname, 'mission.json');
  const examplePath = path.join(__dirname, 'mission.example.json');

  let filePathToLoad = primaryPath;
  if (!fs.existsSync(primaryPath)) {
    if (process.env.NODE_ENV === 'test' && fs.existsSync(examplePath)) {
      filePathToLoad = examplePath;
    } else {
      console.error('\n======================================================');
      console.error('❌ FATAL STARTUP ERROR: mission.json is missing!');
      console.error('Please copy server/content/mission.example.json to');
      console.error('server/content/mission.json and configure real secrets.');
      console.error('======================================================\n');
      process.exit(1);
    }
  }

  try {
    const rawData = fs.readFileSync(filePathToLoad, 'utf-8');
    const parsed = JSON.parse(rawData);

    // Validation
    if (!parsed.stages || !parsed.stages['1'] || !parsed.stages['2'] || !parsed.stages['3'] || !parsed.stages['4'] || !parsed.stages['5']) {
      throw new Error('mission.json must define all 5 stages.');
    }

    cachedMission = Object.freeze(parsed);
    return cachedMission;
  } catch (err) {
    console.error('❌ FATAL STARTUP ERROR parsing mission.json:', err.message);
    process.exit(1);
  }
}

module.exports = {
  getMission: loadMissionContent
};
