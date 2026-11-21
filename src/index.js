require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const { getDb } = require('./db/database');
const accountRoutes = require('./routes/accounts');
const healthCheckRoutes = require('./routes/healthChecks');
const reportService = require('./services/reportService');
const healthCheckService = require('./services/healthCheckService');
const maintenanceLogService = require('./services/maintenanceLogService');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Initialize database
getDb();

// API Routes
app.use('/api/accounts', accountRoutes);
app.use('/api/health-checks', healthCheckRoutes);

// Report routes
app.get('/api/reports/daily/:day', (req, res) => {
  try {
    const format = req.query.format || 'json';
    const result = reportService.generateDailyReport(parseInt(req.params.day), format);
    if (format === 'json') {
      res.json({ success: true, data: result.data });
    } else {
      res.json({ success: true, path: result.path });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/reports/final', (req, res) => {
  try {
    const format = req.query.format || 'json';
    const result = reportService.generateFinalReport(format);
    if (format === 'json') {
      res.json({ success: true, data: result.data });
    } else {
      res.json({ success: true, path: result.path });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Dashboard route
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
});

// Root
app.get('/', (req, res) => {
  res.json({
    name: 'Spikerz QA Tool',
    version: '1.0.0',
    description: 'Test Account Management and Monitoring System',
    endpoints: {
      dashboard: '/dashboard',
      accounts: '/api/accounts',
      accountsSummary: '/api/accounts/summary',
      healthCheckRun: 'POST /api/health-checks/run',
      healthCheckDay: '/api/health-checks/day/:dayNumber',
      healthCheckHistory: '/api/health-checks/account/:accountId',
      issues: '/api/health-checks/issues',
      maintenanceLog: '/api/health-checks/maintenance-log',
      dailyReport: '/api/reports/daily/:day',
      finalReport: '/api/reports/final'
    }
  });
});

// Schedule daily health checks (configurable via HEALTH_CHECK_CRON env var)
const cronSchedule = process.env.HEALTH_CHECK_CRON || '0 8 * * *';
if (cron.validate(cronSchedule)) {
  cron.schedule(cronSchedule, () => {
    console.log(`[${new Date().toISOString()}] Running scheduled health check...`);
    // In production, day_number would be calculated from monitoring start date
    // For this assessment, it logs the check with the current timestamp
    const results = healthCheckService.runAll(1);
    maintenanceLogService.generateFromHealthCheck(1, results);
    console.log(`Health check complete: ${results.healthy}/${results.total} healthy`);
  });
  console.log(`Health check scheduled: ${cronSchedule}`);
}

// Start server
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║   Spikerz QA Tool — v1.0.0              ║
  ║   Server running on port ${PORT}            ║
  ║   Dashboard: http://localhost:${PORT}/dashboard ║
  ║   API:       http://localhost:${PORT}/         ║
  ╚══════════════════════════════════════════╝
  `);
});

module.exports = app;
