# Bug Reports — 5-Day Monitoring Period

## BUG-001: TikTok Sandbox Account Quota Exceeded (Day 2)

| Field | Detail |
|-------|--------|
| **Severity** | Medium |
| **Platform** | TikTok |
| **Account** | TT-02 QA Creator Account |
| **Status** | Open |
| **Detected** | Day 2 health check |

### Description
TikTok sandbox account TT-02 exceeded its daily API quota during the Day 2 health check. The API returned a quota exceeded error, causing write permissions to be suspended while read-only access remained functional.

### Reproduction Steps
1. Navigate to the QA Dashboard
2. View account TT-02 (TikTok Creator Account)
3. Run a health check for Day 2
4. Observe: Connection status changes to "disconnected", permission_status changes to "partial"
5. Only `user.info.basic` permission remains active; `video.list` and `video.publish` are suspended

### Evidence
- Health check log: `reports/day_2_report.json` → TT-02 entry
- Error message: "Sandbox account quota exceeded - daily API limit reached"
- Permission status: `partial` (only `user.info.basic` retained)

### Root Cause
TikTok sandbox accounts have strict daily API call quotas. The combined health check requests plus any other API activity from the same app exceeded the daily limit.

### Recommended Action
1. Wait for quota reset (24 hours from last request)
2. Reduce health check frequency for TikTok sandbox accounts to twice daily instead of continuous
3. Consider upgrading to a TikTok Business API account for higher rate limits
4. Implement request queuing to spread API calls across the day

---

## BUG-002: Facebook Session Expired — Graph API Error 190 (Day 3)

| Field | Detail |
|-------|--------|
| **Severity** | High |
| **Platform** | Facebook |
| **Account** | FB-02 QA Business Page |
| **Status** | Open |
| **Detected** | Day 3 health check |

### Description
Facebook Business Page account FB-02 returned Graph API error 190 (invalid/expired session) during the Day 3 health check. All permissions were revoked and the connection dropped.

### Reproduction Steps
1. Navigate to the QA Dashboard
2. View account FB-02 (Facebook Business Page)
3. Run a health check for Day 3
4. Observe: Connection status = "disconnected", all permissions revoked
5. API returns: "Session expired - Graph API returned error 190"

### Evidence
- Health check log: `reports/day_3_report.json` → FB-02 entry
- Error: "Session expired - Graph API returned error 190"
- Permission status: `revoked` (empty permissions array)

### Root Cause
Facebook short-lived tokens expire after approximately 1 hour. The token exchange to a long-lived token (60 days) either was not performed during initial setup, or the long-lived token itself expired. Error 190 specifically indicates an expired or invalid access token.

### Recommended Action
1. Re-authenticate FB-02 through the Spikerz UI: Settings → Connected Accounts → Reconnect
2. Ensure the initial OAuth flow exchanges the short-lived token for a long-lived token
3. Implement proactive token refresh 24 hours before expiry
4. Add monitoring for token lifetime remaining in health checks

---

## BUG-003: LinkedIn Token Expired — Re-authentication Required (Day 4)

| Field | Detail |
|-------|--------|
| **Severity** | High |
| **Platform** | LinkedIn |
| **Account** | LI-03 QA Secondary Profile |
| **Status** | Open |
| **Detected** | Day 4 health check |

### Description
LinkedIn secondary profile LI-03 reported token expiry during the Day 4 health check. The account could not be reached and all permissions were marked as revoked.

### Reproduction Steps
1. Navigate to the QA Dashboard
2. View account LI-03 (LinkedIn Secondary Profile)
3. Run a health check for Day 4
4. Observe: Connection = "disconnected", token_validity = "expired", permissions = "revoked"

### Evidence
- Health check log: `reports/day_4_report.json` → LI-03 entry
- Error: "Token expired - requires re-authentication"
- Token validity: `expired`

### Root Cause
LinkedIn OAuth 2.0 access tokens have a 60-day lifetime. The test account's token was set up during initial configuration and expired during the monitoring period. LinkedIn does not support automatic token refresh for most API scopes — the user must re-authorize.

### Recommended Action
1. Re-authenticate LI-03 through Settings → Connected Accounts → Reconnect
2. Track token creation dates and set alerts for 7 days before expiry
3. Consider implementing a token lifecycle manager that proactively notifies the QA team
4. Document the re-authentication procedure for each platform in the team runbook

---

## Summary

| Bug ID | Platform | Severity | Day | Status | Type |
|--------|----------|----------|-----|--------|------|
| BUG-001 | TikTok | Medium | 2 | Open | Quota exceeded |
| BUG-002 | Facebook | High | 3 | Open | Session expired |
| BUG-003 | LinkedIn | High | 4 | Open | Token expired |

### Patterns Observed
1. **Token/session management** is the primary failure mode across platforms
2. **Day 1** had zero issues — problems emerged as tokens aged and quotas accumulated
3. **Day 5** recovered to a healthy state with warnings, suggesting most issues are transient
4. No issues were detected on Instagram or X during the 5-day period
