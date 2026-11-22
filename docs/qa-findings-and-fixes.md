# QA Findings and Fixes Report

**Project:** Spikerz QA Tool
**Date:** 2026-11-22
**Scope:** End-to-end review of the tool: local setup, test suite, CI configuration, the 5-day monitoring simulation, and the generated final report.

---

## 1. Summary

The test suite passed throughout (27/27). The review still found **8 defects** in the tooling and report output, and all 8 are fixed. Five were correctness bugs, meaning reports that were wrong or not reproducible. The other three were configuration and documentation gaps. The 5-day monitoring run raised **3 issues**, all now resolved, plus **5 warnings**. One warning, a restricted TikTok account, is the highest remaining risk.

| Area | Found | Fixed |
|---|---|---|
| Tooling and report defects | 8 | 8 |
| Monitoring issues (auto-raised bugs) | 3 | 3 resolved |
| Monitoring warnings needing action | 5 | Actions logged; 1 needs manual follow-up (TT-003) |

---

## 2. Tooling and Report Defects

### DEF-01: CI tested unsupported Node versions
- **Severity:** Medium
- **Found:** `.github/workflows/ci.yml` tested Node 18.x and 20.x, but `package.json` requires `>=20 <23` and `.nvmrc` pins 22. CI ran on a version the project doesn't support and never tested the one developers use.
- **Fix:** Changed the CI matrix to `[20.x, 22.x]` and updated the README to match.

### DEF-02: Error counts in the terminal and the reports disagreed
- **Severity:** Medium
- **Found:** On days 3 and 4 the command-line output said 1 error but the final report said 2. The command line counted *accounts* with errors, while the report counted *error messages*. FB-002 alone logged 2 messages on day 3.
- **Fix:** All report summaries (daily, final and per-platform) now count accounts, matching the command line. The raw message totals are kept as separate fields (`error_messages` / `warning_messages` in the final report; `total_errors` / `total_warnings` in daily reports). The HTML labels now say "Accounts with Errors" and "Accounts with Warnings", and the command-line output says `With warnings / With errors (accounts)`.

### DEF-03: Re-running the simulation duplicated data
- **Severity:** High
- **Found:** `health-check --simulate-days 5` added a new copy of the data on every run and never replaced the old one. A second run produced 30 checks per day instead of 15, which doubled every figure in the final report.
- **Fix:** The simulation now first deletes its own days (health checks, maintenance log entries and issues for days 1–N) before running. Accounts and the setup log entry are kept.

### DEF-04: Account restrictions leaked into the next run
- **Severity:** High
- **Found:** TT-003 is flagged as restricted on day 5, and that status stayed on the account. On the next run it was recorded as `restricted` from day 1, so the report suggested the account had been restricted all week.
- **Fix:** The simulation now resets seeded accounts to their starting status and connection before running. TT-003 now shows `active` on days 1–4 and `restricted` only on day 5.

### DEF-05: The simulation wasn't reproducible
- **Severity:** Medium
- **Found:** On day 3, the LinkedIn check added a rate-limit warning with a 15% random chance (`Math.random() < 0.15`). Each run produced different warnings and recommendations, so reports couldn't be compared between runs.
- **Fix:** The warning is now always assigned to LI-002 on day 3. Two runs in a row now give identical report content (only timestamps and response times differ).

### DEF-06: Issues were never resolved and nothing was marked as fixed
- **Severity:** High
- **Found:** All 3 issues stayed `open` with no root cause or resolution date, and the maintenance log had 0 `corrective_action` entries. FB-002 recovered on day 4 but its issue was never closed. The report showed failures being detected but never resolved.
- **Fix:** When an account with an open issue passes a later health check, the issue is now marked `resolved` with a resolution date and root cause, and a `corrective_action` log entry records what was done. The HTML report shows the root cause and resolution date, with green badges for resolved items.

### DEF-07: Report recommendations were generic, incomplete or contradictory
- **Severity:** Medium
- **Found:**
  - Recommendations didn't name affected accounts or days ("several accounts", "multiple platforms").
  - The rate-limit check only matched "rate limit", so it missed the TikTok **quota** failure, the only rate-related problem that caused an actual error.
  - TT-003, the only restricted account, had **no** recommendation.
  - Alerting and Scaling were hard-coded and looked like monitoring findings.
  - The report advised refreshing tokens 24 hours before expiry, while logging day-5 expiry warnings as "no immediate action required".
- **Fix:** Rewrote the recommendation logic in `reportService.js`:
  - Every monitoring-based recommendation names the accounts and days affected.
  - New **Account Restriction** (high) recommendation when an account is flagged or restricted.
  - The rate-limit check also matches "quota".
  - New **Open Issues** / **Issue Follow-up** recommendation based on issue status.
  - The HTML report now has two sections, *Recommendations from Monitoring* and *General Improvements* (Alerting, Scaling).
  - Expiring-token and restriction warnings are now logged as `requires_attention` with a concrete action.

### DEF-08: Dependency security warnings
- **Severity:** Low (the project wasn't affected)
- **Found:** `npm audit` reported 2 moderate-severity warnings (GHSA-w5hq-g745-h8pq) in `uuid` <11.1.1, one direct and one inside `node-cron` 3.x. The bug is in uuid v3/v5/v6 and the project only uses v4, so it wasn't exposed.
- **Fix:** Upgraded `uuid` to `^11.1.1` and `node-cron` to `^4.6.0`. Both functions the project uses (`cron.validate`, `cron.schedule`) work the same; I started the server and confirmed the 08:00 schedule registers and the dashboard returns 200. `npm audit` now reports 0 vulnerabilities.

### Documentation updates
- README: CI Node versions corrected (DEF-01).
- `docs/bug-reports.md`: BUG-001–003 status changed from *Open* to *Resolved (Day N)*.

---

## 3. Monitoring Findings (5-Day Simulation, 2026-11-18 → 2026-11-22)

**Scale:** 15 accounts (3 each on LinkedIn, Facebook, Instagram, TikTok, X); 75 health checks; 18 maintenance log entries.

| Day | Date | Connected | Accounts w/ errors | Accounts w/ warnings |
|---|---|---|---|---|
| 1 | 2026-11-18 | 15/15 | 0 | 0 |
| 2 | 2026-11-19 | 14/15 | 1 | 2 |
| 3 | 2026-11-20 | 14/15 | 1 | 1 |
| 4 | 2026-11-21 | 14/15 | 1 | 1 |
| 5 | 2026-11-22 | 15/15 | 0 | 3 |

### Issues raised (all resolved)

| Bug | Account | Day | Severity | Problem | Root cause | Fix | Resolved |
|---|---|---|---|---|---|---|---|
| BUG-001 | TT-002 (TikTok) | 2 | Medium | Sandbox daily API quota exceeded; write permissions suspended | API quota used up by request volume | Waited for quota reset; reduced request volume | Day 3 |
| BUG-002 | FB-002 (Facebook) | 3 | High | Session expired (Graph API error 190); permissions revoked | Access token / session expired | Re-authenticated via Spikerz Settings > Connected Accounts | Day 4 |
| BUG-003 | LI-003 (LinkedIn) | 4 | High | Token expired; permissions revoked | Access token expired | Re-authenticated via Spikerz Settings > Connected Accounts | Day 5 |

### Warnings

| Account | Day | Warning | Action logged |
|---|---|---|---|
| IG-001 (Instagram) | 2 | API rate limit hit: 429, retry after 300s | Monitoring |
| LI-002 (LinkedIn) | 3 | Rate limit approaching (80% of daily quota) | Monitoring |
| X-001 (X) | 4 | App-level rate limit at 90% | Monitoring |
| FB-002, FB-003 (Facebook) | 5 | Page access token expires in 2 days | Scheduled proactive token refresh |
| **TT-003 (TikTok)** | **5** | **Account flagged for review (automated activity detected) → status `restricted`** | **Automated activity paused; manual review required** |

### Patterns
1. **Tokens are the main failure mode.** 2 of 3 issues were expired tokens, and 2 more tokens were close to expiry by day 5.
2. **Rate limits and quotas affected 4 of 5 platforms** (Instagram, TikTok, LinkedIn, X). All health checks run at 08:00 at once, which adds to this.
3. **Every failure recovered within one day** after its fix was applied.
4. **TT-003 is the main outstanding risk.** A platform flag for automated activity can lead to suspension.

---

## 4. Recommendations

**From monitoring**

| Priority | Area | Recommendation |
|---|---|---|
| High | Account restriction | TT-003: pause all automated activity, review the account manually in the TikTok developer portal, and keep a standby test account ready. Reduce automated activity on TikTok. |
| High | Token management | Add a background job that refreshes tokens at least 24 hours before expiry, covering FB-002, LI-003 and FB-003. Treat "expiring soon" warnings as action items. |
| Medium | Rate limits and quotas | Add per-platform throttling with backoff on 429 responses, and spread health checks across the day instead of running all 15 at 08:00. |
| Low | Issue follow-up | Keep the root causes of BUG-001–003 on record and watch those accounts for recurrence. |

**General improvements**

| Priority | Area | Recommendation |
|---|---|---|
| Medium | Alerting | Send real-time Slack/email alerts for high-severity issues and restrictions. Issues are currently only logged. |
| Low | Scaling | For 100+ accounts, move from SQLite to PostgreSQL with connection pooling and run health checks in parallel with a concurrency limit. |
| Low | Test coverage | Overall line coverage is about 63%; `credentialVault.js` is at 5%. Add tests for the vault, the issue-resolution flow, and the recommendation logic. |

---

## 5. Verification

| Check | Result |
|---|---|
| `npm test` (Node 22.23.5) | 27/27 passed |
| `npm run test:coverage` | Passed; ~63% lines |
| `npm audit` | 0 vulnerabilities |
| `npm start` smoke test | Server starts, cron registers, `/dashboard` returns 200 |
| Simulation run twice in a row | 15 checks per day, 3 issues, 18 log entries; report content identical across runs |
| Terminal vs report counts | Match on all 5 days |

## 6. Files Changed

| File | Change |
|---|---|
| `.github/workflows/ci.yml` | Node matrix → 20.x, 22.x |
| `package.json`, `package-lock.json` | `uuid` ^11.1.1, `node-cron` ^4.6.0 |
| `src/cli.js` | Simulation reset (data + account status); clearer count labels |
| `src/services/healthCheckService.js` | Day-3 LinkedIn warning made deterministic |
| `src/services/maintenanceLogService.js` | Auto-resolve recovered issues; corrective-action log; action-oriented warning outcomes |
| `src/services/reportService.js` | Account-based counts; new recommendation logic; split recommendation sections; resolved-issue details |
| `README.md` | CI Node versions |
| `docs/bug-reports.md` | Bug statuses → Resolved |
| `docs/qa-findings-and-fixes.md` | This report |
