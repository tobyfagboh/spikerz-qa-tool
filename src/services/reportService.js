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
   * Generate an HTML report — handles both daily and final report structures.
   */
  _generateHtmlReport(report) {
    const isFinal = !!report.monitoring_period;

    if (isFinal) {
      return this._generateFinalHtmlReport(report);
    }
    return this._generateDailyHtmlReport(report);
  }

  /**
   * Generate a daily HTML report.
   */
  _generateDailyHtmlReport(report) {
    const summary = report.summary || {};
    const checks = report.checks || [];

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${report.title}</title>
  <style>${this._getReportStyles()}</style>
</head>
<body>
<div class="container">
  <h1>${report.title}</h1>
  <p class="subtitle">Generated: ${report.generated_at}</p>

  <div class="cards">
    <div class="card"><div class="label">Total Accounts</div><div class="value">${summary.total_accounts || 0}</div></div>
    <div class="card"><div class="label">Connected</div><div class="value green">${summary.connected || 0}</div></div>
    <div class="card"><div class="label">Disconnected</div><div class="value red">${summary.disconnected || 0}</div></div>
    <div class="card"><div class="label">Errors</div><div class="value red">${summary.total_errors || 0}</div></div>
    <div class="card"><div class="label">Warnings</div><div class="value amber">${summary.total_warnings || 0}</div></div>
    <div class="card"><div class="label">Avg Response</div><div class="value">${summary.avg_response_time_ms || 0}ms</div></div>
  </div>

  <h2 class="section-title">Account Health Details</h2>
  <table>
    <thead>
      <tr><th>Platform</th><th>Account</th><th>Status</th><th>Connection</th><th>Token</th><th>Permissions</th><th>Errors</th><th>Response</th></tr>
    </thead>
    <tbody>
      ${checks.map(c => `
      <tr>
        <td><strong>${(c.platform || '').toUpperCase()}</strong></td>
        <td>${c.account_name || c.account_id}</td>
        <td>${this._badge(c.account_status, c.account_status === 'active' ? 'green' : 'red')}</td>
        <td>${this._badge(c.connection_status, c.connection_status === 'connected' ? 'green' : 'red')}</td>
        <td>${this._badge(c.token_validity, c.token_validity === 'valid' ? 'green' : c.token_validity === 'expiring_soon' ? 'amber' : 'red')}</td>
        <td>${this._badge(c.permission_status, c.permission_status === 'ok' ? 'green' : c.permission_status === 'partial' ? 'amber' : 'red')}</td>
        <td>${(c.errors || []).length > 0 ? '<span class="badge badge-red">' + (c.errors || []).join('; ') + '</span>' : '<span class="badge badge-green">None</span>'}</td>
        <td>${c.response_time_ms}ms</td>
      </tr>`).join('')}
    </tbody>
  </table>

  ${this._issuesTableHtml(report.issues)}
</div>
</body>
</html>`;
  }

  /**
   * Generate the comprehensive final HTML report with all sections.
   */
  _generateFinalHtmlReport(report) {
    const mp = report.monitoring_period || {};
    const inv = report.account_inventory || {};
    const dailySummaries = report.daily_summaries || [];
    const issues = (report.issues_summary || {}).details || [];
    const issuesSummary = report.issues_summary || {};
    const maintenance = (report.maintenance_log_summary || {}).entries || [];
    const recommendations = report.recommendations || [];

    // Date range from daily summaries
    const dateLabels = ['Nov 18', 'Nov 19', 'Nov 20', 'Nov 21', 'Nov 22'];

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${report.title}</title>
  <style>${this._getReportStyles()}
    .hero { background: linear-gradient(135deg, #1e293b 0%, #334155 100%); color: #fff; border-radius: 12px; padding: 32px; margin-bottom: 24px; }
    .hero h1 { font-size: 1.6rem; color: #fff; margin-bottom: 8px; }
    .hero .subtitle { color: #94a3b8; }
    .hero .meta { display: flex; gap: 24px; margin-top: 16px; flex-wrap: wrap; }
    .hero .meta-item { font-size: 0.85rem; color: #cbd5e1; }
    .hero .meta-item strong { color: #fff; }
    .section { margin-bottom: 32px; }
    .platform-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 12px; margin-bottom: 24px; }
    .platform-card { background: #fff; border-radius: 8px; padding: 16px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .platform-card .platform-name { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; color: #666; margin-bottom: 4px; }
    .platform-card .platform-count { font-size: 1.8rem; font-weight: 700; color: #1e293b; }
    .trend-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 16px; }
    .trend-cell { background: #fff; border-radius: 8px; padding: 12px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .trend-cell .day-label { font-size: 0.7rem; color: #888; text-transform: uppercase; }
    .trend-cell .day-val { font-size: 1.2rem; font-weight: 700; margin: 4px 0; }
    .trend-cell .day-detail { font-size: 0.7rem; color: #666; }
    .rec-card { background: #fff; border-left: 4px solid #3b82f6; border-radius: 0 8px 8px 0; padding: 16px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .rec-card.high { border-left-color: #dc2626; }
    .rec-card.medium { border-left-color: #d97706; }
    .rec-card.low { border-left-color: #16a34a; }
    .rec-card .rec-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
    .rec-card .rec-area { font-weight: 600; font-size: 0.95rem; }
    .rec-card .rec-text { font-size: 0.85rem; color: #555; line-height: 1.5; }
    .log-entry { display: grid; grid-template-columns: 100px 90px 1fr auto; gap: 12px; padding: 10px 12px; border-bottom: 1px solid #f0f0f0; align-items: center; font-size: 0.85rem; }
    .log-entry:hover { background: #fafafa; }
    .log-header { font-weight: 600; font-size: 0.75rem; text-transform: uppercase; color: #666; background: #f8f8f8; border-bottom: 2px solid #eee; }
    @media (max-width: 768px) {
      .platform-grid, .trend-row { grid-template-columns: repeat(2, 1fr); }
      .log-entry { grid-template-columns: 1fr; }
      .hero .meta { flex-direction: column; gap: 8px; }
    }
  </style>
</head>
<body>
<div class="container">

  <!-- Hero Header -->
  <div class="hero">
    <h1>Spikerz QA Final Assessment Report</h1>
    <p class="subtitle">5-Day Monitoring Summary — Test Account Health & Issue Tracking</p>
    <div class="meta">
      <div class="meta-item"><strong>${mp.days_monitored}</strong> days monitored</div>
      <div class="meta-item"><strong>${inv.total}</strong> accounts</div>
      <div class="meta-item"><strong>${mp.total_health_checks}</strong> health checks</div>
      <div class="meta-item"><strong>${mp.total_issues_found}</strong> issues found</div>
      <div class="meta-item">Generated: <strong>${new Date(report.generated_at).toLocaleString()}</strong></div>
    </div>
  </div>

  <!-- Summary Cards -->
  <div class="cards">
    <div class="card"><div class="label">Total Accounts</div><div class="value">${inv.total}</div></div>
    <div class="card"><div class="label">Platforms</div><div class="value">${Object.keys(inv.by_platform || {}).length}</div></div>
    <div class="card"><div class="label">Health Checks</div><div class="value">${mp.total_health_checks}</div></div>
    <div class="card"><div class="label">Issues Found</div><div class="value red">${mp.total_issues_found}</div></div>
    <div class="card"><div class="label">Maintenance Entries</div><div class="value amber">${mp.total_maintenance_entries}</div></div>
    <div class="card"><div class="label">Days Clean</div><div class="value green">${dailySummaries.filter(d => d.errors === 0).length}</div></div>
  </div>

  <!-- Platform Breakdown -->
  <div class="section">
    <h2 class="section-title">Account Inventory by Platform</h2>
    <div class="platform-grid">
      ${Object.entries(inv.by_platform || {}).map(([platform, count]) => `
      <div class="platform-card">
        <div class="platform-name">${platform}</div>
        <div class="platform-count">${count}</div>
      </div>`).join('')}
    </div>
  </div>

  <!-- Daily Trend -->
  <div class="section">
    <h2 class="section-title">Daily Health Trend</h2>
    <table>
      <thead>
        <tr><th>Day</th><th>Date</th><th>Accounts</th><th>Connected</th><th>Errors</th><th>Warnings</th><th>Avg Response</th><th>Status</th></tr>
      </thead>
      <tbody>
        ${dailySummaries.map((d, i) => `
        <tr>
          <td><strong>Day ${d.day}</strong></td>
          <td>${dateLabels[i] || ''}</td>
          <td>${d.total}</td>
          <td>${this._badge(d.connected + '/' + d.total, d.connected === d.total ? 'green' : 'amber')}</td>
          <td>${d.errors > 0 ? this._badge(d.errors, 'red') : this._badge('0', 'green')}</td>
          <td>${d.warnings > 0 ? this._badge(d.warnings, 'amber') : this._badge('0', 'green')}</td>
          <td>${d.avg_response_ms}ms</td>
          <td>${d.errors === 0 && d.warnings === 0 ? this._badge('Clean', 'green') : d.errors > 0 ? this._badge('Issues', 'red') : this._badge('Warnings', 'amber')}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>

  <!-- Visual Trend Cards -->
  <div class="section">
    <h2 class="section-title">Connection Health Over 5 Days</h2>
    <div class="trend-row">
      ${dailySummaries.map((d, i) => `
      <div class="trend-cell">
        <div class="day-label">${dateLabels[i] || 'Day ' + d.day}</div>
        <div class="day-val ${d.connected === d.total ? 'green' : 'red'}">${Math.round((d.connected / d.total) * 100)}%</div>
        <div class="day-detail">${d.connected}/${d.total} connected</div>
        <div class="day-detail">${d.errors} error${d.errors !== 1 ? 's' : ''} · ${d.warnings} warning${d.warnings !== 1 ? 's' : ''}</div>
      </div>`).join('')}
    </div>
  </div>

  <!-- Issues -->
  <div class="section">
    <h2 class="section-title">Issues Detected (${issues.length})</h2>
    ${issues.length > 0 ? `
    <table>
      <thead><tr><th>ID</th><th>Day</th><th>Platform</th><th>Account</th><th>Severity</th><th>Title</th><th>Status</th></tr></thead>
      <tbody>
        ${issues.map((issue, idx) => {
          const dayMatch = issue.title.match(/\[Day (\d+)\]/);
          const day = dayMatch ? dayMatch[1] : '—';
          return `
        <tr>
          <td><strong>BUG-${String(idx + 1).padStart(3, '0')}</strong></td>
          <td>Day ${day}</td>
          <td><strong>${(issue.platform || '').toUpperCase()}</strong></td>
          <td>${issue.account_name}</td>
          <td>${this._badge(issue.severity, issue.severity === 'high' ? 'red' : issue.severity === 'medium' ? 'amber' : 'gray')}</td>
          <td style="max-width: 300px; white-space: normal;">${issue.description.split('\\n')[0]}</td>
          <td>${this._badge(issue.status, 'gray')}</td>
        </tr>`;
        }).join('')}
      </tbody>
    </table>

    <!-- Issue Details -->
    ${issues.map((issue, idx) => `
    <div class="rec-card ${issue.severity}">
      <div class="rec-header">
        <span class="rec-area">BUG-${String(idx + 1).padStart(3, '0')}: ${issue.account_name} (${(issue.platform || '').toUpperCase()})</span>
        ${this._badge(issue.severity, issue.severity === 'high' ? 'red' : 'amber')}
      </div>
      <div class="rec-text">
        <strong>Error:</strong> ${issue.description.replace(/\n/g, '<br>')}<br>
        <strong>Steps:</strong> ${issue.reproduction_steps.replace(/\n/g, '<br>')}<br>
        <strong>Action:</strong> ${issue.recommended_action}
      </div>
    </div>`).join('')}
    ` : '<p style="color:#666; padding: 16px;">No issues detected during the monitoring period.</p>'}
  </div>

  <!-- Maintenance Log -->
  <div class="section">
    <h2 class="section-title">Maintenance Log (${maintenance.length} entries)</h2>
    <table>
      <thead>
        <tr><th>Date</th><th>Day</th><th>Category</th><th>Platform</th><th>Description</th><th>Outcome</th></tr>
      </thead>
      <tbody>
        ${maintenance.map(entry => `
        <tr>
          <td>${entry.log_date}</td>
          <td>${entry.day_number === 0 ? 'Setup' : 'Day ' + entry.day_number}</td>
          <td>${this._badge(entry.category, entry.category === 'failure' ? 'red' : entry.category === 'observation' ? 'amber' : entry.category === 'restriction' ? 'amber' : 'green')}</td>
          <td>${entry.platform ? entry.platform.toUpperCase() : '—'}</td>
          <td style="max-width: 400px; white-space: normal;">${entry.description}</td>
          <td>${this._badge(entry.outcome, entry.outcome === 'success' ? 'green' : entry.outcome === 'requires_attention' ? 'red' : 'amber')}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>

  <!-- Recommendations -->
  <div class="section">
    <h2 class="section-title">Recommendations</h2>
    ${recommendations.map(rec => `
    <div class="rec-card ${rec.priority}">
      <div class="rec-header">
        <span class="rec-area">${rec.area}</span>
        ${this._badge(rec.priority, rec.priority === 'high' ? 'red' : rec.priority === 'medium' ? 'amber' : 'green')}
      </div>
      <div class="rec-text">${rec.recommendation}</div>
    </div>`).join('')}
  </div>

  <!-- Footer -->
  <div style="text-align: center; padding: 24px; color: #999; font-size: 0.75rem; border-top: 1px solid #eee; margin-top: 32px;">
    Spikerz QA Assessment Report · Generated by spikerz-qa-tool · ${new Date(report.generated_at).toISOString()}
  </div>

</div>
</body>
</html>`;
  }

  /**
   * Shared report CSS styles.
   */
  _getReportStyles() {
    return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; padding: 24px; }
    .container { max-width: 1100px; margin: 0 auto; }
    h1 { font-size: 1.5rem; margin-bottom: 4px; }
    .subtitle { color: #666; margin-bottom: 24px; font-size: 0.9rem; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 24px; }
    .card { background: #fff; border-radius: 8px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .card .label { font-size: 0.75rem; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
    .card .value { font-size: 1.5rem; font-weight: 700; margin-top: 4px; }
    .card .value.green, .green { color: #16a34a; }
    .card .value.red, .red { color: #dc2626; }
    .card .value.amber, .amber { color: #d97706; }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 24px; }
    th { background: #f8f8f8; text-align: left; padding: 10px 12px; font-size: 0.75rem; text-transform: uppercase; color: #666; border-bottom: 2px solid #eee; }
    td { padding: 10px 12px; border-bottom: 1px solid #f0f0f0; font-size: 0.85rem; }
    tr:hover td { background: #fafafa; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; font-weight: 600; }
    .badge-green { background: #dcfce7; color: #166534; }
    .badge-red { background: #fee2e2; color: #991b1b; }
    .badge-amber { background: #fef3c7; color: #92400e; }
    .badge-gray { background: #f3f4f6; color: #374151; }
    .section-title { font-size: 1.1rem; margin: 24px 0 12px; }`;
  }

  /**
   * Helper to generate a badge span.
   */
  _badge(text, color) {
    return `<span class="badge badge-${color}">${text}</span>`;
  }

  /**
   * Generate issues table HTML section.
   */
  _issuesTableHtml(issues) {
    if (!issues || issues.length === 0) return '';
    return `
  <h2 class="section-title">Issues Detected</h2>
  <table>
    <thead><tr><th>Severity</th><th>Title</th><th>Status</th><th>Created</th></tr></thead>
    <tbody>
      ${issues.map(i => `
      <tr>
        <td>${this._badge(i.severity, i.severity === 'critical' || i.severity === 'high' ? 'red' : 'amber')}</td>
        <td>${i.title}</td>
        <td>${this._badge(i.status, 'gray')}</td>
        <td>${i.created_at}</td>
      </tr>`).join('')}
    </tbody>
  </table>`;
  }
}

module.exports = new ReportService();
