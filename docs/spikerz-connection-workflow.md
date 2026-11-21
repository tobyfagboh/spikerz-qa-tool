# Spikerz UI — Account Connection Workflow

> **Note:** This workflow is documented based on research of Spikerz's public documentation and typical social media management platform patterns. Actual Spikerz UI access was not available during this assessment.

## Overview

Connecting a test account to the Spikerz UI follows a standard OAuth-based flow. Each platform requires the user to authorize Spikerz to access their account through the platform's native permission dialog.

## General Connection Flow

1. **Log in to Spikerz** — Navigate to the Spikerz dashboard and sign in with your QA team credentials.
2. **Navigate to Connected Accounts** — Go to Settings → Connected Accounts (or equivalent).
3. **Select Platform** — Click "Add Account" or "Connect" and choose the target platform (LinkedIn, Facebook, Instagram, TikTok, or X).
4. **Authorize** — You are redirected to the platform's OAuth consent screen. Grant the requested permissions.
5. **Confirm Connection** — After authorization, you are redirected back to Spikerz. The account appears in the connected accounts list.
6. **Verify** — Confirm the connection status shows "Connected" and the expected assets (feed, analytics, etc.) are accessible.

## Platform-Specific Notes

### LinkedIn
- **Auth type:** OAuth 2.0
- **Required scopes:** `r_liteprofile`, `r_emailaddress`, `w_member_social`
- **Notes:** Company Pages require admin access on LinkedIn. Personal profiles connect with the authenticated user's own credentials.
- **Token lifetime:** 60 days (refresh required)

### Facebook (Profile & Page)
- **Auth type:** OAuth 2.0 via Facebook Login
- **Required scopes:** `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`
- **Notes:** Pages require the connecting user to be a Page admin. The user must also grant extended permissions for Messenger access. Tokens are session-based and may require re-authentication.
- **Token lifetime:** Short-lived (1 hour) → long-lived (60 days) exchange

### Instagram
- **Auth type:** Instagram Graph API via Facebook OAuth
- **Required scopes:** `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`
- **Notes:** Must be a Business or Creator account (not personal). Connected through the linked Facebook Page. Personal accounts have limited API access.
- **Token lifetime:** 60 days (same as Facebook long-lived token)

### TikTok
- **Auth type:** OAuth 2.0 (TikTok for Developers)
- **Required scopes:** `user.info.basic`, `video.list`, `video.publish`
- **Notes:** Sandbox accounts have daily API quotas. Business accounts provide fuller API access. Watch for automated activity detection flags.
- **Token lifetime:** 24 hours (refresh token: 365 days)

### X (Twitter)
- **Auth type:** OAuth 2.0 (X API v2)
- **Required scopes:** `tweet.read`, `tweet.write`, `users.read`
- **Notes:** API access tier determines rate limits. Free tier has very limited access. Basic tier ($100/mo) or Pro required for meaningful test coverage. App-level rate limits apply across all connected accounts.
- **Token lifetime:** 2 hours (refresh token: 6 months)

## Manual Connection Steps (When Automatic Auth Fails)

If OAuth connection fails:

1. Navigate to the platform's developer portal
2. Generate an access token manually
3. In Spikerz Settings → Connected Accounts, choose "Manual Token Entry"
4. Paste the access token and refresh token
5. Set the expiry date
6. Test the connection using the "Verify" button

## Disconnection Handling

When an account becomes disconnected:

1. **Check the reason** — Token expiry, permission revocation, or account restriction
2. **For token expiry** — Re-authenticate through Settings → Connected Accounts → Reconnect
3. **For permission revocation** — The user must re-authorize on the platform's side
4. **For account restriction** — Contact platform support, then reconnect once resolved

## Expected Evidence for Each Account

For each of the 15 test accounts, the following evidence would be captured:

- Screenshot of the Spikerz "Add Account" selection screen
- Screenshot of the platform OAuth consent screen
- Screenshot of the successful connection confirmation in Spikerz
- Screenshot of the account appearing in the Connected Accounts list with status "Connected"
- Screenshot of accessible assets (feed, analytics, etc.)
