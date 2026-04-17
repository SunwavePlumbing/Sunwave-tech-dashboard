const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();

const API_KEY = process.env.HOUSECALL_PRO_API_KEY;
const PORT = process.env.PORT || 3000;
const BASE_URL = 'https://api.housecallpro.com';

// Shared axios defaults — prevents any single slow upstream from hanging the server
const HTTP_TIMEOUT = 25000;
axios.defaults.timeout = HTTP_TIMEOUT;

// Headers for Housecall Pro requests
function hcpHeaders() {
  return { 'Authorization': 'Token ' + API_KEY, 'Accept': 'application/json' };
}

// ── Tiny in-memory response cache ────────────────────────────────────────────
// Keyed by request URL + key; value = { at, data }. Separate TTLs per endpoint.
// Lets repeat page loads return instantly while real data refreshes in the
// background. Cache is cleared in-process on server restart.
const _cache = new Map();
function cacheGet(key, ttlMs) {
  const e = _cache.get(key);
  if (!e) return null;
  if (Date.now() - e.at > ttlMs) { _cache.delete(key); return null; }
  return e.data;
}
function cacheSet(key, data) {
  _cache.set(key, { at: Date.now(), data });
}

// ── In-flight promise de-dup ─────────────────────────────────────────────────
// If two requests arrive for the same raw-jobs fetch at once, they should
// share one network round-trip instead of each firing their own. Keyed by
// cache key; value is the pending promise that resolves to the cached data.
const _inflight = new Map();
function inflightGet(key, factory) {
  if (_inflight.has(key)) return _inflight.get(key);
  const p = factory().finally(() => { _inflight.delete(key); });
  _inflight.set(key, p);
  return p;
}

// ── ServiceTitan migration filter ────────────────────────────────────────────
// Sunwave switched from ServiceTitan to Housecall Pro on 2026-04-01. Historical
// ST jobs were imported into HCP with migration-era `completed_at` values, so
// some show up in post-cutover ranges (e.g. month-to-date for April 2026)
// even though the underlying work was done months or years earlier in ST.
//
// Any job completed on/after the cutover AND flagged as ST-origin is treated
// as an import artifact and excluded from all post-cutover period metrics.
// ST jobs completed BEFORE cutover are left alone — they represent real ST-era
// work correctly dated in its historical period.
//
// Override the cutover via env var: ST_CUTOVER_DATE=2026-04-01
const ST_CUTOVER = new Date(process.env.ST_CUTOVER_DATE || '2026-04-01T00:00:00Z');

// Match "ServiceTitan" / "service titan" / "service-titan" / "ST Import" /
// "ST_IMPORT" / "st-import" — the common tag names HCP migration tools
// stamp onto imported records. Word boundaries stop false positives like
// "last" or "institution".
const ST_PATTERN = /\b(service[\s\-_]?titan|st[\s\-_]?import)\b/i;

// Returns true if the job's tags / lead_source / notes / custom fields
// indicate a ServiceTitan origin. Tolerant of multiple shapes the HCP API
// can return (bare strings, {name}, {value}, nested arrays).
// Safely coerce any of the many shapes HCP returns (array, {data:[...]},
// {fields:[...]}, single object, string, null) into an iterable array so
// downstream `for...of` loops never blow up with "X is not iterable".
function toArrayish(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'object') {
    // Common wrapper shapes: {data: [...]}, {fields: [...]}, {items: [...]}
    if (Array.isArray(v.data))   return v.data;
    if (Array.isArray(v.fields)) return v.fields;
    if (Array.isArray(v.items))  return v.items;
    // Single field object — wrap it so the caller still gets one iteration
    return [v];
  }
  // String / number / boolean — wrap so `.value`/`.name` tests still work-ish
  return [v];
}

function isServiceTitanJob(job) {
  if (!job) return false;
  const tags = toArrayish(job.tags);
  for (const t of tags) {
    const v = typeof t === 'string' ? t : (t && (t.name || t.value || ''));
    if (v && ST_PATTERN.test(v)) return true;
  }
  if (job.lead_source) {
    const ls = typeof job.lead_source === 'string' ? job.lead_source : job.lead_source.name;
    if (ls && ST_PATTERN.test(ls)) return true;
  }
  for (const key of ['description', 'note', 'notes', 'customer_notes', 'public_note']) {
    const v = job[key];
    if (v && typeof v === 'string' && ST_PATTERN.test(v)) return true;
  }
  const jf = toArrayish(job.job_fields || job.custom_fields);
  for (const f of jf) {
    const v = (f && (f.value || f.text || f.name)) || '';
    if (v && typeof v === 'string' && ST_PATTERN.test(v)) return true;
  }
  return false;
}

// Returns true ONLY for ST-flagged jobs whose completed_at falls on/after
// the cutover — these are the mis-dated import artifacts we want to hide.
// ST jobs with legitimate pre-cutover completion dates pass through.
function isPostCutoverSTArtifact(job) {
  if (!isServiceTitanJob(job)) return false;
  const c = job.work_timestamps && job.work_timestamps.completed_at;
  if (!c) return false;
  return new Date(c) >= ST_CUTOVER;
}

// Diagnostic: which field(s) triggered the ST match, for the debug endpoint.
function describeSTMatch(job) {
  const hits = [];
  toArrayish(job.tags).forEach((t, i) => {
    const v = typeof t === 'string' ? t : (t && (t.name || t.value || ''));
    if (v && ST_PATTERN.test(v)) hits.push('tags[' + i + ']=' + v);
  });
  if (job.lead_source) {
    const ls = typeof job.lead_source === 'string' ? job.lead_source : job.lead_source.name;
    if (ls && ST_PATTERN.test(ls)) hits.push('lead_source=' + ls);
  }
  for (const key of ['description', 'note', 'notes', 'customer_notes', 'public_note']) {
    if (job[key] && typeof job[key] === 'string' && ST_PATTERN.test(job[key])) {
      hits.push(key + '=' + job[key].slice(0, 60));
    }
  }
  return hits.join(' | ') || '(unknown)';
}

// ── QuickBooks Online ────────────────────────────────────────────────────────
const QBO_CLIENT_ID     = process.env.QBO_CLIENT_ID;
const QBO_CLIENT_SECRET = process.env.QBO_CLIENT_SECRET;
const QBO_REDIRECT_URI  = (process.env.QBO_REDIRECT_URI || 'http://localhost:' + (process.env.PORT || 3000) + '/connect-quickbooks/callback').trim();
const QBO_BASE          = 'https://quickbooks.api.intuit.com';

// ── QBO token persistence ─────────────────────────────────────────────────────
// QBO rotates refresh tokens on every use. We persist the latest token to a
// local JSON file so server restarts (Railway deploys etc.) don't lose it.
// Priority: persisted file > QBO_REFRESH_TOKEN env var.
const TOKEN_FILE = path.join(__dirname, '.qbo-tokens.json');

function loadPersistedTokens() {
  try {
    const raw = fs.readFileSync(TOKEN_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return {};
  }
}

function persistTokens(tokens) {
  try {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2), 'utf8');
  } catch (err) {
    console.warn('[QBO] Could not persist tokens to file:', err.message);
  }
}

const _persisted = loadPersistedTokens();

// In-memory tokens + realmId — seeded from persisted file (or env vars) on startup, updated after OAuth
const qboTokens = {
  accessToken:  null,
  refreshToken: _persisted.refreshToken || process.env.QBO_REFRESH_TOKEN || null,
  expiresAt:    0,
  realmId:      _persisted.realmId      || process.env.QBO_REALM_ID      || null
};

if (_persisted.refreshToken) {
  console.log('[QBO] Loaded persisted refresh token from', TOKEN_FILE);
}

function qboConfigured() {
  // Only needs client credentials — realmId is captured automatically during OAuth
  return !!(QBO_CLIENT_ID && QBO_CLIENT_SECRET);
}
function qboReady() {
  // Fully ready to make API calls
  return !!(QBO_CLIENT_ID && QBO_CLIENT_SECRET && qboTokens.realmId && qboTokens.refreshToken);
}

async function getQBOAccessToken() {
  if (!qboReady()) return null;
  if (qboTokens.accessToken && Date.now() < qboTokens.expiresAt - 60000) {
    return qboTokens.accessToken;
  }
  try {
    const resp = await axios.post(
      'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: qboTokens.refreshToken,
        client_id: QBO_CLIENT_ID,
        client_secret: QBO_CLIENT_SECRET
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        }
      }
    );
    qboTokens.accessToken  = resp.data.access_token;
    qboTokens.refreshToken = resp.data.refresh_token;   // QBO rotates refresh tokens
    qboTokens.expiresAt    = Date.now() + resp.data.expires_in * 1000;
    // Persist the rotated token immediately so restarts don't lose it
    persistTokens({ refreshToken: qboTokens.refreshToken, realmId: qboTokens.realmId });
    return qboTokens.accessToken;
  } catch (err) {
    // Refresh failed — wipe in-memory tokens so callers see "not connected" cleanly
    qboTokens.accessToken = null;
    qboTokens.expiresAt = 0;
    console.error('[QBO refresh]', err.response?.status || '', err.response?.data?.error || err.message);
    return null;
  }
}

// Parse a full QBO P&L report — extracts every named account per month
// Returns { months: ['YYYY-MM',...], accounts: { 'Account Name': { 'YYYY-MM': value } } }
function parseFinancialReport(report) {
  const cols = (report.Columns && report.Columns.Column) || [];
  const months = [];
  const colMonthMap = {}; // colIndex -> 'YYYY-MM'

  cols.forEach((col, idx) => {
    if (col.ColType !== 'Money') return;
    const startMeta = (col.MetaData || []).find(m => m.Name === 'StartDate');
    if (!startMeta) return; // skip Total column
    const d = new Date(startMeta.Value + 'T12:00:00');
    const mk = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    months.push(mk);
    colMonthMap[idx] = mk;
  });

  const accounts = {};
  // children: 'Total X' → ['Sub-account A', 'Sub-account B', ...]
  // Only leaf accounts (rows with ColData but no sub-rows of their own)
  const children = {};

  function getVals(colData) {
    const out = {};
    Object.entries(colMonthMap).forEach(([idx, mk]) => {
      const raw = ((colData[+idx] || {}).value || '0').replace(/,/g, '');
      out[mk] = parseFloat(raw) || 0;
    });
    return out;
  }

  function store(name, colData) {
    if (!name) return;
    if (!accounts[name]) accounts[name] = {};
    const vals = getVals(colData);
    Object.entries(vals).forEach(([mk, v]) => {
      accounts[name][mk] = (accounts[name][mk] || 0) + v;
    });
  }

  // Recursively collect all leaf account names (those with ColData, no sub-rows)
  function collectLeaves(rows, out) {
    if (!Array.isArray(rows)) return;
    rows.forEach(row => {
      if (row.Header && row.Rows && row.Rows.Row) {
        collectLeaves(row.Rows.Row, out); // recurse into sub-sections
      } else if (row.ColData && row.ColData[0]) {
        const n = (row.ColData[0].value || '').trim();
        if (n) out.push(n);
      }
    });
  }

  function walk(rows) {
    if (!Array.isArray(rows)) return;
    rows.forEach(row => {
      if (row.Header && row.Header.ColData) {
        if (row.Rows && row.Rows.Row) walk(row.Rows.Row);
        if (row.Summary && row.Summary.ColData) {
          const n = ((row.Summary.ColData[0] || {}).value || '').trim();
          store(n, row.Summary.ColData);
          // Build children list: all leaf accounts under this section
          if (row.Rows && row.Rows.Row) {
            const leaves = [];
            collectLeaves(row.Rows.Row, leaves);
            if (leaves.length) children[n] = leaves;
          }
        }
      }
      if (row.ColData && row.ColData[0]) {
        const n = (row.ColData[0].value || '').trim();
        store(n, row.ColData);
      }
    });
  }

  walk((report.Rows && report.Rows.Row) || []);
  return { months, accounts, children };
}

// Parse QBO ProfitAndLossDetail report — extracts individual transactions and
// buckets them by every useful key we can derive:
//   • "Total X"   — the Summary subtotal row name (what sections close with)
//   • "X"         — the bare Header account name (for leaf-account lookups)
//   • per-txn Account column value (fallback when QBO flattens leaves under
//                                   a parent section without wrapping them)
// Bucketing under all three variants means the /api/account-detail handler
// can find transactions no matter whether QBO returns a given leaf account
// as its own Header+Summary section OR as flat ColData rows under a parent.
// Returns { keyName: [{ date, type, num, name, memo, amount }, ...] }
function parsePnLDetail(report) {
  const cols = (report.Columns && report.Columns.Column) || [];

  // Identify column indices from column metadata
  const ci = {};
  cols.forEach((col, i) => {
    const t  = (col.ColTitle || '').toLowerCase().trim();
    const ct = (col.ColType  || '').toLowerCase();
    if (t === 'date' || t.includes('date')) ci.date = ci.date == null ? i : ci.date;
    else if (t === 'transaction type' || t === 'type') ci.type = i;
    else if (t === 'num' || t === 'no.' || t === 'doc. no.') ci.num = i;
    else if (t === 'name' && ci.name == null) ci.name = i;
    else if (t === 'memo' || t.includes('memo') || t.includes('description')) ci.memo = i;
    // If QBO includes an explicit "Account" column in detail rows, track it
    // so we can bucket transactions by the leaf account they actually belong
    // to — handles the case where a leaf isn't wrapped in its own section.
    else if (t === 'account' || t === 'account name' || t === 'split') ci.account = i;
    // Explicitly find the "Amount" column — QBO also returns a "Balance" (running total)
    // column which is the LAST money column and would give wildly inflated values.
    // Prefer the column explicitly titled "amount"; fall back to first money column.
    if (t === 'amount') {
      ci.amount = i;
    } else if ((ct === 'money' || ct === 'subt_nat_amount') && ci.amount == null) {
      ci.amount = i; // first money column as fallback
    }
  });

  const txnMap = {};

  function val(cd, idx) {
    return (idx != null && cd && cd[idx]) ? (cd[idx].value || '') : '';
  }
  function bucketPush(key, txn) {
    if (!key) return;
    if (!txnMap[key]) txnMap[key] = [];
    txnMap[key].push(txn);
  }

  function walkSection(rows) {
    const txns = [];
    if (!Array.isArray(rows)) return txns;
    for (const row of rows) {
      if (row.Header && row.Rows && row.Rows.Row) {
        // Sub-section — recurse first
        const childTxns = walkSection(row.Rows.Row);

        // Bucket A: Summary "Total X" subtotal name (existing behavior)
        if (row.Summary && row.Summary.ColData) {
          const sumName = ((row.Summary.ColData[0] || {}).value || '').trim();
          if (sumName.startsWith('Total ') && childTxns.length) {
            txnMap[sumName] = (txnMap[sumName] || []).concat(childTxns);
          }
        }

        // Bucket B: Header account/section name (new — enables leaf lookup
        // by the bare account name like "Cost of Goods Sold - Job Supplies"
        // or "Subcontractors" without needing to guess the "Total " prefix).
        if (row.Header.ColData && childTxns.length) {
          const headName = ((row.Header.ColData[0] || {}).value || '').trim();
          if (headName) {
            txnMap[headName] = (txnMap[headName] || []).concat(childTxns);
          }
        }

        txns.push(...childTxns);
      } else if (row.ColData && row.ColData.length > 2) {
        // Transaction row
        const cd = row.ColData;
        const dateStr = val(cd, ci.date);
        const amtStr  = val(cd, ci.amount).replace(/,/g, '');
        const amount  = parseFloat(amtStr) || 0;
        // Skip rows without a date (subtotals / blanks)
        if (!dateStr || !amount) continue;
        const txn = {
          date: dateStr,
          type: val(cd, ci.type),
          num:  val(cd, ci.num),
          name: val(cd, ci.name),
          memo: val(cd, ci.memo),
          amount
        };
        // Bucket C: per-transaction Account column (new — if QBO flattens
        // leaf accounts under a parent section without their own header,
        // each transaction still tells us which leaf it belongs to).
        if (ci.account != null) {
          const acctName = val(cd, ci.account).trim();
          if (acctName) bucketPush(acctName, txn);
        }
        txns.push(txn);
      }
    }
    return txns;
  }

  walkSection((report.Rows && report.Rows.Row) || []);
  return txnMap;
}

// Pull monthly marketing spend from a parsed report — sums every account whose
// name contains "advertising" or "marketing" (case-insensitive). Returns { 'YYYY-MM': $ }
function marketingSpendByMonth(parsed) {
  const spend = {};
  (parsed.months || []).forEach(mk => { spend[mk] = 0; });
  Object.entries(parsed.accounts || {}).forEach(([name, byMonth]) => {
    const n = name.toLowerCase();
    if (!n.startsWith('total ')) return; // use rollup lines only, avoid double counting
    if (!(n.includes('advertising') || n.includes('marketing'))) return;
    Object.entries(byMonth).forEach(([mk, v]) => {
      spend[mk] = (spend[mk] || 0) + v;
    });
  });
  // Strip zero-only entries for a cleaner response
  Object.keys(spend).forEach(k => { if (!spend[k]) delete spend[k]; });
  return spend;
}
// ────────────────────────────────────────────────────────────────────────────

// Serve static files from public/
app.use(express.static('public'));

app.get('/api/metrics', async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const range = req.query.range || 'mtd';

    // ── Per-range response cache ─────────────────────────────────────
    // Metrics for a given range rarely change minute-to-minute. A 2-min
    // TTL makes repeat clicks (Today → Yesterday → Today) feel instant
    // while still letting the 5-min auto-refresh pick up fresh data.
    const METRICS_TTL = 2 * 60 * 1000;
    const cacheKey = 'metrics:' + range;
    const cached = cacheGet(cacheKey, METRICS_TTL);
    if (cached) return res.json(cached);

    const now = new Date();
    let periodStart, periodEnd, periodLabel;

    const getDayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const getDayEnd = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);

    switch(range) {
      case 'day':
        periodStart = getDayStart(now);
        periodEnd = getDayEnd(now);
        periodLabel = 'Today';
        break;
      case 'yesterday':
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        periodStart = getDayStart(yesterday);
        periodEnd = getDayEnd(yesterday);
        periodLabel = 'Yesterday';
        break;
      case 'week':
        periodStart = new Date(now);
        periodStart.setDate(now.getDate() - now.getDay());
        periodEnd = new Date(periodStart);
        periodEnd.setDate(periodEnd.getDate() + 7);
        periodLabel = 'This Week';
        break;
      case 'wtd':
        periodStart = new Date(now);
        periodStart.setDate(now.getDate() - now.getDay());
        periodEnd = getDayEnd(now);
        periodLabel = 'Week to Date';
        break;
      case 'l7d':
        periodStart = new Date(now);
        periodStart.setDate(now.getDate() - 7);
        periodEnd = getDayEnd(now);
        periodLabel = 'Last 7 Days';
        break;
      case 'l14d':
        periodStart = new Date(now);
        periodStart.setDate(now.getDate() - 14);
        periodEnd = getDayEnd(now);
        periodLabel = 'Last 14 Days';
        break;
      case 'l30d':
        periodStart = new Date(now);
        periodStart.setDate(now.getDate() - 30);
        periodEnd = getDayEnd(now);
        periodLabel = 'Last 30 Days';
        break;
      case 'mtd':
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        periodEnd = getDayEnd(now);
        periodLabel = 'Month to Date';
        break;
      case 'lm':
        const lastMonth = new Date(now);
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        periodStart = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
        periodEnd = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 1);
        periodLabel = 'Last Month';
        break;
      case 'l90d':
        periodStart = new Date(now);
        periodStart.setDate(now.getDate() - 90);
        periodEnd = getDayEnd(now);
        periodLabel = 'Last 90 Days';
        break;
      case 'qtd':
        const qtdQuarter = Math.floor(now.getMonth() / 3);
        periodStart = new Date(now.getFullYear(), qtdQuarter * 3, 1);
        periodEnd = getDayEnd(now);
        periodLabel = 'Quarter to Date';
        break;
      case 'lq':
        const lqQuarter = Math.floor(now.getMonth() / 3) - 1;
        const lqYear = lqQuarter < 0 ? now.getFullYear() - 1 : now.getFullYear();
        const lqQ = ((lqQuarter % 4) + 4) % 4;
        periodStart = new Date(lqYear, lqQ * 3, 1);
        periodEnd = new Date(lqYear, lqQ * 3 + 3, 1);
        periodLabel = 'Last Quarter';
        break;
      case 'q2d':
        const q2dQuarter = Math.floor(now.getMonth() / 3);
        periodStart = new Date(now.getFullYear(), q2dQuarter * 3, 1);
        periodEnd = getDayEnd(now);
        periodLabel = 'Quarter to Date';
        break;
      case 'ytd':
        periodStart = new Date(now.getFullYear(), 0, 1);
        periodEnd = getDayEnd(now);
        periodLabel = 'Year to Date';
        break;
      case 'l365d':
        periodStart = new Date(now);
        periodStart.setDate(now.getDate() - 365);
        periodEnd = getDayEnd(now);
        periodLabel = 'Last 365 Days';
        break;
      case 'ly':
        periodStart = new Date(now.getFullYear() - 1, 0, 1);
        periodEnd = new Date(now.getFullYear(), 0, 1);
        periodLabel = 'Last Year';
        break;
      default:
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        periodEnd = getDayEnd(now);
        periodLabel = 'This Month';
    }

    const headers = hcpHeaders();

    // ── Shared raw-jobs cache for "short" ranges ────────────────────
    // All common short ranges (day, yesterday, WTD, MTD, last month,
    // l7/14/30/90d) fit inside a 180-day window. We fetch that wider
    // window ONCE, cache it for 5 minutes, then derive every range
    // from the same cached array via in-memory filtering. Result:
    // switching Today → Yesterday → WTD → MTD is near-instant after
    // the first load.
    //
    // Longer ranges (ytd, l365d, ly, quarter-to-date variants) fall
    // through to a per-range fetch below.
    const RAW_WINDOW_DAYS = 180;
    const SHORT_RANGES = new Set([
      'day','yesterday','week','wtd','l7d','l14d','l30d','mtd','lm','l90d'
    ]);

    // Builds the raw cache by fetching the wide window + all estimates.
    // De-duped via inflightGet() so concurrent requests share one fetch.
    const fetchRawShort = () => inflightGet('raw-short', async () => {
      const RAW_TTL = 5 * 60 * 1000;
      const ck = 'raw-jobs-short:' + RAW_WINDOW_DAYS;
      const cached = cacheGet(ck, RAW_TTL);
      if (cached) return cached;

      const rawStart = new Date(now);
      rawStart.setDate(rawStart.getDate() - RAW_WINDOW_DAYS - 90); // +90d lookback
      const rawEnd = new Date(now);
      rawEnd.setDate(rawEnd.getDate() + 1);

      const pageSize = 200;
      const jobsParams = {
        work_status: ['completed'],
        scheduled_start_min: rawStart.toISOString(),
        scheduled_start_max: rawEnd.toISOString(),
        page_size: pageSize
      };
      const firstPageRes = await axios.get(BASE_URL + '/jobs', {
        headers, params: { ...jobsParams, page: 1 }
      });
      const jobs = firstPageRes.data.jobs || [];
      const totalPages = firstPageRes.data.total_pages || 1;
      if (totalPages > 1) {
        const pagePromises = [];
        for (let p = 2; p <= totalPages; p++) {
          pagePromises.push(axios.get(BASE_URL + '/jobs', {
            headers, params: { ...jobsParams, page: p }
          }));
        }
        const pageResults = await Promise.all(pagePromises);
        pageResults.forEach(r => jobs.push(...(r.data.jobs || [])));
      }

      // Pre-fetch estimate seller map for EVERY job in the window so
      // downstream per-range filters never need another round-trip.
      const estimateIds = [...new Set(
        jobs
          .map(j => j.original_estimate_id || (j.original_estimate_uuids && j.original_estimate_uuids[0]))
          .filter(Boolean)
      )];
      const sellerMap = {};
      if (estimateIds.length > 0) {
        const BATCH = 10;
        for (let i = 0; i < estimateIds.length; i += BATCH) {
          const batch = estimateIds.slice(i, i + BATCH);
          const results = await Promise.all(
            batch.map(id =>
              axios.get(BASE_URL + '/estimates/' + id, { headers })
                .then(r => {
                  const d = r.data;
                  const employees = d.assigned_employees
                    || (d.assigned_employee ? [d.assigned_employee] : []);
                  return { id, employees };
                })
                .catch(() => ({ id, employees: [] }))
          ));
          results.forEach(r => { sellerMap[r.id] = r.employees; });
        }
      }

      const result = { jobs, sellerMap };
      cacheSet(ck, result);
      return result;
    });

    let allJobs, estimateSellerMap;

    if (SHORT_RANGES.has(range)) {
      // Share the cached wide-window fetch
      const raw = await fetchRawShort();
      allJobs = raw.jobs;
      estimateSellerMap = raw.sellerMap;
    } else {
      // Per-range fetch for longer windows that outgrow the shared cache
      const COMPLETION_LOOKBACK_DAYS = 90;
      const fetchStart = new Date(periodStart);
      fetchStart.setDate(fetchStart.getDate() - COMPLETION_LOOKBACK_DAYS);

      const pageSize = 200;
      const jobsParams = {
        work_status: ['completed'],
        scheduled_start_min: fetchStart.toISOString(),
        scheduled_start_max: periodEnd.toISOString(),
        page_size: pageSize
      };
      const firstPageRes = await axios.get(BASE_URL + '/jobs', {
        headers, params: { ...jobsParams, page: 1 }
      });
      allJobs = firstPageRes.data.jobs || [];
      const totalPages = firstPageRes.data.total_pages || 1;

      if (totalPages > 1) {
        const pagePromises = [];
        for (let p = 2; p <= totalPages; p++) {
          pagePromises.push(
            axios.get(BASE_URL + '/jobs', { headers, params: { ...jobsParams, page: p } })
          );
        }
        const pageResults = await Promise.all(pagePromises);
        pageResults.forEach(r => allJobs.push(...(r.data.jobs || [])));
      }

      // Filter-then-fetch-estimates for the longer ranges (same as before).
      // Excludes post-cutover ST import artifacts so estimate IDs for
      // mis-dated legacy jobs don't pollute the fetch batch either.
      const isCompleted = (job) => {
        if (!job.work_timestamps?.completed_at) return false;
        if (isPostCutoverSTArtifact(job)) return false;
        const d = new Date(job.work_timestamps.completed_at);
        return d >= periodStart && d < periodEnd;
      };
      const completed = allJobs.filter(isCompleted);
      const estimateIds = [...new Set(
        completed
          .map(j => j.original_estimate_id || (j.original_estimate_uuids && j.original_estimate_uuids[0]))
          .filter(Boolean)
      )];
      estimateSellerMap = {};
      if (estimateIds.length > 0) {
        const BATCH = 10;
        for (let i = 0; i < estimateIds.length; i += BATCH) {
          const batch = estimateIds.slice(i, i + BATCH);
          const results = await Promise.all(
            batch.map(id =>
              axios.get(BASE_URL + '/estimates/' + id, { headers })
                .then(r => {
                  const d = r.data;
                  const employees = d.assigned_employees
                    || (d.assigned_employee ? [d.assigned_employee] : []);
                  return { id, employees };
                })
                .catch(() => ({ id, employees: [] }))
          ));
          results.forEach(r => { estimateSellerMap[r.id] = r.employees; });
        }
      }
    }

    // Filter jobs by actual completion date (not scheduled date). Also
    // drops post-cutover ServiceTitan import artifacts so MTD / this-week /
    // etc. don't show legacy ST work as though it were done this month.
    const isJobCompleted = (job) => {
      if (!job.work_timestamps?.completed_at) return false;
      if (isPostCutoverSTArtifact(job)) return false;
      const completedDate = new Date(job.work_timestamps.completed_at);
      return completedDate >= periodStart && completedDate < periodEnd;
    };
    const completedJobs = allJobs.filter(isJobCompleted);

    const techMetrics = {};

    function ensureTech(emp) {
      if (!techMetrics[emp.id]) {
        const name = ((emp.first_name || '') + ' ' + (emp.last_name || '')).trim() || 'Unknown';
        techMetrics[emp.id] = { id: emp.id, name, revenue: 0, jobs: 0, jobList: [] };
      }
    }

    completedJobs.forEach(job => {
      const doers = job.assigned_employees || [];
      if (doers.length === 0) return;

      const jobRevenue = parseFloat(job.total_amount || 0) / 100;
      const customer = job.customer
        ? ((job.customer.first_name || '') + ' ' + (job.customer.last_name || '')).trim()
        : '';
      const jobDate = (job.work_timestamps && job.work_timestamps.completed_at)
        ? job.work_timestamps.completed_at
        : (job.schedule && job.schedule.scheduled_start ? job.schedule.scheduled_start : null);

      const estimateId = job.original_estimate_id || (job.original_estimate_uuids && job.original_estimate_uuids[0]);
      const sellers = estimateId ? (estimateSellerMap[estimateId] || []) : [];

      // Build a credit map: techId -> credit amount
      // Rule: seller gets 1/3, doers split 2/3. Always applies — for direct jobs
      // (no estimate), the first assigned tech is treated as the implicit seller.
      const creditMap = {};
      const effectiveSellers = sellers.length > 0 ? sellers : (doers.length > 1 ? [doers[0]] : []);
      const sellPool = jobRevenue / 3;
      const doPool = jobRevenue * 2 / 3;

      if (doers.length === 1 && sellers.length === 0) {
        // Single tech, no estimate — gets 100%
        creditMap[doers[0].id] = jobRevenue;
      } else {
        effectiveSellers.forEach(emp => {
          creditMap[emp.id] = (creditMap[emp.id] || 0) + sellPool / effectiveSellers.length;
        });
        doers.forEach(emp => {
          creditMap[emp.id] = (creditMap[emp.id] || 0) + doPool / doers.length;
        });
      }

      // Collect all unique techs involved (sellers + doers)
      const allInvolved = [...doers];
      effectiveSellers.forEach(s => { if (!allInvolved.find(d => d.id === s.id)) allInvolved.push(s); });

      // Build display names for co-workers so each tech can see who they split with
      const allInvolvedNames = allInvolved.map(e => ((e.first_name || '') + ' ' + (e.last_name || '')).trim()).filter(Boolean);

      allInvolved.forEach(emp => {
        const credit = creditMap[emp.id];
        if (!credit) return;

        ensureTech(emp);

        const isSeller = effectiveSellers.some(s => s.id === emp.id);
        const isDoer = doers.some(d => d.id === emp.id);
        const role = (isSeller && isDoer) ? 'Sold & Did' : isSeller ? 'Sold' : 'Did';
        const creditPct = Math.round(credit / jobRevenue * 100);
        const myName = ((emp.first_name || '') + ' ' + (emp.last_name || '')).trim();
        const splitWith = allInvolved
          .filter(e => e.id !== emp.id)
          .map(e => {
            const n = ((e.first_name || '') + ' ' + (e.last_name || '')).trim();
            const c = creditMap[e.id] || 0;
            const p = jobRevenue > 0 ? Math.round(c / jobRevenue * 100) : 0;
            return { name: n, creditPct: p };
          })
          .filter(x => x.name);

        techMetrics[emp.id].revenue += credit;
        techMetrics[emp.id].jobs += 1;
        techMetrics[emp.id].jobList.push({
          invoice: job.invoice_number || null,
          description: job.description || null,
          customer,
          date: jobDate,
          jobTotal: jobRevenue,
          credit,
          creditPct,
          role,
          splitWith
        });
      });
    });

    const leaderboard = Object.values(techMetrics)
      .map(tech => ({
        id: tech.id,
        name: tech.name,
        monthlyRevenue: Math.round(tech.revenue),
        jobsCompleted: tech.jobs,
        averageTicket: tech.jobs > 0 ? Math.round(tech.revenue / tech.jobs) : 0,
        jobList: tech.jobList
      }))
      .sort((a, b) => b.monthlyRevenue - a.monthlyRevenue);

    const totalRevenue = leaderboard.reduce((sum, t) => sum + t.monthlyRevenue, 0);
    // Use the raw job count (all completed jobs in range) for the summary card so it
    // matches what the marketing tab shows. Per-tech credited entries can differ because
    // multi-tech jobs are counted once per tech, and jobs with no employees are skipped.
    const totalJobs = completedJobs.length;
    const avgTicket = totalJobs > 0 ? Math.round(totalRevenue / totalJobs) : 0;

    const payload = {
      leaderboard,
      summary: { totalRevenue, totalJobs, averageTicket: avgTicket, period: periodLabel }
    };
    cacheSet(cacheKey, payload);
    res.json(payload);

  } catch (error) {
    console.error('[/api/tech]', error.response?.status || '', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/marketing', async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }
  // 10-minute cache: job counts don't shift materially minute-to-minute
  const MKT_TTL = 10 * 60 * 1000;
  if (req.query.refresh !== '1') {
    const cached = cacheGet('marketing', MKT_TTL);
    if (cached) return res.json(cached);
  }
  try {
    const headers = hcpHeaders();

    const now = new Date();
    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const MONTH_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    // Build 12 month buckets: [0] = 11 months ago, [11] = current month
    const buckets = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth();
      const isCurrent = (i === 0);
      const start = new Date(year, month, 1);
      const end   = isCurrent
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) // MTD
        : new Date(year, month + 1, 1);
      buckets.push({ year, month, isCurrent, start, end,
        monthKey: year + '-' + String(month + 1).padStart(2, '0'),
        label: MONTH_NAMES[month],
        fullLabel: MONTH_FULL[month] + ' ' + year
      });
    }

    // Fetch all months in parallel (each is a single page_size=200 request — increase if needed)
    const fetchMonth = async (bucket) => {
      // ── CLIENT-SIDE COMPLETION DATE FILTERING ────────────────────────────────────
      // HCP's /jobs endpoint doesn't support filtering by completed_at, only
      // scheduled_start. For the oldest bucket, expand the window 90 days back to
      // catch jobs scheduled long ago but completed recently.
      const COMPLETION_LOOKBACK_DAYS = 90;
      let fetchStart = bucket.start;

      // Only expand backward on first (oldest) bucket
      if (bucket === buckets[0]) {
        fetchStart = new Date(bucket.start);
        fetchStart.setDate(fetchStart.getDate() - COMPLETION_LOOKBACK_DAYS);
      }

      const allJobs = [];
      let page = 1;
      while (true) {
        const r = await axios.get(BASE_URL + '/jobs', {
          headers,
          params: {
            work_status: ['completed'],
            scheduled_start_min: fetchStart.toISOString(),
            scheduled_start_max: bucket.end.toISOString(),
            page,
            page_size: 200
          }
        });
        const jobs = r.data.jobs || [];
        allJobs.push(...jobs);
        if (page >= (r.data.total_pages || 1)) break;
        page++;
      }

      // Filter jobs by actual completion date within this bucket.
      // Excludes post-cutover ST import artifacts so the marketing
      // monthly history + projection don't double-count legacy ST jobs
      // as if they happened after the HCP migration.
      const completedInBucket = allJobs.filter(job => {
        if (!job.work_timestamps?.completed_at) return false;
        if (isPostCutoverSTArtifact(job)) return false;
        const completedDate = new Date(job.work_timestamps.completed_at);
        return completedDate >= bucket.start && completedDate < bucket.end;
      });

      const revenue = completedInBucket.reduce((s, j) => s + parseFloat(j.total_amount || 0) / 100, 0);
      return {
        ...bucket,
        jobs: completedInBucket.length,
        revenue: Math.round(revenue),
        avgTicket: completedInBucket.length > 0 ? Math.round(revenue / completedInBucket.length) : 0
      };
    };

    const history = await Promise.all(buckets.map(fetchMonth));

    // Projection for current month — workday-based (Mon–Fri only)
    const cur = history[history.length - 1];
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysElapsed = now.getDate();
    const daysLeft = daysInMonth - daysElapsed;

    // Count Mon–Fri days in a range [fromDay, toDay] inclusive
    const countWorkdays = (yr, mo, from, to) => {
      let n = 0;
      for (let d = from; d <= to; d++) {
        const dow = new Date(yr, mo, d).getDay();
        if (dow !== 0 && dow !== 6) n++;
      }
      return n;
    };
    const yr = now.getFullYear(), mo = now.getMonth();
    const wdElapsed = countWorkdays(yr, mo, 1, daysElapsed);
    const wdTotal   = countWorkdays(yr, mo, 1, daysInMonth);
    const wdLeft    = wdTotal - wdElapsed;

    const dailyRate    = wdElapsed > 0 ? cur.jobs / wdElapsed : 0;
    const projectedJobs = wdElapsed > 0 ? Math.round(dailyRate * wdTotal) : 0;

    const payload = {
      history,
      projection: {
        jobsMtd: cur.jobs,
        projectedJobs,
        dailyRate,
        daysElapsed,
        daysLeft,
        totalDays: daysInMonth,
        wdElapsed,
        wdLeft,
        wdTotal
      }
    };
    cacheSet('marketing', payload);
    res.json(payload);
  } catch (error) {
    console.error('[/api/marketing]', error.response?.status || '', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── QuickBooks OAuth ─────────────────────────────────────────────────────────
// Safe debug — shows credential shape without exposing full values
app.get('/connect-quickbooks', (req, res) => {
  if (!qboConfigured()) {
    return res.send('<h2>QBO not configured</h2><p>Set QBO_CLIENT_ID and QBO_CLIENT_SECRET environment variables in Railway, then visit this page again.</p>');
  }
  const params = new URLSearchParams({
    client_id: QBO_CLIENT_ID,
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    redirect_uri: QBO_REDIRECT_URI,
    state: 'sunwave'
  });
  res.redirect('https://appcenter.intuit.com/connect/oauth2?' + params.toString());
});

app.get('/connect-quickbooks/callback', async (req, res) => {
  try {
    const { code, realmId } = req.query;
    if (!code) return res.status(400).send('Missing authorization code');
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: QBO_REDIRECT_URI,
      client_id: QBO_CLIENT_ID,
      client_secret: QBO_CLIENT_SECRET
    });
    const resp = await axios.post(
      'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      tokenBody.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        }
      }
    );
    qboTokens.accessToken  = resp.data.access_token;
    qboTokens.refreshToken = resp.data.refresh_token;
    qboTokens.expiresAt    = Date.now() + resp.data.expires_in * 1000;
    // Save realmId in memory so API calls work immediately (no restart needed)
    if (realmId) qboTokens.realmId = realmId;
    // Persist tokens to file so server restarts don't lose the rotated refresh token
    persistTokens({ refreshToken: qboTokens.refreshToken, realmId: qboTokens.realmId });
    // Show success page — both values ready to copy into Railway
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>QuickBooks Connected</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:620px;margin:60px auto;padding:0 20px;color:#333}
  h2{color:#12A071;margin-bottom:6px}
  p{color:#666;margin-bottom:20px;font-size:14px}
  .step{background:#fffbf5;border:1px solid #FFE0B2;border-radius:10px;padding:18px 20px;margin:12px 0}
  .step strong{display:block;font-size:13px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px}
  .var-name{font-family:monospace;font-size:13px;background:#f0f0f0;padding:3px 8px;border-radius:4px;color:#333}
  .var-val{font-family:monospace;font-size:12px;background:#1a2d3a;color:#7dd3a8;padding:12px 16px;border-radius:8px;margin-top:8px;word-break:break-all;display:block;line-height:1.5}
  .copy-btn{display:inline-block;margin-top:8px;background:#f0f0f0;border:none;padding:6px 14px;border-radius:6px;font-size:12px;cursor:pointer;color:#555}
  .copy-btn:hover{background:#e0e0e0}
  .instructions{background:#f8f8f8;border-radius:10px;padding:18px 20px;margin:20px 0;font-size:13px;color:#666;line-height:1.8}
  .instructions ol{padding-left:18px;margin:0}
  .btn{display:inline-block;background:#FF9500;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:4px}
</style>
</head><body>
<h2>✅ QuickBooks Connected!</h2>
<p>QuickBooks data will load immediately. To keep this connection after Railway restarts, add these two variables to your Railway project:</p>

<div class="step">
  <strong>Variable 1 — Realm ID</strong>
  <span class="var-name">QBO_REALM_ID</span>
  <code class="var-val" id="v1">${qboTokens.realmId}</code>
  <button class="copy-btn" onclick="navigator.clipboard.writeText('${qboTokens.realmId}');this.textContent='Copied!'">Copy</button>
</div>

<div class="step">
  <strong>Variable 2 — Refresh Token</strong>
  <span class="var-name">QBO_REFRESH_TOKEN</span>
  <code class="var-val" id="v2">${qboTokens.refreshToken}</code>
  <button class="copy-btn" onclick="navigator.clipboard.writeText('${qboTokens.refreshToken}');this.textContent='Copied!'">Copy</button>
</div>

<div class="instructions">
  <ol>
    <li>Go to your <strong>Railway project → Variables</strong></li>
    <li>Add <code>QBO_REALM_ID</code> and <code>QBO_REFRESH_TOKEN</code> using the values above</li>
    <li>Railway will redeploy automatically — no need to connect again</li>
  </ol>
  <br>⚠️ The refresh token rotates every ~100 days. If the marketing tab stops loading QBO data, just visit <code>/auth/quickbooks</code> again to reconnect.
</div>

<a href="/" class="btn">← Go to Dashboard</a>
</body></html>`);
  } catch (err) {
    const detail = err.response?.data;
    console.error('[QBO OAuth callback]', err.response?.status || '', detail?.error || err.message);
    res.status(500).send(
      '<h3>QuickBooks authorization failed</h3>' +
      '<p><strong>Error:</strong> ' + (detail?.error || err.message) + '</p>' +
      '<p><strong>Detail:</strong> ' + (detail?.error_description || 'none') + '</p>' +
      '<p><strong>Redirect URI sent:</strong> <code>' + QBO_REDIRECT_URI + '</code></p>' +
      '<p>Make sure this URI is listed exactly in your Intuit app\'s Redirect URIs.</p>' +
      '<p><a href="/connect-quickbooks">Try again</a></p>'
    );
  }
});

// ── /api/qbo-marketing ───────────────────────────────────────────────────────
app.get('/api/qbo-marketing', async (req, res) => {
  if (!qboReady()) {
    return res.json({ connected: false, reason: 'not_configured' });
  }
  try {
    const token = await getQBOAccessToken();
    if (!token) {
      return res.json({ connected: false, reason: 'no_token' });
    }
    // Same 12-month window as /api/marketing
    const now = new Date();
    const endDate   = now.toISOString().slice(0, 10);
    const startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().slice(0, 10);

    const pnlRes = await axios.get(
      QBO_BASE + '/v3/company/' + qboTokens.realmId + '/reports/ProfitAndLoss',
      {
        headers: {
          Authorization: 'Bearer ' + token,
          Accept: 'application/json'
        },
        params: {
          start_date: startDate,
          end_date: endDate,
          summarize_column_by: 'Month',
          minorversion: 65
        }
      }
    );

    const monthlyMarketing = marketingSpendByMonth(parseFinancialReport(pnlRes.data));
    res.json({ connected: true, monthlyMarketing });
  } catch (err) {
    console.error('[/api/qbo-marketing]', err.response?.status || '', err.message);
    const status = err.response?.status;
    if (status === 401) {
      qboTokens.accessToken = null; // force refresh next time
      return res.json({ connected: false, reason: 'token_expired' });
    }
    res.status(500).json({ connected: false, reason: 'error', error: err.message });
  }
});
// ────────────────────────────────────────────────────────────────────────────

// ── /api/owners-financial ────────────────────────────────────────────────────
// Smart date helper: books close ~15th of the month after month-end.
// Before the 15th → latest complete month is 2 months ago.
// On/after the 15th → latest complete month is last month.
function getReliableEndDate(now) {
  const latestCompleteMonth = now.getDate() < 15
    ? new Date(now.getFullYear(), now.getMonth() - 2, 1)  // 2 months back
    : new Date(now.getFullYear(), now.getMonth() - 1, 1); // last month
  // End = last day of that month
  const end = new Date(latestCompleteMonth.getFullYear(), latestCompleteMonth.getMonth() + 1, 0);
  return end;
}

app.get('/api/owners-financial', async (req, res) => {
  if (!qboReady()) {
    return res.json({ connected: false, reason: qboConfigured() ? 'not_connected' : 'not_configured' });
  }
  // 4-hour cache — QBO P&L data only changes meaningfully once a month
  const FIN_TTL = 4 * 60 * 60 * 1000;
  const cached = cacheGet('owners-financial', FIN_TTL);
  if (cached) return res.json(cached);
  try {
    const token = await getQBOAccessToken();
    if (!token) return res.json({ connected: false, reason: 'no_token' });

    // Always return 24 months ending at latest reliable month — client
    // picks which single month to display and computes comparisons from
    // this range (prior month, same month last year, etc.)
    const now = new Date();
    const reliableEnd = getReliableEndDate(now);
    const start = new Date(reliableEnd.getFullYear(), reliableEnd.getMonth() - 23, 1);
    const startDate = start.toISOString().slice(0, 10);
    const endDate = reliableEnd.toISOString().slice(0, 10);

    const pnlRes = await axios.get(
      QBO_BASE + '/v3/company/' + qboTokens.realmId + '/reports/ProfitAndLoss',
      {
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
        params: {
          start_date: startDate,
          end_date: endDate,
          accounting_method: 'Cash',
          summarize_column_by: 'Month',
          minorversion: 75
        }
      }
    );

    const parsed = parseFinancialReport(pnlRes.data);
    const payload = {
      connected: true,
      ...parsed,
      fetchedAt: new Date().toISOString(),
      startDate,
      endDate,
      latestReliableMonth: parsed.months[parsed.months.length - 1]
    };
    cacheSet('owners-financial', payload);
    res.json(payload);
  } catch (err) {
    console.error('[/api/owners-financial]', err.response?.status || '', err.message);
    if (err.response?.status === 401) {
      qboTokens.accessToken = null;
      return res.json({ connected: false, reason: 'token_expired' });
    }
    res.status(500).json({ connected: false, reason: 'error', error: err.message });
  }
});
// ── /api/account-detail — individual transactions for a P&L section ─────────
// Fetches QBO ProfitAndLossDetail for the given month (cached 4 h),
// then returns every individual transaction under the requested "Total X" key.
app.get('/api/account-detail', async (req, res) => {
  const { acct, month } = req.query;
  if (!acct || !month) return res.status(400).json({ error: 'acct and month are required' });
  if (!qboReady()) return res.json({ connected: false, transactions: [] });

  try {
    const token = await getQBOAccessToken();
    if (!token) return res.json({ connected: false, transactions: [] });

    const ck = 'pnl-detail:' + month;
    let txnMap = cacheGet(ck, 4 * 60 * 60 * 1000);

    if (!txnMap) {
      const [y, m] = month.split('-').map(Number);
      const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
      const endDate = new Date(y, m, 0).toISOString().slice(0, 10);

      console.log('[account-detail] Fetching PnLDetail', startDate, '→', endDate);
      const resp = await axios.get(
        QBO_BASE + '/v3/company/' + qboTokens.realmId + '/reports/ProfitAndLossDetail',
        {
          headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
          params: {
            start_date: startDate,
            end_date: endDate,
            accounting_method: 'Cash',
            minorversion: 75
          }
        }
      );

      txnMap = parsePnLDetail(resp.data);
      cacheSet(ck, txnMap);
      console.log('[account-detail] Cached', Object.keys(txnMap).length, 'sections for', month);
    }

    let transactions = (txnMap[acct] || []).slice();

    // Case-insensitive exact fallback
    if (!transactions.length) {
      const lower = acct.toLowerCase();
      const match = Object.keys(txnMap).find(k => k.toLowerCase() === lower);
      if (match) transactions = txnMap[match].slice();
    }

    // "Total X" prefix fallback — most P&L-summary account names are the
    // LEAF name (e.g. "Cost of Goods Sold - Job Supplies"), but the P&L
    // Detail report keys those sections under the subtotal row name
    // ("Total Cost of Goods Sold - Job Supplies"). Try the prefixed form.
    if (!transactions.length && !/^total\s+/i.test(acct)) {
      const prefixed = 'Total ' + acct;
      if (txnMap[prefixed]) {
        transactions = txnMap[prefixed].slice();
      } else {
        const pl = prefixed.toLowerCase();
        const m = Object.keys(txnMap).find(k => k.toLowerCase() === pl);
        if (m) transactions = txnMap[m].slice();
      }
    }

    // Base-name match: strip "Total " from both sides and compare. Handles
    // cases where the client sends "Total X" but detail keys it as just "X",
    // or vice-versa with different casing/whitespace variations.
    if (!transactions.length) {
      const base = acct.replace(/^Total\s+/i, '').toLowerCase().trim();
      const m = Object.keys(txnMap).find(k => {
        const kb = k.replace(/^Total\s+/i, '').toLowerCase().trim();
        return kb === base;
      });
      if (m) transactions = txnMap[m].slice();
    }

    if (!transactions.length) {
      console.log('[account-detail] Miss for', JSON.stringify(acct),
        '— available keys:', Object.keys(txnMap).join(' | '));
    }

    // Sort newest-first
    transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({ connected: true, acct, month, transactions,
      // Include available keys on a miss so the client can detect the right name
      availableKeys: transactions.length ? undefined : Object.keys(txnMap) });
  } catch (err) {
    console.error('[/api/account-detail]', err.response?.status || '', err.message);
    if (err.response?.status === 401) {
      qboTokens.accessToken = null;
    }
    res.json({ connected: false, transactions: [], error: err.message });
  }
});

// Returns the list of QBO account/section labels found in the most recent P&L.
// Use /api/qbo-accounts to verify mapping when a card shows $0.
app.get('/api/qbo-accounts', async (req, res) => {
  if (!qboReady()) return res.json({ connected: false });
  try {
    const token = await getQBOAccessToken();
    if (!token) return res.json({ connected: false });
    const now = new Date();
    const end = getReliableEndDate(now);
    const start = new Date(end.getFullYear(), end.getMonth() - 2, 1);
    const pnlRes = await axios.get(
      QBO_BASE + '/v3/company/' + qboTokens.realmId + '/reports/ProfitAndLoss',
      {
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
        params: {
          start_date: start.toISOString().slice(0, 10),
          end_date: end.toISOString().slice(0, 10),
          accounting_method: 'Cash',
          summarize_column_by: 'Month',
          minorversion: 75
        }
      }
    );
    const parsed = parseFinancialReport(pnlRes.data);
    res.json({ connected: true, months: parsed.months, accounts: Object.keys(parsed.accounts).sort() });
  } catch (err) {
    res.status(500).json({ connected: false, error: err.message });
  }
});
// Balance Sheet — multi-month history + detailed account breakdown.
// Uses summarize_column_by=Month for a 13-month window so we get both
// historical bank-balance trend data and the current snapshot in one call.
// Returns: months[], bankHistory[], bankAccounts[], creditCardAccts[],
//          notesPayable[], plus all the summary snapshot fields.
app.get('/api/qbo-balance', async (req, res) => {
  if (!qboReady()) return res.json({ connected: false });
  const BAL_TTL = 4 * 60 * 60 * 1000;
  const cached = cacheGet('qbo-balance', BAL_TTL);
  if (cached) return res.json(cached);
  try {
    const token = await getQBOAccessToken();
    if (!token) return res.json({ connected: false });

    // Balance sheet: end = today (we want the live current snapshot),
    // start = 12 months back (for the bank-balance history chart).
    const endDate   = new Date();
    const startDate = new Date(endDate);
    startDate.setMonth(startDate.getMonth() - 12);

    const bsRes = await axios.get(
      QBO_BASE + '/v3/company/' + qboTokens.realmId + '/reports/BalanceSheet',
      {
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
        params: {
          start_date:           startDate.toISOString().slice(0, 10),
          end_date:             endDate.toISOString().slice(0, 10),
          summarize_column_by:  'Month',
          accounting_method:    'Cash',
          minorversion:         75
        }
      }
    );

    // ── Parse column headers ─────────────────────────────────────
    // Col 0 = account label; remaining cols = one Money col per month.
    const rawCols   = (bsRes.data.Columns && bsRes.data.Columns.Column) || [];
    const moneyIdx  = [];   // positions in ColData that hold Money values
    const colTitles = [];   // human-readable month labels from QBO, e.g. "Jan 2026"
    rawCols.forEach((c, i) => {
      if (c.ColType === 'Money') { moneyIdx.push(i); colTitles.push(c.ColTitle || ''); }
    });

    // Convert "Jan 2026" or "Apr 1, 2026" → "2026-01"
    const MON = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
                  Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' };
    function toMonthKey(title) {
      const p = (title || '').trim().split(/\s+/);
      if (p.length === 2 && MON[p[0]]) return p[1] + '-' + MON[p[0]];           // "Jan 2026"
      if (p.length >= 3 && MON[p[0]]) return p[p.length-1] + '-' + MON[p[0]];  // "Apr 1, 2026"
      return title;
    }

    function parseVals(colData) {
      return moneyIdx.map(i =>
        parseFloat(((colData[i] && colData[i].value) || '0').replace(/,/g, '')) || 0
      );
    }

    // byName: label → [value per month column]
    const byName = {};
    // Per-section detail account arrays (current month balance only, non-zero)
    const bankAccts      = [];
    const creditCardAccts= [];
    const notesAccts     = [];

    // Walk the tree, tracking which section we're inside
    (function walk(rows, ctx) {
      if (!Array.isArray(rows)) return;
      rows.forEach(row => {
        // Determine child context from section header
        let childCtx = ctx;
        if (row.Header && row.Header.ColData) {
          const h  = (row.Header.ColData[0].value || '').trim();
          const hl = h.toLowerCase();
          if (hl === 'bank accounts' || hl.includes('bank account'))  childCtx = 'bank';
          else if (hl === 'credit cards' || hl.includes('credit card')) childCtx = 'cards';
          else if (hl === 'notes payable')                              childCtx = 'notes';
          else if (hl.includes('payroll liabilities'))                  childCtx = 'payroll';
        }

        // Section summary / total row
        if (row.Summary && row.Summary.ColData) {
          const n = (row.Summary.ColData[0].value || '').trim();
          if (n) byName[n] = parseVals(row.Summary.ColData);
        }

        // Individual account line
        if (row.ColData && row.ColData[0]) {
          const n    = (row.ColData[0].value || '').trim();
          const vals = parseVals(row.ColData);
          const cur  = vals[vals.length - 1] || 0;
          if (n) {
            byName[n] = vals;
            if      (childCtx === 'bank'    && cur !== 0) bankAccts.push({ name: n, balance: cur });
            else if (childCtx === 'cards'   && cur !== 0) creditCardAccts.push({ name: n, balance: cur });
            else if (childCtx === 'notes'   && cur !== 0) notesAccts.push({ name: n, balance: cur });
          }
        }

        if (row.Rows && row.Rows.Row) walk(row.Rows.Row, childCtx);
      });
    })((bsRes.data.Rows && bsRes.data.Rows.Row) || [], null);

    // ── Extract summary values ───────────────────────────────────
    function findArr(kws) {
      for (const k of Object.keys(byName)) {
        const kl = k.toLowerCase();
        if (kws.every(kw => kl.includes(kw.toLowerCase()))) return byName[k];
      }
      return colTitles.map(() => 0);
    }
    function findLast(kws) {
      const arr = findArr(kws);
      return arr[arr.length - 1] || 0;
    }

    const bankHistoryArr = findArr(['total', 'bank']);
    const cash           = bankHistoryArr[bankHistoryArr.length - 1] || 0;
    const currentAssets  = findLast(['total current assets']);
    const currentLiabs   = findLast(['total current liabilities']);
    const longTermLiabs  = findLast(['total long-term liabilities'])
                        || findLast(['total long term liabilities']);
    let totalLiabs       = findLast(['total liabilities']);
    if (!totalLiabs) {
      const totalLE    = findLast(['total liabilities and equity'])
                      || findLast(['liabilities and equity']);
      const totalEquity = findLast(['total equity']);
      if (totalLE && totalEquity) totalLiabs = totalLE - totalEquity;
    }
    if (!totalLiabs) totalLiabs = (currentLiabs || 0) + (longTermLiabs || 0);
    const creditCards    = findLast(['total', 'credit card']);
    const payrollLiabs   = findLast(['total', 'payroll']);
    const currentRatio   = currentLiabs > 0 ? currentAssets / currentLiabs : null;

    const payload = {
      connected:    true,
      asOf:         endDate.toISOString().slice(0, 10),
      // Current snapshot
      cash, currentAssets,
      currentLiabilities:  currentLiabs,
      longTermLiabilities: longTermLiabs,
      totalLiabilities:    totalLiabs,
      creditCards, payrollLiabilities: payrollLiabs,
      currentRatio,
      // Account-level breakdown (current month only)
      bankAccounts:    bankAccts,
      creditCardAccts: creditCardAccts,
      notesPayable:    notesAccts,
      // Multi-month history
      months:      colTitles.map(toMonthKey),
      bankHistory: bankHistoryArr
    };
    cacheSet('qbo-balance', payload);
    res.json(payload);
  } catch (err) {
    console.error('[/api/qbo-balance]', err.response?.status || '', err.message);
    if (err.response?.status === 401) {
      qboTokens.accessToken = null;
      return res.json({ connected: false, reason: 'token_expired' });
    }
    res.status(500).json({ connected: false, error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// /api/debug/techs — post-migration data audit
// ────────────────────────────────────────────────────────────────────────────
// Pulls every completed job in the last N days (default 180), groups by the
// exact HCP employee record each job is attributed to, and returns:
//   - `employees`        : every unique tech seen — id/name/jobs/revenue
//   - `gillSuspects`     : employees whose name TOKEN matches "gill" or
//                          "gil" only (ST-migration records for Thomas Gill
//                          showing up under any first/last name spelling).
//                          Does NOT flag on a "Thomas" match alone — that
//                          would sweep in Thomas Agnew, a different tech
//                          whose profile was separately renamed, and
//                          merging him into Gill would cause the inverse
//                          data error the user is trying to prevent.
//   - `unnamedProfiles`  : employees with blank / "Unknown" names — usually
//                          orphaned migration shells, worth inspecting
//                          separately from the Gill question.
//   - `orphanJobs`       : completed jobs with ZERO assigned_employees;
//                          counted in totalJobs but excluded from every
//                          tech's revenue (common ST→HCP import gap).
//
// Tech attribution in HCP is by employee UUID, not by name — so if a
// ServiceTitan technician was imported as "Thomas Gill" under employee
// id A, and later re-created in HCP as "Gill Gill" under employee id B,
// the two appear as separate rows. Compare raw counts side-by-side here.
//
// Query params:
//   ?days=180   — window size, clamped to [30, 365]
//   ?q=gill     — substring filter on employee name (case-insensitive)
// ────────────────────────────────────────────────────────────────────────────
app.get('/api/debug/techs', async (req, res) => {
  if (!API_KEY) return res.status(503).json({ error: 'HCP API key not configured' });
  try {
    const days    = Math.min(Math.max(parseInt(req.query.days || '180', 10), 30), 365);
    const needle  = (req.query.q || '').toString().trim().toLowerCase();
    const headers = hcpHeaders();

    // Wide window: `days` + 90 extra so we capture jobs scheduled long ago
    // but completed inside the window (same lookback /api/metrics uses).
    const now   = new Date();
    const start = new Date(now); start.setDate(start.getDate() - days - 90);
    const end   = new Date(now); end.setDate(end.getDate() + 1);

    const pageSize = 200;
    const params = {
      work_status: ['completed'],
      scheduled_start_min: start.toISOString(),
      scheduled_start_max: end.toISOString(),
      page_size: pageSize
    };
    const first = await axios.get(BASE_URL + '/jobs', { headers, params: { ...params, page: 1 } });
    const jobs  = first.data.jobs || [];
    const total = first.data.total_pages || 1;
    if (total > 1) {
      const pages = [];
      for (let p = 2; p <= total; p++) {
        pages.push(axios.get(BASE_URL + '/jobs', { headers, params: { ...params, page: p } }));
      }
      const results = await Promise.all(pages);
      results.forEach(r => jobs.push(...(r.data.jobs || [])));
    }

    // Keep only jobs with a real completion date inside the window
    const winStart = new Date(now); winStart.setDate(winStart.getDate() - days);
    const completed = jobs.filter(j => {
      const c = j.work_timestamps && j.work_timestamps.completed_at;
      if (!c) return false;
      const d = new Date(c);
      return d >= winStart && d < end;
    });

    // Aggregate by employee id
    const byId = {};
    const orphanJobs = [];
    completed.forEach(job => {
      const revenue  = parseFloat(job.total_amount || 0) / 100;
      const doers    = job.assigned_employees || [];
      const customer = job.customer
        ? ((job.customer.first_name || '') + ' ' + (job.customer.last_name || '')).trim()
        : '';
      const completedAt = job.work_timestamps && job.work_timestamps.completed_at;

      if (doers.length === 0) {
        orphanJobs.push({
          id: job.id,
          invoice: job.invoice_number || null,
          customer,
          completedAt,
          amount: Math.round(revenue),
          description: job.description || null
        });
        return;
      }

      // Split revenue evenly across all assigned employees for the audit
      // (the real /api/metrics uses a seller/doer 1/3-2/3 split; this
      // endpoint's job is to show attribution, not repeat that math).
      const share = revenue / doers.length;
      doers.forEach(emp => {
        const id = emp.id;
        if (!byId[id]) {
          byId[id] = {
            id,
            first_name: emp.first_name || '',
            last_name:  emp.last_name  || '',
            name: ((emp.first_name || '') + ' ' + (emp.last_name || '')).trim() || '(blank)',
            jobs: 0,
            revenue: 0,
            firstSeen: completedAt,
            lastSeen:  completedAt
          };
        }
        byId[id].jobs    += 1;
        byId[id].revenue += share;
        if (completedAt && completedAt < byId[id].firstSeen) byId[id].firstSeen = completedAt;
        if (completedAt && completedAt > byId[id].lastSeen)  byId[id].lastSeen  = completedAt;
      });
    });

    const employees = Object.values(byId)
      .map(e => ({ ...e, revenue: Math.round(e.revenue) }))
      .sort((a, b) => b.jobs - a.jobs);

    // Gill-specific suspect list. `\bgill?\b` matches "gill" OR "gil" as
    // a whole word token (case-insensitive) — catches "Gill Gill",
    // "Thomas Gill", "Gil", "T Gill", "Gill T", etc. It intentionally
    // does NOT match "gilbert", "virgil", or a bare "thomas" — so Thomas
    // Agnew (a separate tech whose profile was renamed) cannot be swept
    // into this list and accidentally merged into Gill.
    const GILL_TOKEN = /\bgill?\b/i;
    const gillSuspects = employees.filter(e =>
      GILL_TOKEN.test(e.first_name) ||
      GILL_TOKEN.test(e.last_name)  ||
      GILL_TOKEN.test(e.name)
    );

    // Separately: employees with blank or placeholder names. These are
    // usually migration shells and deserve a human look, but they are
    // not automatically "Gill" — surfacing them in their own bucket
    // prevents confusion between the two data issues.
    const UNNAMED_RE = /^(unknown|\(blank\))$/i;
    const unnamedProfiles = employees.filter(e =>
      !e.first_name.trim() && !e.last_name.trim() || UNNAMED_RE.test(e.name.trim())
    );

    const filtered = needle
      ? employees.filter(e => e.name.toLowerCase().includes(needle))
      : employees;

    // ── ServiceTitan import audit ──────────────────────────────────
    // Any job in the window flagged as ST-origin, split into:
    //   - `postCutover` : dated on/after ST_CUTOVER — MIS-DATED imports
    //                     now filtered out of /api/metrics + /api/marketing
    //   - `preCutover`  : dated before cutover — legitimate ST-era work
    //                     (not filtered — they belong in their period)
    // The `matchedOn` field shows which job field triggered the ST
    // detection so you can verify the heuristic isn't over-matching.
    const stAll = completed.filter(isServiceTitanJob);
    const stPost = stAll.filter(isPostCutoverSTArtifact);
    const stPre  = stAll.filter(j => !isPostCutoverSTArtifact(j));
    function summarizeST(list) {
      return list.map(j => ({
        id: j.id,
        invoice: j.invoice_number || null,
        completedAt: j.work_timestamps && j.work_timestamps.completed_at,
        customer: j.customer
          ? ((j.customer.first_name || '') + ' ' + (j.customer.last_name || '')).trim()
          : '',
        employees: (j.assigned_employees || []).map(e =>
          ((e.first_name || '') + ' ' + (e.last_name || '')).trim()
        ),
        amount: Math.round(parseFloat(j.total_amount || 0) / 100),
        matchedOn: describeSTMatch(j)
      })).sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
    }

    res.json({
      window:  { days, from: winStart.toISOString(), to: end.toISOString() },
      totals:  {
        completedJobs:    completed.length,
        uniqueEmployees:  employees.length,
        orphanJobCount:   orphanJobs.length,
        orphanJobRevenue: Math.round(orphanJobs.reduce((s, j) => s + j.amount, 0))
      },
      serviceTitanAudit: {
        cutoverDate:        ST_CUTOVER.toISOString(),
        totalFlagged:       stAll.length,
        postCutoverExcluded:{
          count:   stPost.length,
          revenue: Math.round(stPost.reduce((s, j) => s + parseFloat(j.total_amount || 0) / 100, 0)),
          jobs:    summarizeST(stPost)
        },
        preCutoverKept: {
          count:   stPre.length,
          revenue: Math.round(stPre.reduce((s, j) => s + parseFloat(j.total_amount || 0) / 100, 0))
        }
      },
      gillSuspects,       // strictly Gill-pattern names — never Thomas Agnew
      unnamedProfiles,    // blank / unknown-name employees (separate issue)
      employees: filtered,// full list (or filtered by ?q=)
      orphanJobs          // jobs with no assigned employee
    });
  } catch (err) {
    console.error('[/api/debug/techs]', err.response?.status || '', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  const parts = [
    'Dashboard running on port ' + PORT,
    'HCP:' + (API_KEY ? 'configured' : 'MISSING'),
    'QBO:' + (qboReady() ? 'ready' : qboConfigured() ? 'awaiting OAuth' : 'MISSING')
  ];
  console.log(parts.join(' | '));
});
