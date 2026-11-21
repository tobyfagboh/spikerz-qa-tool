const { getDb } = require('../db/database');
const fs = require('fs');
const path = require('path');

class ReportService {
  /**
   * Generate a daily health check report.
   */
  generateDailyReport(dayNumber, format = 'json') {
    const db = getDb();
    const checks = db.prepare(`
      SELECT hc.*, a.account_name, a.platform, a.account_type
      FROM health_checks hc
      JOIN accounts a ON hc.account_id = a.id
      WHERE hc.day_number = ?
      ORDER BY a.platform, a.account_name
    `).all(dayNumber);

    const issues = db.prepare(`
      SELECT i.*, a.account_name, a.platform
      FROM issues i
      LEFT JOIN accounts a ON i.account_id = a.id
      WHERE i.title LIKE ?
    `).all(`%Day ${dayNumber}%`);

    const logs = db.prepare(`
      SELECT ml.*, a.account_name, a.platform
      FROM maintenance_log ml
      LEFT JOIN accounts a ON ml.account_id = a.id
      WHERE ml.day_number = ?
      ORDER BY ml.created_at
    `).all(dayNumber);

    const report = {
      title: `Spikerz QA Health Check Report - Day ${dayNumber}`,
      generated_at: new Date().toISOString(),
      day_number: dayNumber,
      summary: {
        total_accounts: checks.length,
        connected: checks.filter(c => c.connection_status === 'connected').length,
        disconnected: checks.filter(c => c.connection_status !== 'connected').length,
        tokens_valid: checks.filter(c => c.token_validity === 'valid').length,
        tokens_expiring: checks.filter(c => c.token_validity === 'expiring_soon').length,
        tokens_expired: checks.filter(c => c.token_validity === 'expired').length,
        permissions_ok: checks.filter(c => c.permission_status === 'ok').length,
        permissions_issues: checks.filter(c => c.permission_status !== 'ok').length,
        total_errors: checks.reduce((sum, c) => sum + JSON.parse(c.errors || '[]').length, 0),
        total_warnings: checks.reduce((sum, c) => sum + JSON.parse(c.warnings || '[]').length, 0),
        avg_response_time_ms: Math.round(checks.reduce((sum, c) => sum + (c.response_time_ms || 0), 0) / (checks.length || 1)),
        issues_created: issues.length
      },
      by_platform: this._groupByPlatform(checks),
      checks: checks.map(c => ({
        ...c,
        errors: JSON.parse(c.errors || '[]'),
        warnings: JSON.parse(c.warnings || '[]'),
        connected_assets: JSON.parse(c.connected_assets || '[]')
      })),
      issues,
      maintenance_log: logs
    };

    return this._formatReport(report, format, `day_${dayNumber}_report`);
  }

  /**
   * Generate the final 5-day summary report.
   */
  generateFinalReport(format = 'json') {
    const db = getDb();
    const allChecks = db.prepare(`
      SELECT hc.*, a.account_name, a.platform, a.account_type
      FROM health_checks hc
      JOIN accounts a ON hc.account_id = a.id
      ORDER BY hc.day_number, a.platform, a.account_name
    `).all();

    const allIssues = db.prepare(`
      SELECT i.*, a.account_name, a.platform
      FROM issues i
      LEFT JOIN accounts a ON i.account_id = a.id
      ORDER BY i.created_at
    `).all();

    const allLogs = db.prepare(`
      SELECT ml.*, a.account_name, a.platform
      FROM maintenance_log ml
      LEFT JOIN accounts a ON ml.account_id = a.id
      ORDER BY ml.day_number, ml.created_at
    `).all();

    const accounts = db.prepare('SELECT * FROM accounts ORDER BY platform, account_name').all();

    const dailySummaries = [];
    for (let day = 1; day <= 5; day++) {
      const dayChecks = allChecks.filter(c => c.day_number === day);
      if (dayChecks.length === 0) continue;
      dailySummaries.push({
        day,
        total: dayChecks.length,
        connected: dayChecks.filter(c => c.connection_status === 'connected').length,
        errors: dayChecks.reduce((sum, c) => sum + JSON.parse(c.errors || '[]').length, 0),
        warnings: dayChecks.reduce((sum, c) => sum + JSON.parse(c.warnings || '[]').length, 0),
        avg_response_ms: Math.round(dayChecks.reduce((s, c) => s + (c.response_time_ms || 0), 0) / dayChecks.length)
      });
    }

    const report = {
      title: 'Spikerz QA Final Assessment Report — 5-Day Monitoring Summary',
      generated_at: new Date().toISOString(),
      monitoring_period: {
        days_monitored: dailySummaries.length,
        total_health_checks: allChecks.length,
        total_issues_found: allIssues.length,
        total_maintenance_entries: allLogs.length
      },
      account_inventory: {
        total: accounts.length,
        by_platform: this._countByField(accounts, 'platform'),
        by_status: this._countByField(accounts, 'status'),
        by_connection: this._countByField(accounts, 'connection_status')
      },
      daily_summaries: dailySummaries,
      issues_summary: {
        total: allIssues.length,
        by_severity: this._countByField(allIssues, 'severity'),
        by_status: this._countByField(allIssues, 'status'),
        details: allIssues
      },
      maintenance_log_summary: {
        total_entries: allLogs.length,
        by_category: this._countByField(allLogs, 'category'),
        entries: allLogs
      },
      recommendations: this._generateRecommendations(allChecks, allIssues)
    };

    return this._formatReport(report, format, 'final_report');
  }

  /**
   * Group health checks by platform.
   */
  _groupByPlatform(checks) {
    const platforms = {};
    for (const check of checks) {
      if (!platforms[check.platform]) {
        platforms[check.platform] = { total: 0, connected: 0, errors: 0, warnings: 0 };
      }
      platforms[check.platform].total++;
      if (check.connection_status === 'connected') platforms[check.platform].connected++;
      platforms[check.platform].errors += JSON.parse(check.errors || '[]').length;
      platforms[check.platform].warnings += JSON.parse(check.warnings || '[]').length;
    }
    return platforms;
  }

  /**
   * Count occurrences of values in a field.
   */
  _countByField(items, field) {
    const counts = {};
    for (const item of items) {
      const val = item[field] || 'unknown';
      counts[val] = (counts[val] || 0) + 1;
    }
    return counts;
  }

  /**
   * Generate recommendations based on monitoring data.
   */
  _generateRecommendations(checks, issues) {
    const recs = [];

    const tokenIssues = issues.filter(i => i.title.toLowerCase().includes('token') || i.title.toLowerCase().includes('expired'));
    if (tokenIssues.length > 0) {
      recs.push({
        priority: 'high',
        area: 'Token Management',
        recommendation: 'Implement proactive token refresh logic. Several accounts experienced token expiry during monitoring. Consider adding a background job that refreshes tokens 24 hours before expiry.'
      });
    }

    const rateLimitWarnings = checks.filter(c => JSON.parse(c.warnings || '[]').some(w => w.toLowerCase().includes('rate limit')));
    if (rateLimitWarnings.length > 0) {
      recs.push({
        priority: 'medium',
        area: 'Rate Limiting',
        recommendation: 'Implement request throttling and queuing. Multiple platforms showed rate limit warnings. Stagger health checks across the day rather than running all simultaneously.'
      });
    }

    recs.push({
      priority: 'medium',
      area: 'Alerting',
      recommendation: 'Set up real-time alerts (Slack/email) for critical failures. Currently issues are logged but not pushed to the team.'
    });

    recs.push({
      priority: 'low',
      area: 'Scaling',
      recommendation: 'For 100+ accounts, migrate from SQLite to PostgreSQL, add connection pooling, and implement parallel health checks with configurable concurrency limits.'
    });

    return recs;
  }

  /**
   * Format and save a report in the requested format.
   */
  _formatReport(report, format, filename) {
    const reportsDir = path.join(process.cwd(), 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    switch (format) {
      case 'json': {
        const filePath = path.join(reportsDir, `${filename}.json`);
        fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
        return { format: 'json', path: filePath, data: report };
      }

      case 'csv': {
        const filePath = path.join(reportsDir, `${filename}.csv`);
        const rows = (report.checks || []).map(c => ({
          day: report.day_number || '',
          timestamp: c.check_timestamp,
          platform: c.platform,
          account_name: c.account_name,
          account_status: c.account_status,
          connection_status: c.connection_status,
          token_validity: c.token_validity,
          permission_status: c.permission_status,
          errors: (c.errors || []).join('; '),
          warnings: (c.warnings || []).join('; '),
          response_time_ms: c.response_time_ms
        }));

        if (rows.length > 0) {
          const headers = Object.keys(rows[0]).join(',');
          const lines = rows.map(r => Object.values(r).map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
          fs.writeFileSync(filePath, [headers, ...lines].join('\n'));
        }
        return { format: 'csv', path: filePath };
      }

      case 'html': {
        const filePath = path.join(reportsDir, `${filename}.html`);
        const html = this._generateHtmlReport(report);
        fs.writeFileSync(filePath, html);
        return { format: 'html', path: filePath };
      }

      default:
        return { format: 'json', data: report };
    }
  }

  /**
   * Generate an HTML report.
   */
  _generateHtmlReport(report) {
    const summary = report.summary || report.monitoring_period || {};
    const checks = report.checks || [];

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${report.title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; padding: 24px; }
    .container { max-width: 1100px; margin: 0 auto; }
    h1 { font-size: 1.5rem; margin-bottom: 4px; }
    .subtitle { color: #666; margin-bottom: 24px; font-size: 0.9rem; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 24px; }
    .card { background: #fff; border-radius: 8px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .card .label { font-size: 0.75rem; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
    .card .value { font-size: 1.5rem; font-weight: 700; margin-top: 4px; }
    .card .value.green { color: #16a34a; }
    .card .value.red { color: #dc2626; }
    .card .value.amber { color: #d97706; }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 24px; }
    th { background: #f8f8f8; text-align: left; padding: 10px 12px; font-size: 0.75rem; text-transform: uppercase; color: #666; border-bottom: 2px solid #eee; }
    td { padding: 10px 12px; border-bottom: 1px solid #f0f0f0; font-size: 0.85rem; }
    tr:hover td { background: #fafafa; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; font-weight: 600; }
    .badge-green { background: #dcfce7; color: #166534; }
    .badge-red { background: #fee2e2; color: #991b1b; }
    .badge-amber { background: #fef3c7; color: #92400e; }
    .badge-gray { background: #f3f4f6; color: #374151; }
    .section-title { font-size: 1.1rem; margin: 24px 0 12px; }
  </style>
</head>
<body>
<div class="container">
  <h1>${report.title}</h1>
  <p class="subtitle">Generated: ${report.generated_at}</p>

  <div class="cards">
    <div class="card">
      <div class="label">Total Accounts</div>
      <div class="value">${summary.total_accounts || summary.total_health_checks || 0}</div>
    </div>
    <div class="card">
      <div class="label">Connected</div>
      <div class="value green">${summary.connected || 0}</div>
    </div>
    <div class="card">
      <div class="label">Disconnected</div>
      <div class="value red">${summary.disconnected || 0}</div>
    </div>
    <div class="card">
      <div class="label">Errors</div>
      <div class="value red">${summary.total_errors || summary.total_issues_found || 0}</div>
    </div>
    <div class="card">
      <div class="label">Warnings</div>
      <div class="value amber">${summary.total_warnings || 0}</div>
    </div>
    <div class="card">
      <div class="label">Avg Response</div>
      <div class="value">${summary.avg_response_time_ms || 0}ms</div>
    </div>
  </div>

  <h2 class="section-title">Account Health Details</h2>
  <table>
    <thead>
      <tr>
        <th>Platform</th>
        <th>Account</th>
        <th>Status</th>
        <th>Connection</th>
        <th>Token</th>
        <th>Permissions</th>
        <th>Errors</th>
        <th>Response</th>
      </tr>
    </thead>
    <tbody>
      ${checks.map(c => `
      <tr>
        <td><strong>${(c.platform || '').toUpperCase()}</strong></td>
        <td>${c.account_name || c.account_id}</td>
        <td><span class="badge ${c.account_status === 'active' ? 'badge-green' : 'badge-red'}">${c.account_status}</span></td>
        <td><span class="badge ${c.connection_status === 'connected' ? 'badge-green' : 'badge-red'}">${c.connection_status}</span></td>
        <td><span class="badge ${c.token_validity === 'valid' ? 'badge-green' : c.token_validity === 'expiring_soon' ? 'badge-amber' : 'badge-red'}">${c.token_validity}</span></td>
        <td><span class="badge ${c.permission_status === 'ok' ? 'badge-green' : c.permission_status === 'partial' ? 'badge-amber' : 'badge-red'}">${c.permission_status}</span></td>
        <td>${(c.errors || []).length > 0 ? '<span class="badge badge-red">' + (c.errors || []).join('; ') + '</span>' : '<span class="badge badge-green">None</span>'}</td>
        <td>${c.response_time_ms}ms</td>
      </tr>`).join('')}
    </tbody>
  </table>

  ${(report.issues || []).length > 0 ? `
  <h2 class="section-title">Issues Detected</h2>
  <table>
    <thead><tr><th>Severity</th><th>Title</th><th>Status</th><th>Created</th></tr></thead>
    <tbody>
      ${(report.issues || []).map(i => `
      <tr>
        <td><span class="badge ${i.severity === 'critical' ? 'badge-red' : i.severity === 'high' ? 'badge-red' : 'badge-amber'}">${i.severity}</span></td>
        <td>${i.title}</td>
        <td><span class="badge badge-gray">${i.status}</span></td>
        <td>${i.created_at}</td>
      </tr>`).join('')}
    </tbody>
  </table>` : ''}
</div>
</body>
</html>`;
  }
}

module.exports = new ReportService();
