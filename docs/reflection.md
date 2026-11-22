# Reflection Document

## What did you build?

I built a **test account management and monitoring system** — a Node.js application that manages 15 social media test accounts across LinkedIn, Facebook, Instagram, TikTok, and X. The system consists of:

1. **A REST API** (Express.js) with full CRUD for accounts, health check execution, issue tracking, and report generation
2. **A web dashboard** showing real-time account health across platforms with color-coded status indicators
3. **A CLI tool** for seeding accounts, running health checks, simulating multi-day monitoring, and generating reports
4. **An automated health check engine** that inspects connection status, token validity, permissions, and errors for each account
5. **Auto-generated issue tracking** — when a health check detects an error, the system automatically creates a structured bug report with severity, reproduction steps, and recommended actions
6. **A maintenance log** that journals every operational event across the 5-day monitoring period
7. **Multi-format reporting** — daily and final summary reports in JSON, CSV, and HTML

The data layer uses SQLite with a relational schema (accounts, health_checks, maintenance_log, issues) with proper indexing and foreign key constraints.

## What challenges did you face?

1. **No Spikerz platform access** — Without access to the Spikerz UI, I could not perform real account connections or take screenshots. I addressed this by researching the expected OAuth workflows for each platform and documenting them thoroughly, while clearly stating the mock approach and why.

2. **Realistic simulation design** — Making mock health checks realistic enough to demonstrate the system's value required thinking through actual failure modes: token expiry timelines, rate limit patterns, platform-specific error codes (Facebook Graph API Error 190, TikTok sandbox quotas). I designed the simulations to produce a realistic curve — clean Day 1, emerging issues on Days 2–4, partial recovery on Day 5.

3. **Balancing scope with time** — The assessment asks for a lot: inventory, onboarding workflow, automation, monitoring, issue documentation, 5-day logs, and a reflection. I prioritized the working tool and reports first, then documentation, ensuring every deliverable exists even if some (like the Spikerz UI screenshots) are documented as expected workflows rather than actual captures.

4. **Platform-specific credential handling** — Each social platform has different OAuth flows, token lifetimes, and refresh mechanisms. Rather than implementing 5 separate OAuth clients (which would require real API credentials), I abstracted credential handling behind vault reference IDs and documented each platform's specifics.

## What would you improve with more time?

1. **Real platform API integrations** — Replace mock checks with actual API calls using platform SDKs. This would involve setting up OAuth apps on each platform's developer portal, implementing token refresh flows, and handling platform-specific error responses.

2. **Automated retry logic** — Add exponential backoff for transient failures, with configurable retry counts per platform. The current system detects errors but doesn't automatically retry.

3. **Alerting system** — Integrate Slack webhook or email notifications for critical failures. Currently issues are logged but not pushed to the team.

4. **Richer dashboard** — Add historical trend charts (health over time), account detail drill-down, one-click reconnection, and a maintenance log timeline view.

5. **CI/CD pipeline** — *(Implemented)* Added a GitHub Actions workflow (`.github/workflows/ci.yml`) that runs tests on Node 18.x and 20.x, generates coverage reports, runs the full 5-day simulation, and uploads report artifacts. With more time, I would add deployment stages and environment promotion gates.

6. **Audit trail** — Track who changed each account record and when, with a full change history. The database schema supports this but the feature isn't implemented.

7. **Token lifecycle management** — Proactive monitoring of token expiry dates with alerts at 7-day, 3-day, and 1-day thresholds, plus automated refresh for platforms that support it.

## How would this scale from 15 accounts to 100+ accounts?

### Database
- **Migrate from SQLite to PostgreSQL** — SQLite handles 15 accounts well but would become a bottleneck with concurrent reads/writes at scale. PostgreSQL provides connection pooling, row-level locking, and better concurrent access.
- **Add partitioning** on the health_checks table by date range, as this table grows fastest (100 accounts × daily checks × 365 days).

### Health Checks
- **Parallel execution** — Currently checks run sequentially. At 100+ accounts, implement a worker pool with configurable concurrency (e.g., 10 concurrent checks). Use a job queue (Bull/BullMQ with Redis) for reliability.
- **Platform-aware rate limiting** — Each platform has different rate limits. Group checks by platform and throttle accordingly to avoid hitting API limits.
- **Staggered scheduling** — Instead of checking all accounts at 8:00 AM, distribute checks across a 2-hour window to reduce API load spikes.

### Infrastructure
- **Containerization** — Docker + Docker Compose for consistent deployment. Separate containers for the API, scheduler, and database.
- **Horizontal scaling** — Run multiple API instances behind a load balancer. Health check workers would be stateless and scalable.
- **Monitoring** — Add application-level monitoring (Datadog/Prometheus) to track health check latency, error rates, and system resource usage.

### Organization
- **Multi-team support** — Add team/owner scoping so different QA teams manage their own account subsets.
- **Role-based access** — Admin, QA lead, and QA tester roles with appropriate permissions.
- **Account grouping** — Tag and group accounts by project, campaign, or test suite for bulk operations.
