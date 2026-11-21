const { getDb } = require('../db/database');

class MaintenanceLogService {
  /**
   * Add a maintenance log entry.
   */
  add(entry) {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO maintenance_log (day_number, log_date, category, account_id, description, action_taken, outcome)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      entry.day_number,
      entry.log_date || new Date().toISOString().split('T')[0],
      entry.category,
      entry.account_id || null,
      entry.description,
      entry.action_taken || null,
      entry.outcome || null
    );
  }

  /**
   * Get log entries for a specific day.
   */
  getByDay(dayNumber) {
    const db = getDb();
    return db.prepare(`
      SELECT ml.*, a.account_name, a.platform
      FROM maintenance_log ml
      LEFT JOIN accounts a ON ml.account_id = a.id
      WHERE ml.day_number = ?
      ORDER BY ml.created_at
    `).all(dayNumber);
  }

  /**
   * Get all log entries.
   */
  getAll() {
    const db = getDb();
    return db.prepare(`
      SELECT ml.*, a.account_name, a.platform
      FROM maintenance_log ml
      LEFT JOIN accounts a ON ml.account_id = a.id
      ORDER BY ml.day_number, ml.created_at
    `).all();
  }

  /**
   * Auto-generate maintenance log entries from health check results.
   */
  generateFromHealthCheck(dayNumber, healthCheckSummary, logDate) {
    const date = logDate || new Date().toISOString().split('T')[0];

    // Log successful connections
    const healthy = healthCheckSummary.results.filter(
      r => r.connection_status === 'connected' && r.errors.length === 0
    );
    if (healthy.length > 0) {
      this.add({
        day_number: dayNumber,
        log_date: date,
        category: 'connection',
        description: `${healthy.length} of ${healthCheckSummary.total} accounts passed health check with no issues.`,
        outcome: 'success'
      });
    }

    // Log failures
    const failed = healthCheckSummary.results.filter(r => r.errors.length > 0);
    for (const failure of failed) {
      this.add({
        day_number: dayNumber,
        log_date: date,
        category: 'failure',
        account_id: failure.account_id,
        description: `Health check failed: ${failure.errors.join('; ')}`,
        action_taken: 'Issue auto-created for investigation',
        outcome: 'requires_attention'
      });
    }

    // Log warnings
    const warned = healthCheckSummary.results.filter(
      r => r.warnings.length > 0 && r.errors.length === 0
    );
    for (const warn of warned) {
      const category = warn.warnings.some(w => w.toLowerCase().includes('token') || w.toLowerCase().includes('expir'))
        ? 'token_refresh'
        : warn.warnings.some(w => w.toLowerCase().includes('permission'))
          ? 'permission_change'
          : warn.warnings.some(w => w.toLowerCase().includes('flagged') || w.toLowerCase().includes('restrict'))
            ? 'restriction'
            : 'observation';

      this.add({
        day_number: dayNumber,
        log_date: date,
        category,
        account_id: warn.account_id,
        description: `Warning detected: ${warn.warnings.join('; ')}`,
        action_taken: 'Monitoring - no immediate action required',
        outcome: 'monitoring'
      });
    }
  }
}

module.exports = new MaintenanceLogService();
