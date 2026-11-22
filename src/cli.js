#!/usr/bin/env node

/**
 * Spikerz QA Tool — CLI Interface
 *
 * Commands:
 *   seed                          Seed the database with 15 test accounts
 *   health-check                  Run a health check (requires --day)
 *   health-check --simulate-days 5  Simulate all 5 days of health checks
 *   report --day <n>              Generate a daily report
 *   report --final                Generate the final 5-day summary report
 *   accounts                      List all accounts
 *   issues                        List all issues
 */

require('dotenv').config();
const { getDb, closeDb } = require('./db/database');
const accountService = require('./services/accountService');
const healthCheckService = require('./services/healthCheckService');
const maintenanceLogService = require('./services/maintenanceLogService');
const reportService = require('./services/reportService');
const fs = require('fs');
const path = require('path');

// Initialize DB
getDb();

const args = process.argv.slice(2);
const command = args[0];

function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

function hasFlag(flag) {
  return args.includes(flag);
}

async function main() {
  switch (command) {
    case 'seed': {
      const seedPath = path.join(__dirname, '..', 'data', 'seed_accounts.json');
      if (!fs.existsSync(seedPath)) {
        console.error('Seed file not found at', seedPath);
        process.exit(1);
      }
      const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
      const result = accountService.bulkImport(seedData.accounts);
      console.log(`Seeded ${result.created} accounts.`);
      if (result.errors.length > 0) {
        console.log('Errors:', result.errors);
      }

      // Add setup log entry
      maintenanceLogService.add({
        day_number: 0,
        log_date: new Date().toISOString().split('T')[0],
        category: 'setup',
        description: `Initial seed: ${result.created} test accounts imported across 5 platforms (LinkedIn, Facebook, Instagram, TikTok, X).`,
        action_taken: 'Bulk import from seed_accounts.json',
        outcome: 'success'
      });
      break;
    }

    case 'health-check': {
      const simulateDays = getArg('--simulate-days');

      if (simulateDays) {
        const days = parseInt(simulateDays);
        console.log(`\nSimulating ${days}-day health check monitoring period...\n`);

        // Calculate start date so Day N = (today - days + N)
        // This produces calendar-spread timestamps, e.g., for 5 days ending today:
        // Day 1 = 4 days ago, Day 2 = 3 days ago, ..., Day 5 = today
        const today = new Date();
        today.setUTCHours(8, 0, 0, 0); // Health checks run at 08:00 UTC daily

        for (let day = 1; day <= days; day++) {
          const checkDate = new Date(today);
          checkDate.setUTCDate(checkDate.getUTCDate() - days + day);
          const timestamp = checkDate.toISOString();
          const dateStr = timestamp.split('T')[0];

          console.log(`--- Day ${day} (${dateStr}) ---`);
          const results = healthCheckService.runAll(day, timestamp);
          maintenanceLogService.generateFromHealthCheck(day, results, dateStr);

          console.log(`  Total: ${results.total} | Healthy: ${results.healthy} | Warnings: ${results.warnings} | Errors: ${results.errors}`);

          // Generate daily report
          reportService.generateDailyReport(day, 'json');
          reportService.generateDailyReport(day, 'html');
          reportService.generateDailyReport(day, 'csv');
          console.log(`  Reports saved to ./reports/day_${day}_report.{json,html,csv}\n`);
        }

        // Generate final report
        const finalJson = reportService.generateFinalReport('json');
        const finalHtml = reportService.generateFinalReport('html');
        console.log('Final summary report saved to ./reports/final_report.{json,html}');
      } else {
        const day = getArg('--day');
        if (!day) {
          console.error('Usage: health-check --day <1-5> or health-check --simulate-days 5');
          process.exit(1);
        }
        const dayNum = parseInt(day);
        console.log(`Running health check for Day ${dayNum}...`);
        const results = healthCheckService.runAll(dayNum);
        maintenanceLogService.generateFromHealthCheck(dayNum, results);
        console.log(`Total: ${results.total} | Healthy: ${results.healthy} | Warnings: ${results.warnings} | Errors: ${results.errors}`);
      }
      break;
    }

    case 'report': {
      if (hasFlag('--final')) {
        const format = getArg('--format') || 'json';
        const result = reportService.generateFinalReport(format);
        console.log(`Final report generated: ${result.path || 'stdout'}`);
        if (!result.path) console.log(JSON.stringify(result.data, null, 2));
      } else {
        const day = getArg('--day');
        if (!day) {
          console.error('Usage: report --day <1-5> or report --final');
          process.exit(1);
        }
        const format = getArg('--format') || 'json';
        const result = reportService.generateDailyReport(parseInt(day), format);
        console.log(`Report generated: ${result.path || 'stdout'}`);
      }
      break;
    }

    case 'import': {
      const filePath = getArg('--file');
      if (!filePath) {
        console.error('Usage: import --file <path.json|path.csv>');
        process.exit(1);
      }
      const absPath = path.resolve(filePath);
      if (!fs.existsSync(absPath)) {
        console.error(`File not found: ${absPath}`);
        process.exit(1);
      }

      const ext = path.extname(absPath).toLowerCase();
      let result;

      if (ext === '.csv') {
        console.log(`Importing accounts from CSV: ${absPath}`);
        result = accountService.importFromCsv(absPath);
      } else if (ext === '.json') {
        console.log(`Importing accounts from JSON: ${absPath}`);
        const data = JSON.parse(fs.readFileSync(absPath, 'utf-8'));
        const accounts = Array.isArray(data) ? data : data.accounts;
        result = accountService.bulkImport(accounts);
      } else {
        console.error('Unsupported file format. Use .json or .csv');
        process.exit(1);
      }

      console.log(`Imported ${result.created} accounts.`);
      if (result.errors.length > 0) {
        console.log('Errors:', result.errors);
      }
      break;
    }

    case 'accounts': {
      const accounts = accountService.getAll();
      console.log(`\nTotal accounts: ${accounts.length}\n`);
      console.log('Platform    | Account Name         | Status     | Connection  | Last Check');
      console.log('------------|----------------------|------------|-------------|--------------------');
      for (const a of accounts) {
        console.log(
          `${a.platform.padEnd(12)}| ${a.account_name.padEnd(21)}| ${a.status.padEnd(11)}| ${a.connection_status.padEnd(12)}| ${a.last_health_check || 'never'}`
        );
      }
      break;
    }

    case 'issues': {
      const issues = healthCheckService.getIssues();
      console.log(`\nTotal issues: ${issues.length}\n`);
      for (const i of issues) {
        console.log(`[${i.severity.toUpperCase()}] ${i.title}`);
        console.log(`  Status: ${i.status} | Created: ${i.created_at}`);
        console.log(`  ${i.description.split('\n')[0]}\n`);
      }
      break;
    }

    default:
      console.log(`
Spikerz QA Tool — CLI

Usage:
  node src/cli.js seed                            Import 15 test accounts
  node src/cli.js import --file <path.json|.csv>  Import accounts from CSV or JSON
  node src/cli.js health-check --day <1-5>        Run health check for a specific day
  node src/cli.js health-check --simulate-days 5  Simulate all 5 days
  node src/cli.js report --day <1-5>              Generate daily report
  node src/cli.js report --final                  Generate final summary report
  node src/cli.js accounts                        List all accounts
  node src/cli.js issues                          List detected issues
      `);
  }

  closeDb();
}

main().catch(err => {
  console.error('Error:', err);
  closeDb();
  process.exit(1);
});
