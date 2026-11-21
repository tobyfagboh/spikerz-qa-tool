const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');

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
   */
  bulkImport(accounts) {
    const db = getDb();
    const results = { created: 0, errors: [] };

    const insertMany = db.transaction((items) => {
      for (const item of items) {
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
