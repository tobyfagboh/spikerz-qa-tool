const path = require('path');
const fs = require('fs');
const { getDb, closeDb, resetDb } = require('../src/db/database');
const accountService = require('../src/services/accountService');

const TEST_DB = path.join(__dirname, 'test_accounts.db');

beforeEach(() => {
  resetDb();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  process.env.DB_PATH = TEST_DB;
  getDb(TEST_DB);
});

afterEach(() => {
  closeDb();
  [TEST_DB, TEST_DB + '-wal', TEST_DB + '-shm'].forEach(f => {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });
});

describe('AccountService', () => {
  const sampleAccount = {
    platform: 'linkedin',
    account_type: 'personal',
    account_name: 'Test LinkedIn Account',
    account_handle: '@testlinkedin',
    owner: 'qa-team',
    environment: 'test'
  };

  test('should create an account with auto-generated ID', () => {
    const account = accountService.create(sampleAccount);
    expect(account).toBeDefined();
    expect(account.id).toBeDefined();
    expect(account.platform).toBe('linkedin');
    expect(account.account_name).toBe('Test LinkedIn Account');
    expect(account.status).toBe('active');
    expect(account.connection_status).toBe('disconnected');
  });

  test('should create an account with provided ID', () => {
    const account = accountService.create({ ...sampleAccount, id: 'CUSTOM-001' });
    expect(account.id).toBe('CUSTOM-001');
  });

  test('should retrieve an account by ID', () => {
    const created = accountService.create(sampleAccount);
    const retrieved = accountService.getById(created.id);
    expect(retrieved).toBeDefined();
    expect(retrieved.id).toBe(created.id);
    expect(retrieved.account_name).toBe(sampleAccount.account_name);
  });

  test('should return null for non-existent account', () => {
    const result = accountService.getById('non-existent');
    expect(result).toBeNull();
  });

  test('should list all accounts', () => {
    accountService.create({ ...sampleAccount, account_name: 'Account 1' });
    accountService.create({ ...sampleAccount, account_name: 'Account 2', platform: 'facebook' });

    const all = accountService.getAll();
    expect(all.length).toBe(2);
  });

  test('should filter accounts by platform', () => {
    accountService.create({ ...sampleAccount, account_name: 'LI Account', platform: 'linkedin' });
    accountService.create({ ...sampleAccount, account_name: 'FB Account', platform: 'facebook', account_type: 'page' });

    const linkedinOnly = accountService.getAll({ platform: 'linkedin' });
    expect(linkedinOnly.length).toBe(1);
    expect(linkedinOnly[0].platform).toBe('linkedin');
  });

  test('should update an account', () => {
    const created = accountService.create(sampleAccount);
    const updated = accountService.update(created.id, {
      status: 'suspended',
      connection_status: 'disconnected',
      notes: 'Updated via test'
    });

    expect(updated.status).toBe('suspended');
    expect(updated.connection_status).toBe('disconnected');
    expect(updated.notes).toBe('Updated via test');
  });

  test('should return null when updating non-existent account', () => {
    const result = accountService.update('non-existent', { status: 'active' });
    expect(result).toBeNull();
  });

  test('should delete an account', () => {
    const created = accountService.create(sampleAccount);
    const deleted = accountService.delete(created.id);
    expect(deleted).toBe(true);

    const retrieved = accountService.getById(created.id);
    expect(retrieved).toBeNull();
  });

  test('should return false when deleting non-existent account', () => {
    const result = accountService.delete('non-existent');
    expect(result).toBe(false);
  });

  test('should bulk import accounts', () => {
    const accounts = [
      { ...sampleAccount, account_name: 'Bulk 1' },
      { ...sampleAccount, account_name: 'Bulk 2', platform: 'facebook', account_type: 'page' },
      { ...sampleAccount, account_name: 'Bulk 3', platform: 'instagram', account_type: 'business' }
    ];

    const result = accountService.bulkImport(accounts);
    expect(result.created).toBe(3);
    expect(result.errors.length).toBe(0);

    const all = accountService.getAll();
    expect(all.length).toBe(3);
  });

  test('should parse JSON fields correctly', () => {
    const account = accountService.create({
      ...sampleAccount,
      connected_assets: ['feed', 'analytics'],
      permissions: ['read', 'write']
    });

    expect(Array.isArray(account.connected_assets)).toBe(true);
    expect(account.connected_assets).toEqual(['feed', 'analytics']);
    expect(account.permissions).toEqual(['read', 'write']);
  });

  test('should get platform counts', () => {
    accountService.create({ ...sampleAccount, platform: 'linkedin' });
    accountService.create({ ...sampleAccount, platform: 'linkedin', account_name: 'LI 2' });
    accountService.create({ ...sampleAccount, platform: 'facebook', account_name: 'FB 1', account_type: 'page' });

    const counts = accountService.getCountsByPlatform();
    expect(counts.length).toBe(2);

    const liCount = counts.find(c => c.platform === 'linkedin');
    expect(liCount.count).toBe(2);
  });
});
