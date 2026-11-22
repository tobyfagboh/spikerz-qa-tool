const express = require('express');
const router = express.Router();
const healthCheckService = require('../services/healthCheckService');
const maintenanceLogService = require('../services/maintenanceLogService');
const { getAccessLog } = require('../utils/credentialVault');

// POST /api/health-checks/run - Run health checks for all accounts
router.post('/run', (req, res) => {
  try {
    const { day_number } = req.body;
    if (!day_number || day_number < 1 || day_number > 5) {
      return res.status(400).json({
        success: false,
        error: 'day_number is required (1-5)'
      });
    }

    const results = healthCheckService.runAll(day_number);
    maintenanceLogService.generateFromHealthCheck(day_number, results);

    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/health-checks/day/:dayNumber - Get results for a specific day
router.get('/day/:dayNumber', (req, res) => {
  try {
    const dayNumber = parseInt(req.params.dayNumber);
    const results = healthCheckService.getByDay(dayNumber);
    res.json({ success: true, count: results.length, data: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/health-checks/account/:accountId - Get history for an account
router.get('/account/:accountId', (req, res) => {
  try {
    const history = healthCheckService.getHistory(req.params.accountId);
    res.json({ success: true, count: history.length, data: history });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/health-checks/issues - Get all issues
router.get('/issues', (req, res) => {
  try {
    const filters = {};
    if (req.query.severity) filters.severity = req.query.severity;
    if (req.query.status) filters.status = req.query.status;

    const issues = healthCheckService.getIssues(filters);
    res.json({ success: true, count: issues.length, data: issues });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/maintenance-log - Get full maintenance log
router.get('/maintenance-log', (req, res) => {
  try {
    const log = req.query.day
      ? maintenanceLogService.getByDay(parseInt(req.query.day))
      : maintenanceLogService.getAll();
    res.json({ success: true, count: log.length, data: log });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/health-checks/vault-audit - Credential vault access log
router.get('/vault-audit', (req, res) => {
  try {
    const log = getAccessLog();
    res.json({
      success: true,
      count: log.length,
      data: log
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
