/**
 * Safe Database Seed Script
 * Pre-populates sample teams and settings for tournament demo / coordinator testing.
 */

require('dotenv').config();
const { getRepositories } = require('../server/repositories');
const { runMigrations } = require('../server/migrations/runner');
const TeamService = require('../server/services/teamService');

async function seed() {
  console.log('🌱 Running migrations and seeding sample tournament data...');
  runMigrations();

  const repos = getRepositories();
  const teamService = new TeamService(repos);

  // Set event settings
  repos.settings.set('startTogetherMode', 'false');
  repos.settings.set('allowNewTeams', 'true');
  repos.settings.set('gameStarted', 'true');

  const sampleTeams = [
    {
      teamName: 'CyberKnights',
      coordinator: 'Prof. Sharma',
      member1: 'Aditya Rao',
      member2: 'Bhavana K',
      member3: 'Chetan M'
    },
    {
      teamName: 'NullPointers',
      coordinator: 'Prof. Sharma',
      member1: 'Deepak S',
      member2: 'Esha Gupta',
      member3: 'Farhan Ali',
      member4: 'Gauri P'
    },
    {
      teamName: 'ShadowOps',
      coordinator: 'Dr. Suresh',
      member1: 'Harish V',
      member2: 'Ishita N',
      member3: 'Jatin D'
    }
  ];

  for (const t of sampleTeams) {
    try {
      const res = await teamService.registerTeam(t);
      console.log(`✅ Seeded team: ${res.team.name} (ID: ${res.team.id}, Members: ${res.team.memberCount})`);
    } catch (err) {
      if (err.message && err.message.includes('already taken')) {
        console.log(`ℹ️  Team ${t.teamName} already exists, skipping.`);
      } else {
        console.error(`❌ Failed to seed team ${t.teamName}:`, err.message);
      }
    }
  }

  console.log('🎉 Tournament data seed completed successfully.');
}

seed().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
