# AI Project Context

This file is written for future AI assistants and developers working on the Sunwave Tech Dashboard. Read this before making changes.

## Project Summary

This is the KPI and operations dashboard for Sunwave Plumbing. It is a Node/Express web app deployed on Railway and used to turn Housecall Pro and QuickBooks data into live business dashboards.

The highest-trust surface is the technician KPI leaderboard. Technicians use it to understand how much value they created, how many jobs they completed, their average ticket, unpaid work, split-credit jobs, and whether anything needs admin review. Because technicians rely on these numbers, accuracy and explainability matter more than visual flair.

## Company Context

Sunwave Plumbing is a plumbing service company. The app copy and data model are built around field technicians, completed service jobs, invoices, estimate sellers, paid jobs, dispatch/service dates, and owner/operator financial visibility.

Operationally, the company uses:

- Housecall Pro as the main field-service system for jobs, estimates, invoices, employees, customers, payments, schedules, and tags.
- QuickBooks Online for financial reporting, marketing spend, profit and loss, balance sheet, and reconciliation state.
- Railway for deployment and environment variables.

## Primary Users

- Technicians: use the main dashboard on mobile or desktop to see their KPI leaderboard, job credit, split credit, unpaid work, and any work that could not be attributed.
- Admin/manager: uses `/admin` or `/admin/kpi` to reconcile jobs, fix attribution, mark jobs paid, exclude duplicates/import artifacts, and review technician-reported issues.
- Owners/location leaders: use the owners tab for QuickBooks-backed financial visibility and trends.
- Marketing/operations users: use the marketing tab for spend, revenue, projection, and QBO-backed marketing visibility.
- Future developers/AI agents: maintain the HCP/QBO integrations and keep the KPI logic reliable.

## Important Routes

- `/` - main dashboard with Technicians, Marketing, and Location Leaders tabs.
- `/api/metrics?range=mtd` - technician KPI data from Housecall Pro.
- `/diagnostics` or `/di` - protected KPI diagnostics page for investigating specific jobs, invoices, split invoices, financing issues, and missing dashboard credit.
- `/coverage` - protected paid jobs audit that enumerates paid HCP invoices and checks whether dollars landed on the leaderboard.
- `/admin` or `/admin/kpi` - protected reconciliation/admin page.
- `/report-issue` - technician-facing issue report form.
- `/connect-quickbooks` - QBO OAuth connection flow.

## Environment Variables

Do not hardcode secrets.

- `HOUSECALL_PRO_API_KEY` - Housecall Pro public API key. Sent as `Authorization: Token {key}`.
- `DIAGNOSTICS_PASSWORD` - private password for diagnostics/admin pages. `DIAGNOSTICS_TOKEN` is still accepted for backward compatibility.
- `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REDIRECT_URI`, `QBO_REALM_ID`, `QBO_REFRESH_TOKEN` - QuickBooks OAuth settings.
- `QBO_TOKEN_DIR` - persistent Railway volume path. Important because QBO refresh tokens rotate and local files on Railway are otherwise ephemeral.
- `ST_CUTOVER_DATE` - optional ServiceTitan migration cutoff override. Default is April 1, 2026.

## Data Sources

Housecall Pro endpoints used heavily:

- `/jobs` and `/jobs/{id}`
- `/invoices`
- `/estimates` and `/estimates/{id}`
- `/employees`

QuickBooks endpoints are reached through QBO reports:

- Profit and Loss
- Profit and Loss Detail
- General Ledger
- Balance Sheet

The local HCP reference lives at `docs/housecall-pro-public-api-v1.md`.

## KPI Attribution Rules

The technician dashboard is not a simple "sum completed jobs" table. It applies Sunwave-specific rules.

- Primary job date comes from `kpiDateForJob(job)`.
- If a job is completed more than 3 days after scheduled start, the KPI date moves back to scheduled start so late admin cleanup does not shift historical work.
- If a job is still open more than 3 days after scheduled start, it may auto-date based on the scheduled date.
- ServiceTitan migration artifacts after the cutover date are excluded.
- If a linked estimate seller exists, seller credit is one-third and doer credit is two-thirds.
- If no seller exists, assigned technicians split 100%.
- Manual admin reconciliations override automatic attribution.
- Admin exclusions hide a job entirely.
- Paid invoice rescue logic exists so paid jobs that do not show through the primary jobs query can still be credited or surfaced as unattributed.

## Important Reliability Goal

The technician KPI dashboard should never silently drop money.

Every paid invoice in a period should end up in one of these states:

- Credited to one or more technicians.
- Reconciled manually by admin.
- Excluded intentionally by admin.
- Listed as unattributed/needs review with a clear reason.

If a change weakens this guarantee, do not ship it.

## Known Edge Cases

Pay special attention to these:

- Split invoices such as `326-1` and `326-2`, including negative balances or overpayment/credit behavior.
- HCP financing jobs where approval/funding may not appear like a normal card/cash payment.
- Jobs with no `assigned_employees`.
- Standalone invoices with no `job_id`.
- Jobs paid in one period but serviced in another.
- Jobs completed late after the month closes.
- Imported ServiceTitan data.
- Duplicate HCP employee records.
- Low-confidence seller inference from prior estimates or related visits.
- Cached dashboard data disagreeing with diagnostics/admin views.

## Admin Reconciliation

Admin reconciliation is authoritative. It can:

- Assign one or more technicians.
- Set Sold, Did, or Sold & Did roles.
- Override credit percentages.
- Override total amount or KPI date.
- Mark a job paid for dashboard purposes.
- Exclude a job entirely.

Reconciliations are stored in `kpi-reconciliations.json` under `QBO_TOKEN_DIR` when configured, otherwise in the repo directory for local development.

Issue reports are stored similarly in `kpi-issue-reports.json`.

## Caching Notes

Caching exists for speed, but correctness must win.

- `/api/metrics` uses a short response cache.
- Shared raw HCP job pulls are cached separately.
- Coverage diagnostics has its own cache.
- Employee lists are cached for several hours.
- Admin reconciliation should invalidate every KPI-facing cache, not only `/api/metrics`.
- Force refresh paths should avoid stale in-flight request overwrite.

When changing cache behavior, check all affected surfaces: main dashboard, admin period jobs, coverage, diagnostics, and technician issue reporting.

## Frontend Structure

- `public/index.html` - main dashboard shell.
- `public/app.js` - tab navigation, modals, global behavior.
- `public/technicians.js` - technician KPI rendering and job modal behavior.
- `public/marketing.js` and `public/marketing-paper.css` - marketing dashboard.
- `public/owners.js` - owners/location leaders dashboard.
- `public/admin-kpi.html` - admin reconciliation UI.
- `public/coverage.html` - paid invoice audit UI.
- `public/diagnostics.html` and `public/diagnostics.js` - targeted HCP diagnostic tool.
- `public/report-issue.html` - technician issue report form.

## Development Guidance For Future AI

- Do not remove diagnostics or unattributed buckets just because they look noisy. They exist to prevent silent KPI errors.
- Do not assume HCP `total_amount`, invoice `amount`, outstanding balance, and actual paid money are always aligned.
- Prefer explicit, auditable states over clever inference.
- Keep date logic centralized. If period/range logic is duplicated, diagnostics and dashboard can drift.
- Keep KPI rules explainable in the UI when possible.
- Use exact HCP IDs where possible; invoice numbers can be split or reused in root form.
- When fixing one path, check whether admin, diagnostics, coverage, and technician UI need the same change.
- Do not store or print API keys, diagnostics passwords, QBO secrets, or refresh tokens.
- Run at least syntax checks after JS changes: `node --check server.js` and `node --check public/technicians.js`.

## Future Direction

The long-term reliability target is a persistent KPI ledger:

- Ingest HCP jobs, invoices, estimates, employees, and relevant payment state into durable records.
- Store snapshots and changes over time.
- Compute KPI ledger rows with source fields, rule version, confidence, and reconciliation state.
- Make the dashboard render from ledger rows rather than recomputing everything live from HCP.
- Add month-close/freeze behavior so historical KPIs do not silently change after admin review.
- Keep exception queues first-class: no assigned tech, standalone invoice, financing mismatch, amount drift, job details unavailable, duplicate/split invoice, and low-confidence attribution.

Until that ledger exists, protect the current live-compute pipeline with strong diagnostics, cache invalidation, and visible freshness signals.
