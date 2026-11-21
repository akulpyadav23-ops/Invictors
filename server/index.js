const os = require('os');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const app = require('./app');
const { runMigrations } = require('./migrations/runner');
const logger = require('./lib/logger');
const { getDb } = require('./repositories/sqlite/dbConnection');

// Run database migrations on startup
runMigrations();

// Helper to find LAN IPv4 address
function getLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const PORT = config.PORT || 3000;
const HOST = config.HOST || '0.0.0.0';

let server = null;
let backupInterval = null;

if (!process.env.VERCEL) {
  server = app.listen(PORT, HOST, () => {
    const lanIp = getLanIp();
    console.log('====================================================');
    console.log('  ⚡ FINAL OVERRIDE — INVICTORS CLUB MISSION SYSTEM ⚡');
    console.log('====================================================');
    console.log(`  Local:        http://localhost:${PORT}`);
    console.log(`  LAN URL:      http://${lanIp}:${PORT}`);
    console.log(`  Coordinator:  http://${lanIp}:${PORT}/coordinator`);
    console.log(`  Admin Panel:  http://${lanIp}:${PORT}/admin`);
    console.log(`  Leaderboard:  http://${lanIp}:${PORT}/leaderboard`);
    console.log('====================================================');

    // Startup consistency check (Phase 3.D)
    runStartupConsistencyCheck();

    // Background automatic SQLite backup every 5 minutes (Phase 3.F)
    startBackupTimer();
  });
}

function runStartupConsistencyCheck() {
  try {
    const db = getDb();
    const brokenTeams = db.prepare(`
      SELECT t.id, t.name, t.stage, COUNT(p.stage) as progressCount
      FROM teams t
      LEFT JOIN progress p ON t.id = p.teamId
      GROUP BY t.id
      HAVING progressCount < 5
    `).all();

    if (brokenTeams && brokenTeams.length > 0) {
      logger.warn('Consistency check warning: Teams found with missing stage progress rows', { brokenTeams });
    }
  } catch (err) {
    logger.error('Startup consistency check error:', { error: err.message });
  }
}

function startBackupTimer() {
  const db = getDb();
  if (db.dbPath === ':memory:') return;

  const backupDir = path.join(__dirname, '..', 'data', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  backupInterval = setInterval(() => {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(backupDir, `final_override-${timestamp}.db`);

      if (fs.existsSync(db.dbPath)) {
        fs.copyFileSync(db.dbPath, backupPath);

        // Keep last 20 backups
        const files = fs.readdirSync(backupDir)
          .filter(f => f.startsWith('final_override-') && f.endsWith('.db'))
          .sort();

        while (files.length > 20) {
          const oldest = files.shift();
          try { fs.unlinkSync(path.join(backupDir, oldest)); } catch (_) {}
        }
      }
    } catch (err) {
      logger.error('Scheduled backup failed:', { error: err.message });
    }
  }, 5 * 60 * 1000); // Every 5 minutes
}

// Graceful shutdown handling (Phase 3.D)
function handleShutdown(signal) {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  if (backupInterval) clearInterval(backupInterval);

  if (server) {
    server.close(() => {
      try {
        const db = getDb();
        db.close();
      } catch (_) {}
      logger.info('Closed database connection and HTTP server. Process exited.');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }

  // Force close if still hanging after 5s
  setTimeout(() => {
    process.exit(1);
  }, 5000);
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

module.exports = process.env.VERCEL ? app : { app, server };
