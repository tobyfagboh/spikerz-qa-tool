const { getDb } = require('../db/database');
const accountService = require('./accountService');

/**
 * Platform-specific mock health check simulators.
 * In production, these would make real API calls to each platform.
 * For this assessment, they simulate realistic scenarios including
 * intermittent failures, token expiry, and permission changes.
 */
const PLATFORM_CHECKS = {
  linkedin: {
    checkConnection: (account, dayNumber) => {
      // Simulate: LinkedIn tokens expire after 60 days; occasional rate limits
      if (dayNumber === 4 && account.account_name.includes('LI-03')) {
        return { connected: false, reason: 'Token expired - requires re-authentication' };
      }
      if (dayNumber === 3 && Math.random() < 0.15) {
        return { connected: true, warning: 'Rate limit approaching (80% of daily quota)' };
      }
      return { connected: true };
    },
    checkPermissions: (account, dayNumber) => {
      const basePerms = ['r_liteprofile', 'r_emailaddress', 'w_member_social'];
      if (dayNumber === 4 && account.account_name.includes('LI-03')) {
        return { status: 'revoked', permissions: [], reason: 'Token expired' };
      }
      return { status: 'ok', permissions: basePerms };
    }
  },

  facebook: {
    checkConnection: (account, dayNumber) => {
      // Simulate: Facebook may restrict test accounts; session timeout
      if (dayNumber === 3 && account.account_name.includes('FB-02')) {
        return { connected: false, reason: 'Session expired - Graph API returned error 190' };
      }
      if (dayNumber === 5 && account.account_type === 'page') {
        return { connected: true, warning: 'Page access token nearing expiry (2 days remaining)' };
      }
      return { connected: true };
    },
    checkPermissions: (account, dayNumber) => {
      const basePerms = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'];
      if (dayNumber === 3 && account.account_name.includes('FB-02')) {
        return { status: 'revoked', permissions: [], reason: 'Session expired' };
      }
      return { status: 'ok', permissions: basePerms };
    }
  },

  instagram: {
    checkConnection: (account, dayNumber) => {
      // Simulate: Instagram API rate limits and business account verification
      if (dayNumber === 2 && account.account_name.includes('IG-01')) {
        return { connected: true, warning: 'API rate limit hit - 429 response (retry after 300s)' };
      }
      return { connected: true };
    },
    checkPermissions: (account, dayNumber) => {
      const basePerms = ['instagram_basic', 'instagram_content_publish', 'instagram_manage_insights'];
      return { status: 'ok', permissions: basePerms };
    }
  },

  tiktok: {
    checkConnection: (account, dayNumber) => {
      // Simulate: TikTok sandbox limitations and quota resets
      if (dayNumber === 2 && account.account_name.includes('TT-02')) {
        return { connected: false, reason: 'Sandbox account quota exceeded - daily API limit reached' };
      }
      if (dayNumber === 5 && account.account_name.includes('TT-03')) {
        return { connected: true, warning: 'Account flagged for review - automated activity detected' };
      }
      return { connected: true };
    },
    checkPermissions: (account, dayNumber) => {
      const basePerms = ['user.info.basic', 'video.list', 'video.publish'];
      if (dayNumber === 2 && account.account_name.includes('TT-02')) {
        return { status: 'partial', permissions: ['user.info.basic'], reason: 'Quota exceeded - write perms suspended' };
      }
      return { status: 'ok', permissions: basePerms };
    }
  },

  x: {
    checkConnection: (account, dayNumber) => {
      // Simulate: X/Twitter API v2 rate limits and app-level restrictions
      if (dayNumber === 4 && account.account_name.includes('X-01')) {
        return { connected: true, warning: 'App-level rate limit at 90% - consider spacing requests' };
      }
      return { connected: true };
    },
    checkPermissions: (account, dayNumber) => {
      const basePerms = ['tweet.read', 'tweet.write', 'users.read'];
      return { status: 'ok', permissions: basePerms };
    }
  }
};

class HealthCheckService {
  /**
   * Run health checks for all accounts.
   * @param {number} dayNumber - The day of the 5-day monitoring period (1-5).
   * @param {string} [checkTimestamp] - Optional override timestamp for simulation.
   */
  runAll(dayNumber, checkTimestamp) {
    const accounts = accountService.getAll();
    const results = [];
    const timestamp = checkTimestamp || new Date().toISOString();

    for (const account of accounts) {
      const result = this.checkAccount(account, dayNumber, timestamp);
      results.push(result);
    }

    return {
      day: dayNumber,
      timestamp,
      total: results.length,
      healthy: results.filter(r => r.connection_status === 'connected' && r.permission_status === 'ok').length,
      warnings: results.filter(r => r.warnings.length > 0).length,
      errors: results.filter(r => r.errors.length > 0).length,
      results
    };
  }

  /**
   * Run a health check on a single account.
   */
  checkAccount(account, dayNumber, timestamp) {
    const db = getDb();
    const platform = account.platform;
    const checker = PLATFORM_CHECKS[platform];
    const errors = [];
    const warnings = [];
    const startTime = Date.now();

    // Check connection
    const connResult = checker.checkConnection(account, dayNumber);
    const connectionStatus = connResult.connected ? 'connected' : 'disconnected';
    if (!connResult.connected) {
      errors.push(connResult.reason || 'Connection failed');
    }
    if (connResult.warning) {
      warnings.push(connResult.warning);
    }

    // Check permissions
    const permResult = checker.checkPermissions(account, dayNumber);
    const permissionStatus = permResult.status;
    if (permResult.status === 'revoked') {
      errors.push(`Permissions revoked: ${permResult.reason || 'unknown reason'}`);
    } else if (permResult.status === 'partial') {
      warnings.push(`Partial permissions: ${permResult.reason || 'some permissions missing'}`);
    }

    // Determine token validity
    let tokenValidity = 'valid';
    if (errors.some(e => e.toLowerCase().includes('token') || e.toLowerCase().includes('expired'))) {
      tokenValidity = 'expired';
    } else if (warnings.some(w => w.toLowerCase().includes('expir'))) {
      tokenValidity = 'expiring_soon';
    }

    // Determine account status based on check results
    let accountStatus = account.status;
    if (errors.some(e => e.toLowerCase().includes('restricted') || e.toLowerCase().includes('flagged'))) {
      accountStatus = 'restricted';
    }
    if (warnings.some(w => w.toLowerCase().includes('flagged'))) {
      accountStatus = 'restricted';
    }

    const responseTime = Date.now() - startTime + Math.floor(Math.random() * 200) + 50; // simulated latency

    // Save health check result
    const checkResult = {
      account_id: account.id,
      check_timestamp: timestamp,
      day_number: dayNumber,
      account_status: accountStatus,
      connection_status: connectionStatus,
      token_validity: tokenValidity,
      connected_assets: JSON.stringify(account.connected_assets),
      permission_status: permissionStatus,
      errors: JSON.stringify(errors),
      warnings: JSON.stringify(warnings),
      response_time_ms: responseTime,
      raw_response: JSON.stringify({ connection: connResult, permissions: permResult })
    };

    db.prepare(`
      INSERT INTO health_checks (account_id, check_timestamp, day_number, account_status,
        connection_status, token_validity, connected_assets, permission_status,
        errors, warnings, response_time_ms, raw_response)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      checkResult.account_id, checkResult.check_timestamp, checkResult.day_number,
      checkResult.account_status, checkResult.connection_status, checkResult.token_validity,
      checkResult.connected_assets, checkResult.permission_status,
      checkResult.errors, checkResult.warnings, checkResult.response_time_ms,
      checkResult.raw_response
    );

    // Update account record
    accountService.update(account.id, {
      status: accountStatus,
      connection_status: connectionStatus,
      permissions: permResult.permissions,
      last_health_check: timestamp
    });

    // Auto-create issues for errors
    if (errors.length > 0) {
      this._createIssue(account, errors, dayNumber);
    }

    return {
      account_id: account.id,
      account_name: account.account_name,
      platform: account.platform,
      account_status: accountStatus,
      connection_status: connectionStatus,
      token_validity: tokenValidity,
      permission_status: permissionStatus,
      errors,
      warnings,
      response_time_ms: responseTime
    };
  }

  /**
   * Auto-create an issue when health check detects errors.
   */
  _createIssue(account, errors, dayNumber) {
    const db = getDb();
    const errorText = errors.join('; ');
    const severity = errorText.toLowerCase().includes('expired') || errorText.toLowerCase().includes('revoked')
      ? 'high'
      : errorText.toLowerCase().includes('quota') || errorText.toLowerCase().includes('rate limit')
        ? 'medium'
        : 'high';

    db.prepare(`
      INSERT INTO issues (account_id, title, severity, description, reproduction_steps, recommended_action)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      account.id,
      `[Day ${dayNumber}] ${account.platform.toUpperCase()} - ${account.account_name}: ${errorText.substring(0, 80)}`,
      severity,
      `Health check on Day ${dayNumber} detected the following error(s) for ${account.account_name} (${account.platform}):\n\n${errorText}`,
      `1. Navigate to Spikerz QA Dashboard\n2. View account ${account.account_name}\n3. Run health check\n4. Observe error: ${errorText}`,
      this._getRecommendedAction(errorText)
    );
  }

  /**
   * Get recommended action based on error type.
   */
  _getRecommendedAction(errorText) {
    const lower = errorText.toLowerCase();
    if (lower.includes('token expired') || lower.includes('session expired')) {
      return 'Re-authenticate the account through the Spikerz UI. Navigate to Settings > Connected Accounts, remove the expired connection, and re-authorize with fresh credentials.';
    }
    if (lower.includes('quota') || lower.includes('rate limit')) {
      return 'Wait for quota reset (usually 24 hours). Consider spacing out API requests or reducing check frequency for this platform.';
    }
    if (lower.includes('restricted') || lower.includes('flagged')) {
      return 'Review account activity for policy violations. Contact platform support if the restriction appears incorrect. Consider using a different test account.';
    }
    return 'Investigate the error, check platform status page, and retry the connection. If persistent, escalate to the engineering team.';
  }

  /**
   * Get health check history for an account.
   */
  getHistory(accountId) {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM health_checks WHERE account_id = ? ORDER BY check_timestamp DESC
    `).all(accountId);

    return rows.map(r => ({
      ...r,
      errors: JSON.parse(r.errors || '[]'),
      warnings: JSON.parse(r.warnings || '[]'),
      connected_assets: JSON.parse(r.connected_assets || '[]')
    }));
  }

  /**
   * Get all health checks for a specific day.
   */
  getByDay(dayNumber) {
    const db = getDb();
    const rows = db.prepare(`
      SELECT hc.*, a.account_name, a.platform
      FROM health_checks hc
      JOIN accounts a ON hc.account_id = a.id
      WHERE hc.day_number = ?
      ORDER BY a.platform, a.account_name
    `).all(dayNumber);

    return rows.map(r => ({
      ...r,
      errors: JSON.parse(r.errors || '[]'),
      warnings: JSON.parse(r.warnings || '[]'),
      connected_assets: JSON.parse(r.connected_assets || '[]')
    }));
  }

  /**
   * Get all issues.
   */
  getIssues(filters = {}) {
    const db = getDb();
    let query = 'SELECT i.*, a.account_name, a.platform FROM issues i LEFT JOIN accounts a ON i.account_id = a.id WHERE 1=1';
    const params = [];

    if (filters.severity) {
      query += ' AND i.severity = ?';
      params.push(filters.severity);
    }
    if (filters.status) {
      query += ' AND i.status = ?';
      params.push(filters.status);
    }

    query += ' ORDER BY i.created_at DESC';
    return db.prepare(query).all(...params);
  }
}

module.exports = new HealthCheckService();
