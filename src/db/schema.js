/**
 * Database schema for Spikerz QA Test Account Management System
 *
 * Tables:
 * - accounts: Core inventory of all 15 test accounts
 * - health_checks: Results from daily health check runs
 * - maintenance_log: Five-day maintenance journal
 * - issues: Detected issues and bug reports
 */

const SCHEMA = `
  -- Test account inventory
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL CHECK(platform IN ('linkedin', 'facebook', 'instagram', 'tiktok', 'x')),
    account_type TEXT NOT NULL CHECK(account_type IN ('profile', 'page', 'business', 'creator', 'personal')),
    account_name TEXT NOT NULL,
    account_handle TEXT,
    environment TEXT NOT NULL DEFAULT 'test' CHECK(environment IN ('test', 'staging', 'production')),
    owner TEXT NOT NULL DEFAULT 'qa-team',
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'suspended', 'restricted', 'pending')),
    connection_status TEXT NOT NULL DEFAULT 'disconnected' CHECK(connection_status IN ('connected', 'disconnected', 'expired', 'error', 'pending')),
    connected_assets TEXT DEFAULT '[]',
    permissions TEXT DEFAULT '[]',
    credential_ref_id TEXT,
    notes TEXT DEFAULT '',
    last_health_check TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Health check results
  CREATE TABLE IF NOT EXISTS health_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL,
    check_timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    day_number INTEGER,
    account_status TEXT NOT NULL,
    connection_status TEXT NOT NULL,
    token_validity TEXT DEFAULT 'unknown' CHECK(token_validity IN ('valid', 'expiring_soon', 'expired', 'not_applicable', 'unknown')),
    connected_assets TEXT DEFAULT '[]',
    permission_status TEXT DEFAULT 'ok' CHECK(permission_status IN ('ok', 'partial', 'revoked', 'unknown')),
    errors TEXT DEFAULT '[]',
    warnings TEXT DEFAULT '[]',
    response_time_ms INTEGER,
    raw_response TEXT,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
  );

  -- Maintenance log (5-day journal)
  CREATE TABLE IF NOT EXISTS maintenance_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day_number INTEGER NOT NULL,
    log_date TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('connection', 'failure', 'permission_change', 'token_refresh', 'restriction', 'corrective_action', 'observation', 'setup')),
    account_id TEXT,
    description TEXT NOT NULL,
    action_taken TEXT,
    outcome TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
  );

  -- Issue tracking
  CREATE TABLE IF NOT EXISTS issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT,
    title TEXT NOT NULL,
    severity TEXT NOT NULL CHECK(severity IN ('critical', 'high', 'medium', 'low')),
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'investigating', 'resolved', 'wont_fix')),
    description TEXT NOT NULL,
    reproduction_steps TEXT,
    evidence TEXT,
    root_cause TEXT,
    recommended_action TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
  );

  -- Indexes for query performance
  CREATE INDEX IF NOT EXISTS idx_health_checks_account ON health_checks(account_id);
  CREATE INDEX IF NOT EXISTS idx_health_checks_day ON health_checks(day_number);
  CREATE INDEX IF NOT EXISTS idx_health_checks_timestamp ON health_checks(check_timestamp);
  CREATE INDEX IF NOT EXISTS idx_maintenance_log_day ON maintenance_log(day_number);
  CREATE INDEX IF NOT EXISTS idx_issues_account ON issues(account_id);
  CREATE INDEX IF NOT EXISTS idx_issues_severity ON issues(severity);
  CREATE INDEX IF NOT EXISTS idx_accounts_platform ON accounts(platform);
  CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);
`;

module.exports = { SCHEMA };
