const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const fs = require('fs');

class AccountService {
  /**
   * Create a new test account.
   */
  create(accountData) {
    const db = getDb();
    const id = accountData.id || uuidv4();
    const stmt = db.prepare(`
      INSERT INTO accounts (id, platform, account_type, account_name, account_handle,
        environment, owner, status, connection_status, connected_assets, permissions,
        credential_ref_id, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      accountData.platform,
      accountData.account_type || 'personal',
      accountData.account_name,
      accountData.account_handle || null,
      accountData.environment || 'test',
      accountData.owner || 'qa-team',
      accountData.status || 'active',
      accountData.connection_status || 'disconnected',
      JSON.stringify(accountData.connected_assets || []),
      JSON.stringify(accountData.permissions || []),
      accountData.credential_ref_id || null,
      accountData.notes || ''
    );

    return this.getById(id);
  }

  /**
   * Get a single account by ID.
   */
  getById(id) {
    const db = getDb();
    const row = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
    return row ? this._parseAccount(row) : null;
  }

  /**
   * Get all accounts, with optional filters.
   */
  getAll(filters = {}) {
    const db = getDb();
    let query = 'SELECT * FROM accounts WHERE 1=1';
    const params = [];

    if (filters.platform) {
      query += ' AND platform = ?';
      params.push(filters.platform);
    }
    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters.connection_status) {
      query += ' AND connection_status = ?';
      params.push(filters.connection_status);
    }
    if (filters.environment) {
      query += ' AND environment = ?';
      params.push(filters.environment);
    }

    query += ' ORDER BY platform, account_name';
    const rows = db.prepare(query).all(...params);
    return rows.map(r => this._parseAccount(r));
  }

  /**
   * Update an existing account.
   */
  update(id, updates) {
    const db = getDb();
    const account = this.getById(id);
    if (!account) return null;

    const fields = [];
    const values = [];

    const allowedFields = [
      'platform', 'account_type', 'account_name', 'account_handle',
      'environment', 'owner', 'status', 'connection_status',
      'connected_assets', 'permissions', 'credential_ref_id', 'notes',
      'last_health_check'
    ];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        const value = ['connected_assets', 'permissions'].includes(field)
          ? JSON.stringify(updates[field])
          : updates[field];
        fields.push(`${field} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) return account;

    fields.push("updated_at = datetime('now')");
    values.push(id);

    db.prepare(`UPDATE accounts SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return this.getById(id);
  }

  /**
   * Delete an account.
   */
  delete(id) {
    const db = getDb();
    const result = db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
    return result.changes > 0;
  }

  /**
   * Bulk import accounts from an array.
   * @param {Array} accounts
   * @param {{ skipExisting?: boolean }} [options] - When true, accounts whose id
   *   already exists are counted as skipped instead of reported as errors.
   */
  bulkImport(accounts, { skipExisting = false } = {}) {
    const db = getDb();
    const results = { created: 0, skipped: 0, errors: [] };

    const insertMany = db.transaction((items) => {
      for (const item of items) {
        if (skipExisting && item.id && this.getById(item.id)) {
          results.skipped++;
          continue;
        }
        try {
          this.create(item);
          results.created++;
        } catch (err) {
          results.errors.push({ account: item.account_name, error: err.message });
        }
      }
    });

    insertMany(accounts);
    return results;
  }

  /**
   * Import accounts from a CSV file.
   * Expected columns: id,platform,account_type,account_name,account_handle,
   *   environment,owner,status,connection_status,connected_assets,permissions,
   *   credential_ref_id,notes
   *
   * @param {string} csvPath - Path to the CSV file.
   * @returns {{ created: number, errors: Array }}
   */
  importFromCsv(csvPath) {
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());

    if (lines.length < 2) {
      return { created: 0, errors: [{ row: 0, error: 'CSV file is empty or has no data rows' }] };
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const accounts = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this._parseCsvLine(lines[i]);
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] ? values[idx].trim() : '';
      });

      // Parse JSON fields from CSV strings
      if (row.connected_assets) {
        try { row.connected_assets = JSON.parse(row.connected_assets); } catch { row.connected_assets = row.connected_assets.split(';').filter(Boolean); }
      }
      if (row.permissions) {
        try { row.permissions = JSON.parse(row.permissions); } catch { row.permissions = row.permissions.split(';').filter(Boolean); }
      }

      accounts.push(row);
    }

    return this.bulkImport(accounts);
  }

  /**
   * Parse a CSV line, respecting quoted fields that may contain commas.
   */
  _parseCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  }

  /**
   * Get account counts grouped by platform.
   */
  getCountsByPlatform() {
    const db = getDb();
    return db.prepare(`
      SELECT platform, COUNT(*) as count,
        SUM(CASE WHEN connection_status = 'connected' THEN 1 ELSE 0 END) as connected,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active
      FROM accounts GROUP BY platform
    `).all();
  }

  /**
   * Parse JSON fields in a raw database row.
   */
  _parseAccount(row) {
    return {
      ...row,
      connected_assets: JSON.parse(row.connected_assets || '[]'),
      permissions: JSON.parse(row.permissions || '[]')
    };
  }
}

module.exports = new AccountService();
