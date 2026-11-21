// Inactive Supabase adapter stub (A7 / Phase 9)
// Never loaded unless DB_PROVIDER="supabase"

class SupabaseStub {
  constructor() {
    throw new Error('Supabase adapter is an inactive stub and is not enabled. Use DB_PROVIDER=sqlite.');
  }

  /*
   * Planned method mappings for future Supabase integration:
   * - getTeamById(id) -> supabase.from('teams').select('*').eq('id', id).maybeSingle()
   * - getTeamByToken(token) -> supabase.from('teams').select('*').eq('sessionToken', token).maybeSingle()
   * - createTeam(...) -> supabase.from('teams').insert(...)
   * - updateTeam(...) -> supabase.from('teams').update(...)
   */
}

module.exports = SupabaseStub;
