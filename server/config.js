const dotenv = require('dotenv');
dotenv.config();

const DEFAULT_COORDINATOR_PINS = {
  'tanu': '2042',
  'surabhi': '2043',
  'abhivishnu': '2044',
  'chandrashekar': '2045',
  'thrisha': '2046',
  'akul p yadav': '7090',
  'gagan s urs': '9108',
  'anish s kumar': '7975',
  'm punya sagar': '2033',
  'mn shashank': '2034',
  'dhanush kp': '2035',
  'ayush p': '2036',
  'skanda': '2037',
  'vishnuvardhan': '2038',
  'vandhana v': '2039',
  'abhiram bs': '2040',
  'harshil': '2041',
  'arun': '1111',
  'divya': '2222',
  'kiran': '3333',
  'pooja': '4444',
  'rakshith': '5555'
};

// Parse any custom env overrides (format: "Name1:Pin1,Name2:Pin2")
function parseCoordinatorPins() {
  const map = { ...DEFAULT_COORDINATOR_PINS };
  if (process.env.COORDINATOR_PINS) {
    process.env.COORDINATOR_PINS.split(',').forEach(entry => {
      const parts = entry.split(':');
      if (parts.length === 2) {
        map[parts[0].trim().toLowerCase()] = parts[1].trim();
      }
    });
  }
  return map;
}

const coordinatorPinsMap = parseCoordinatorPins();

module.exports = {
  PORT: parseInt(process.env.PORT, 10) || 3000,
  ADMIN_PIN: process.env.ADMIN_PIN || 'INVICTORS@23',
  COORDINATORS: (process.env.COORDINATORS || 'Tanu,Surabhi,Abhivishnu,Chandrashekar,Thrisha,Arun,Divya,Kiran,Pooja,Rakshith,Akul P Yadav,Gagan S Urs,M Punya Sagar,MN Shashank,Dhanush KP,Anish S Kumar,Ayush P,Skanda,Vishnuvardhan,Vandhana V,Abhiram BS,Harshil')
    .split(',')
    .map(c => c.trim())
    .filter(Boolean),
  COORDINATOR_PINS: coordinatorPinsMap,
  verifyCoordinatorPin(name, pin) {
    if (!name || !pin) return false;
    const expected = coordinatorPinsMap[name.trim().toLowerCase()];
    if (!expected) return false;
    return String(expected).trim() === String(pin).trim();
  },
  ADMIN_SESSION_LIMIT: parseInt(process.env.ADMIN_SESSION_LIMIT, 10) || 2,
  TIME_CAP_MINUTES: parseInt(process.env.TIME_CAP_MINUTES, 10) || 90,
  EVENT_SALT: process.env.EVENT_SALT || 'invictors_final_override_salt_2026',
  ALLOW_NEW_TEAMS: process.env.ALLOW_NEW_TEAMS === 'true',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  WARDEN_SECRETS: {
    REAL: process.env.WARDEN_REAL || 'ORBIT',
    DECOY: process.env.WARDEN_DECOY || 'ZETA9',
    ACCESS: process.env.WARDEN_ACCESS || 'AURORA'
  }
};
