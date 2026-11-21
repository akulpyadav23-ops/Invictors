// Inactive Firebase adapter stub (A7 / Phase 9)
// Never loaded unless DB_PROVIDER="firebase"

class FirebaseStub {
  constructor() {
    throw new Error('Firebase adapter is an inactive stub and is not enabled. Use DB_PROVIDER=sqlite.');
  }

  /*
   * Planned method mappings for future Firestore integration:
   * - getTeamById(id) -> firestore.collection('teams').doc(id).get()
   * - getTeamByToken(token) -> firestore.collection('teams').where('sessionToken', '==', token).limit(1).get()
   * - createTeam(...) -> firestore.collection('teams').doc(team.id).set(...)
   */
}

module.exports = FirebaseStub;
