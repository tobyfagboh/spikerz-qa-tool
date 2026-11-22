/**
 * Credential Vault — Secure credential retrieval abstraction.
 *
 * In production, this would integrate with:
 *   - AWS Secrets Manager
 *   - HashiCorp Vault
 *   - Azure Key Vault
 *   - GCP Secret Manager
 *
 * For this assessment, credentials are resolved from environment variables
 * with structured logging of every access attempt for audit purposes.
 */

const accessLog = [];

/**
 * Resolve a credential by its vault reference ID.
 *
 * @param {string} refId — The vault reference (e.g., "VAULT_LI_001")
 * @returns {{ token: string|null, refreshToken: string|null, expiresAt: string|null }}
 */
function getCredential(refId) {
  const entry = {
    refId,
    timestamp: new Date().toISOString(),
    source: null,
    success: false
  };

  try {
    // Strategy 1: Environment variable (e.g., VAULT_LI_001_TOKEN)
    const tokenKey = `${refId}_TOKEN`;
    const refreshKey = `${refId}_REFRESH_TOKEN`;
    const expiryKey = `${refId}_EXPIRES_AT`;

    const token = process.env[tokenKey] || null;
    const refreshToken = process.env[refreshKey] || null;
    const expiresAt = process.env[expiryKey] || null;

    if (token) {
      entry.source = 'env';
      entry.success = true;
      accessLog.push(entry);
      return { token, refreshToken, expiresAt };
    }

    // Strategy 2: Mock mode — return a simulated credential
    if (process.env.CHECK_MODE === 'mock' || !process.env.CREDENTIAL_VAULT) {
      entry.source = 'mock';
      entry.success = true;
      accessLog.push(entry);
      return {
        token: `mock_token_${refId}_${Date.now()}`,
        refreshToken: `mock_refresh_${refId}`,
        expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString() // 60 days
      };
    }

    // Strategy 3: External vault (placeholder for real integration)
    // In production: const client = new SecretsManagerClient({ region: 'us-east-1' });
    //                const secret = await client.send(new GetSecretValueCommand({ SecretId: refId }));
    entry.source = 'vault';
    entry.success = false;
    entry.error = 'External vault integration not configured';
    accessLog.push(entry);
    return { token: null, refreshToken: null, expiresAt: null };

  } catch (err) {
    entry.error = err.message;
    accessLog.push(entry);
    return { token: null, refreshToken: null, expiresAt: null };
  }
}

/**
 * Check whether a credential's token is still valid (not expired).
 *
 * @param {string} refId
 * @returns {{ valid: boolean, expiresIn: number|null, source: string }}
 */
function validateCredential(refId) {
  const cred = getCredential(refId);

  if (!cred.token) {
    return { valid: false, expiresIn: null, source: 'none' };
  }

  if (!cred.expiresAt) {
    return { valid: true, expiresIn: null, source: getLastAccessSource() };
  }

  const expiresAt = new Date(cred.expiresAt);
  const now = new Date();
  const expiresInMs = expiresAt.getTime() - now.getTime();

  return {
    valid: expiresInMs > 0,
    expiresIn: Math.max(0, Math.floor(expiresInMs / 1000)),
    expiringsSoon: expiresInMs > 0 && expiresInMs < 7 * 24 * 60 * 60 * 1000, // < 7 days
    source: getLastAccessSource()
  };
}

/**
 * Return the full access audit log.
 */
function getAccessLog() {
  return [...accessLog];
}

/**
 * Clear the access log (for testing).
 */
function clearAccessLog() {
  accessLog.length = 0;
}

function getLastAccessSource() {
  return accessLog.length > 0 ? accessLog[accessLog.length - 1].source : 'unknown';
}

module.exports = {
  getCredential,
  validateCredential,
  getAccessLog,
  clearAccessLog
};
