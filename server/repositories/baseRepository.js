/**
 * @typedef {Object} BaseRepository
 * Common repository contract for all database adapters (SQLite, Supabase, Firebase)
 */

class BaseRepository {
  constructor(name) {
    this.name = name;
  }
}

module.exports = BaseRepository;
