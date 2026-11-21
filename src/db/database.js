const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { SCHEMA } = require('./schema');

let db = null;

/**
 * Initialize and return the SQLite database connection.
 * Creates the data directory and tables if they don't exist.
 */
function getDb(dbPath) {
  if (db) return db;

  const resolvedPath = dbPath || process.env.DB_PATH || './data/spikerz_qa.db';
  const dir = path.dirname(resolvedPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);

  return db;
}

/**
 * Close the database connection.
 */
function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Reset database connection (useful for testing).
 */
function resetDb() {
  db = null;
}

module.exports = { getDb, closeDb, resetDb };
