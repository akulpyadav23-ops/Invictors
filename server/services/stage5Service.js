// Stage 5 Service: Multi-Device Team Sync
// Requires all registered squad operatives (3 or 4) to join from distinct devices.
// Assembles team code from operatives' shards ordered by sorted normalized name.
// Solved team code forms notebook Fragment 5 for Stage 6.

const { getMission } = require('../content/loader');
const { norm } = require('../lib/hmac');

class Stage5Service {
  constructor(repos) {
    this.repos = repos;
    this.mission = getMission();
  }

  // Assembles team code from operative shards sorted alphabetically by normalized full name
  computeTeamCode(members) {
    const sorted = [...members].sort((a, b) => norm(a.fullName).localeCompare(norm(b.fullName)));
    return sorted.map((m) => m.assignedShard).join('-');
  }

  getStatePayload(team, currentMemberToken = null) {
    const stage5Config = this.mission.stages['5'];
    const members = this.repos.members.getByTeamId(team.id);
    const totalMembers = members.length;

    // Joined operatives: operatives with an active deviceToken
    const joinedMembers = members.filter((m) => m.deviceToken !== null);
    const joinedCount = joinedMembers.length;

    // Find current member viewing this screen
    let currentOperative = null;
    if (currentMemberToken) {
      currentOperative = members.find((m) => m.deviceToken === currentMemberToken);
    } else {
      // Leader device
      currentOperative = members.find((m) => m.isLeader === 1);
    }

    return {
      totalMembers,
      joinedCount,
      allJoined: joinedCount >= totalMembers,
      instruction: stage5Config.instruction,
      currentMemberCode: currentOperative ? currentOperative.assignedShard : null,
      currentMemberCodeType: currentOperative ? currentOperative.assignedCodeType : null,
      membersStatus: members.map((m) => ({
        fullName: m.fullName,
        isLeader: !!m.isLeader,
        hasJoined: m.deviceToken !== null
      }))
    };
  }

  validateSubmission(team, rawInput) {
    const members = this.repos.members.getByTeamId(team.id);
    const totalMembers = members.length;
    const joinedCount = members.filter((m) => m.deviceToken !== null).length;

    // Multi-device verification: ALL registered squad members must join on separate devices
    if (joinedCount < totalMembers) {
      throw {
        status: 400,
        message: `Waiting for all squad operatives to join on separate devices (${joinedCount}/${totalMembers} joined). Every member must retrieve their code from their own device.`
      };
    }

    const expectedTeamCode = this.computeTeamCode(members);
    const isCorrect = norm(rawInput) === norm(expectedTeamCode);

    return {
      isCorrect,
      expectedTeamCode,
      fragment: isCorrect ? expectedTeamCode : null
    };
  }
}

module.exports = Stage5Service;
