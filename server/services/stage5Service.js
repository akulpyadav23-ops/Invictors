// Stage 5 Service: Team Sync & Final Override (Phase 4.6 / Assumptions A2, A3, A9, A10)

const { getMission } = require('../content/loader');
const { norm, generateVerificationCode } = require('../lib/hmac');
const clock = require('../lib/clock');

class Stage5Service {
  constructor(repos) {
    this.repos = repos;
    this.mission = getMission();
  }

  // Dynamic config-driven final answer derivation (Assumption A9)
  // Derived from member codes, notebook fragments, and machine signature
  deriveFinalAnswer(teamName, memberCodes, notebookFragments) {
    // Configurable rule: clean uppercase fragments joined in order + member codes sorted
    const f1 = notebookFragments['1'] || this.mission.stages['1'].answer;
    const f2 = notebookFragments['2'] || this.mission.stages['2'].answer.toUpperCase();
    const f3 = notebookFragments['3'] || this.mission.stages['3'].answer;
    const f4 = notebookFragments['4'] || this.mission.stages['4'].answer;

    // Sorted member codes
    const sortedCodes = [...memberCodes].sort();
    const memberCodeString = sortedCodes.join('-');

    // Single deterministic formula: F1-F2-F3-F4-MEMBERCODES
    return `${f1}-${f2}-${f3}-${f4}-${memberCodeString}`.toUpperCase();
  }

  getStatePayload(team, currentMemberToken = null) {
    const stage5Config = this.mission.stages['5'];
    const members = this.repos.members.getByTeamId(team.id);
    const totalMembers = members.length;

    // Joined operatives: operatives with a deviceToken
    const joinedMembers = members.filter(m => m.deviceToken !== null);
    const joinedCount = joinedMembers.length;

    // Find current member viewing this screen
    let currentOperative = null;
    if (currentMemberToken) {
      currentOperative = members.find(m => m.deviceToken === currentMemberToken);
    } else {
      // Leader device
      currentOperative = members.find(m => m.isLeader === 1);
    }

    return {
      totalMembers,
      joinedCount,
      allJoined: joinedCount >= totalMembers,
      machines: stage5Config.machines,
      currentMemberCode: currentOperative ? currentOperative.assignedShard : null,
      currentMemberCodeType: currentOperative ? currentOperative.assignedCodeType : null,
      membersStatus: members.map(m => ({
        fullName: m.fullName,
        isLeader: !!m.isLeader,
        hasJoined: m.deviceToken !== null
      }))
    };
  }

  validateSubmission(team, rawInput, notebookFragments) {
    const members = this.repos.members.getByTeamId(team.id);
    const totalMembers = members.length;
    const joinedCount = members.filter(m => m.deviceToken !== null).length;

    // Multi-device verification: ALL registered members (3 or 4) must have joined on separate devices
    if (joinedCount < totalMembers) {
      throw {
        status: 400,
        message: `Waiting for all squad operatives to join on separate devices (${joinedCount}/${totalMembers} joined). Every member must retrieve their code from their own device.`
      };
    }

    const memberCodes = members.map(m => m.assignedShard);
    const expectedAnswer = this.deriveFinalAnswer(team.name, memberCodes, notebookFragments);

    const isCorrect = norm(rawInput) === norm(expectedAnswer);
    return {
      isCorrect,
      expectedAnswer,
      finished: isCorrect
    };
  }
}

module.exports = Stage5Service;
