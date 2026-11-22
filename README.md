# Spikerz QA Tool

A test account management and monitoring system for managing 15 social media test accounts across LinkedIn, Facebook, Instagram, TikTok, and X (Twitter).

Built as a QA take-home assessment solution.

## Project Overview

This tool provides:

- **Account Inventory** — CRUD management for 15 test accounts across 5 platforms
- **Daily Health Checks** — Automated checks for connection status, token validity, permissions, and errors
- **Issue Detection** — Automatic bug report creation when health checks detect problems
- **5-Day Maintenance Log** — Structured journal of all changes, failures, and corrective actions
- **Reports** — Daily and final summary reports in JSON, CSV, and HTML formats
- **Dashboard** — Web-based dashboard showing real-time account health by platform

## Tech Stack

- **Runtime:** Node.js
- **API:** Express.js
- **Database:** SQLite (via better-sqlite3)
- **Scheduling:** node-cron
- **Testing:** Jest (27 tests)
- **Reports:** JSON, CSV, HTML

## Setup Instructions

### Prerequisites

- Node.js 18+ installed
- npm or yarn

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd spikerz-qa-tool

# Install dependencies
npm install

# Copy environment config
cp .env.example .env

# Seed the database with 15 test accounts
npm run seed
```

### Running the Tool

#### Web Dashboard + API

```bash
npm start
# Dashboard: http://localhost:3000/dashboard
# API:       http://localhost:3000/
```

#### CLI Commands

```bash
# Seed 15 test accounts
node src/cli.js seed

# Import accounts from CSV or JSON
node src/cli.js import --file data/sample_import.csv
node src/cli.js import --file data/seed_accounts.json

# Run health check for a specific day
node src/cli.js health-check --day 1

# Simulate all 5 days of monitoring
node src/cli.js health-check --simulate-days 5

# Generate daily report
node src/cli.js report --day 1

# Generate final 5-day summary report
node src/cli.js report --final

# List all accounts
node src/cli.js accounts

# List all issues
node src/cli.js issues
```

#### Running Tests

```bash
npm test                 # Run all tests
npm run test:coverage    # Run with coverage report
```

## Data Model

### accounts
| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (PK) | Unique account identifier (e.g., LI-001) |
| platform | TEXT | linkedin, facebook, instagram, tiktok, x |
| account_type | TEXT | profile, page, business, creator, personal |
| account_name | TEXT | Human-readable name |
| account_handle | TEXT | Platform-specific handle |
| environment | TEXT | test, staging, production |
| owner | TEXT | Team or individual responsible |
| status | TEXT | active, inactive, suspended, restricted, pending |
| connection_status | TEXT | connected, disconnected, expired, error, pending |
| connected_assets | JSON | Array of connected features/assets |
| permissions | JSON | Array of granted permissions |
| credential_ref_id | TEXT | Reference to secrets vault (never stores actual credentials) |
| notes | TEXT | Free-text notes |
| last_health_check | TEXT | ISO timestamp of last check |

### health_checks
| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER (PK) | Auto-incrementing ID |
| account_id | TEXT (FK) | References accounts.id |
| check_timestamp | TEXT | When the check ran |
| day_number | INTEGER | Day 1–5 of monitoring period |
| account_status | TEXT | Account status at check time |
| connection_status | TEXT | Connection result |
| token_validity | TEXT | valid, expiring_soon, expired, not_applicable, unknown |
| connected_assets | JSON | Assets available at check time |
| permission_status | TEXT | ok, partial, revoked, unknown |
| errors | JSON | Array of error messages |
| warnings | JSON | Array of warning messages |
| response_time_ms | INTEGER | Response time in milliseconds |

### maintenance_log
Tracks all operational events across the 5-day monitoring period, categorized as: connection, failure, permission_change, token_refresh, restriction, corrective_action, observation, setup.

### issues
Automatically created when health checks detect errors. Includes severity (critical/high/medium/low), reproduction steps, root cause analysis, and recommended actions.

## Security Approach

1. **No credentials stored in code or database** — All credentials are referenced by vault ID (e.g., `VAULT_LI_001`), not stored directly
2. **Credential vault utility** (`src/utils/credentialVault.js`) — Abstracted credential retrieval with three strategies: environment variables → mock mode → external vault (AWS Secrets Manager / HashiCorp Vault placeholder). Every access is audit-logged with timestamp, source, and success/failure
3. **Vault audit endpoint** — `GET /api/health-checks/vault-audit` returns the full credential access log for security review
4. **Environment variables** — Configuration via `.env` file, excluded from git
5. **`.gitignore`** — Excludes `.env`, database files, `node_modules`
6. **No actual API keys used** — This assessment runs in mock mode; real platform API keys would be stored in the secrets manager, never in the codebase

## CI/CD

GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push and PR to `main`:

1. **Tests** — Runs full test suite on Node.js 18.x and 20.x
2. **Coverage** — Generates test coverage report
3. **Simulation** — Seeds the database and runs the full 5-day health check simulation
4. **Artifacts** — Uploads generated reports as build artifacts (retained 30 days)

## Assumptions and Limitations

### Approach: Mock Accounts
All 15 accounts are **mock test accounts**. This was chosen because:
- No access to the Spikerz platform UI was available during the assessment period
- Creating real test accounts across 5 platforms risks policy violations and account suspensions
- Mock accounts allow demonstrating the full architecture and monitoring flow without platform dependencies

### What would change with real accounts
- Health checks would make actual API calls to each platform (Graph API, LinkedIn API, TikTok API, X API v2)
- Token refresh would use OAuth 2.0 refresh flows per platform
- Connection to Spikerz UI would be documented with real screenshots
- Rate limiting would need per-platform throttling

### Limitations
- **Health checks are simulated** — Real checks would require platform API credentials and OAuth setup
- **Spikerz UI connection** — Documented as expected workflow (see `docs/spikerz-connection-workflow.md`) since platform access was not available
- **5-day monitoring** — Simulated with realistic scenarios rather than actual 5-day calendar period
- **SQLite** — Appropriate for 15 accounts; for 100+ accounts, would migrate to PostgreSQL with connection pooling

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/accounts | List all accounts (filterable) |
| GET | /api/accounts/summary | Platform-level summary |
| GET | /api/accounts/:id | Get single account |
| POST | /api/accounts | Create account |
| PUT | /api/accounts/:id | Update account |
| DELETE | /api/accounts/:id | Delete account |
| POST | /api/accounts/import | Bulk import from JSON or CSV |
| POST | /api/health-checks/run | Run health checks |
| GET | /api/health-checks/day/:n | Get day's results |
| GET | /api/health-checks/account/:id | Account history |
| GET | /api/health-checks/issues | List all issues |
| GET | /api/health-checks/maintenance-log | Full maintenance log |
| GET | /api/health-checks/vault-audit | Credential vault access log |
| GET | /api/reports/daily/:day | Generate daily report |
| GET | /api/reports/final | Generate final report |
