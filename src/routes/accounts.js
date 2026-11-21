const express = require('express');
const router = express.Router();
const accountService = require('../services/accountService');
const fs = require('fs');
const path = require('path');

// GET /api/accounts - List all accounts with optional filters
router.get('/', (req, res) => {
  try {
    const filters = {};
    if (req.query.platform) filters.platform = req.query.platform;
    if (req.query.status) filters.status = req.query.status;
    if (req.query.connection_status) filters.connection_status = req.query.connection_status;
    if (req.query.environment) filters.environment = req.query.environment;

    const accounts = accountService.getAll(filters);
    res.json({ success: true, count: accounts.length, data: accounts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/accounts/summary - Platform-level summary
router.get('/summary', (req, res) => {
  try {
    const summary = accountService.getCountsByPlatform();
    res.json({ success: true, data: summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/accounts/:id - Get single account
router.get('/:id', (req, res) => {
  try {
    const account = accountService.getById(req.params.id);
    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }
    res.json({ success: true, data: account });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/accounts - Create a new account
router.post('/', (req, res) => {
  try {
    const { platform, account_type, account_name } = req.body;
    if (!platform || !account_name) {
      return res.status(400).json({
        success: false,
        error: 'platform and account_name are required'
      });
    }
    const account = accountService.create(req.body);
    res.status(201).json({ success: true, data: account });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/accounts/:id - Update an account
router.put('/:id', (req, res) => {
  try {
    const account = accountService.update(req.params.id, req.body);
    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }
    res.json({ success: true, data: account });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/accounts/:id - Delete an account
router.delete('/:id', (req, res) => {
  try {
    const deleted = accountService.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Account not found' });
    }
    res.json({ success: true, message: 'Account deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/accounts/import - Bulk import from JSON
router.post('/import', (req, res) => {
  try {
    const { accounts } = req.body;
    if (!Array.isArray(accounts)) {
      return res.status(400).json({
        success: false,
        error: 'Request body must contain an "accounts" array'
      });
    }
    const results = accountService.bulkImport(accounts);
    res.json({ success: true, ...results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
