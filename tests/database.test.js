const path = require('path');
const fs = require('fs');
const { getDb, closeDb, resetDb } = require('../src/db/database');

const TEST_DB = path.join(__dirname, 'test_db.db');

beforeEach(() => {
  resetDb();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
});

afterEach(() => {
  closeDb();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  // Clean up WAL files
  if (fs.existsSync(TEST_DB + '-wal')) fs.unlinkSync(TEST_DB + '-wal');
  if (fs.existsSync(TEST_DB + '-shm')) fs.unlinkSync(TEST_DB + '-shm');
});

describe('Database', () => {
  test('should initialize database and create tables', () => {
    const db = getDb(TEST_DB);
    expect(db).toBeDefined();

    // Check that all tables exist
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map(t => t.name);

    expect(tables).toContain('accounts');
    expect(tables).toContain('health_checks');
    expect(tables).toContain('maintenance_log');
    expect(tables).toContain('issues');
  });

  test('should return the same instance on multiple calls', () => {
    const db1 = getDb(TEST_DB);
    const db2 = getDb(TEST_DB);
    expect(db1).toBe(db2);
  });

  test('should enforce foreign keys', () => {
    const db = getDb(TEST_DB);
    const fkResult = db.pragma('foreign_keys');
    expect(fkResult[0].foreign_keys).toBe(1);
  });

  test('should validate platform constraint on accounts', () => {
    const db = getDb(TEST_DB);
    expect(() => {
      db.prepare(`
        INSERT INTO accounts (id, platform, account_type, account_name)
        VALUES ('test', 'invalid_platform', 'personal', 'Test')
      `).run();
    }).toThrow();
  });

  test('should validate status constraint on accounts', () => {
    const db = getDb(TEST_DB);
    expect(() => {
      db.prepare(`
        INSERT INTO accounts (id, platform, account_type, account_name, status)
        VALUES ('test', 'linkedin', 'personal', 'Test', 'invalid_status')
      `).run();
    }).toThrow();
  });
});
