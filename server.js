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

// ── QuickBooks Online ────────────────────────────────────────────────────────
const QBO_CLIENT_ID     = process.env.QBO_CLIENT_ID;
const QBO_CLIENT_SECRET = process.env.QBO_CLIENT_SECRET;
const QBO_REDIRECT_URI  = (process.env.QBO_REDIRECT_URI || 'http://localhost:' + (process.env.PORT || 3000) + '/connect-quickbooks/callback').trim();
const QBO_BASE          = 'https://quickbooks.api.intuit.com';

// In-memory tokens + realmId — seeded from env vars on startup, updated after OAuth
const qboTokens = {
  accessToken:  null,
  refreshToken: process.env.QBO_REFRESH_TOKEN || null,
  expiresAt:    0,
  realmId:      process.env.QBO_REALM_ID || null   // captured automatically from OAuth callback
};

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

// Parse QBO ProfitAndLossDetail report — extracts individual transactions
// grouped by their "Total X" parent section.
// Returns { 'Total X': [{ date, type, num, name, memo, amount }, ...] }
function parsePnLDetail(report) {
  const cols = (report.Columns && report.Columns.Column) || [];

  // Identify column indices from column metadata
  const ci = {};
  cols.forEach((col, i) => {
    const t = (col.ColTitle || '').toLowerCase().trim();
    const ct = (col.ColType || '').toLowerCase();
    if (t === 'date' || t.includes('date')) ci.date = ci.date == null ? i : ci.date;
    else if (t === 'transaction type' || t === 'type') ci.type = i;
    else if (t === 'num' || t === 'no.' || t === 'doc. no.') ci.num = i;
    else if (t === 'name') ci.name = i;
    else if (t === 'memo' || t.includes('memo') || t.includes('description')) ci.memo = i;
    // Amount = last Money column (skip intermediate sub-total columns)
    if (ct === 'money') ci.amount = i;
  });

  const txnMap = {}; // "Total X" → [transactions]

  function val(cd, idx) {
    return (idx != null && cd && cd[idx]) ? (cd[idx].value || '') : '';
  }

  function walkSection(rows) {
    const txns = [];
    if (!Array.isArray(rows)) return txns;
    for (const row of rows) {
      if (row.Header && row.Rows && row.Rows.Row) {
        // Sub-section — recurse
        const childTxns = walkSection(row.Rows.Row);
        // Store under the "Total X" name from Summary
        if (row.Summary && row.Summary.ColData) {
          const sumName = ((row.Summary.ColData[0] || {}).value || '').trim();
          if (sumName.startsWith('Total ') && childTxns.length) {
            txnMap[sumName] = (txnMap[sumName] || []).concat(childTxns);
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
        txns.push({
          date: dateStr,
          type: val(cd, ci.type),
          num:  val(cd, ci.num),
          name: val(cd, ci.name),
          memo: val(cd, ci.memo),
          amount
        });
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

    const allJobs = [];
    let page = 1;
    const pageSize = 200;
    while (true) {
      const jobsRes = await axios.get(BASE_URL + '/jobs', {
        headers,
        params: {
          work_status: ['completed'],
          scheduled_start_min: periodStart.toISOString(),
          scheduled_start_max: periodEnd.toISOString(),
          page,
          page_size: pageSize
        }
      });
      const pageJobs = jobsRes.data.jobs || [];
      allJobs.push(...pageJobs);
      const totalPages = jobsRes.data.total_pages || 1;
      if (page >= totalPages) break;
      page++;
    }

    // Fetch original estimates to identify who sold each job (the seller gets 1/3 credit)
    const estimateIds = [...new Set(
      allJobs
        .map(j => j.original_estimate_id || (j.original_estimate_uuids && j.original_estimate_uuids[0]))
        .filter(Boolean)
    )];
    const estimateSellerMap = {};
    if (estimateIds.length > 0) {
      const BATCH = 10;
      for (let i = 0; i < estimateIds.length; i += BATCH) {
        const batch = estimateIds.slice(i, i + BATCH);
        const results = await Promise.all(
          batch.map(id =>
            axios.get(BASE_URL + '/estimates/' + id, { headers })
              .then(r => {
                // HCP may return a single object (assigned_employee) or an array (assigned_employees)
                const d = r.data;
                const employees = d.assigned_employees
                  || (d.assigned_employee ? [d.assigned_employee] : []);
                return { id, employees };
              })
              .catch(() => ({ id, employees: [] }))
          )
        );
        results.forEach(r => { estimateSellerMap[r.id] = r.employees; });
      }
    }

    const techMetrics = {};

    function ensureTech(emp) {
      if (!techMetrics[emp.id]) {
        const name = ((emp.first_name || '') + ' ' + (emp.last_name || '')).trim() || 'Unknown';
        techMetrics[emp.id] = { id: emp.id, name, revenue: 0, jobs: 0, jobList: [] };
      }
    }

    allJobs.forEach(job => {
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
    const totalJobs = allJobs.length;
    const avgTicket = totalJobs > 0 ? Math.round(totalRevenue / totalJobs) : 0;

    res.json({
      leaderboard,
      summary: { totalRevenue, totalJobs, averageTicket: avgTicket, period: periodLabel }
    });

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
      const allJobs = [];
      let page = 1;
      while (true) {
        const r = await axios.get(BASE_URL + '/jobs', {
          headers,
          params: {
            work_status: ['completed'],
            scheduled_start_min: bucket.start.toISOString(),
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
      const revenue = allJobs.reduce((s, j) => s + parseFloat(j.total_amount || 0) / 100, 0);
      return {
        ...bucket,
        jobs: allJobs.length,
        revenue: Math.round(revenue),
        avgTicket: allJobs.length > 0 ? Math.round(revenue / allJobs.length) : 0
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

    const transactions = (txnMap[acct] || []).slice();
    // Sort newest-first
    transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({ connected: true, acct, month, transactions });
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

    // Convert "Jan 2026" → "2026-01"
    const MON = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
                  Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' };
    function toMonthKey(title) {
      const p = (title || '').split(' ');
      return (p.length === 2 && MON[p[0]]) ? p[1] + '-' + MON[p[0]] : title;
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

app.listen(PORT, () => {
  const parts = [
    'Dashboard running on port ' + PORT,
    'HCP:' + (API_KEY ? 'configured' : 'MISSING'),
    'QBO:' + (qboReady() ? 'ready' : qboConfigured() ? 'awaiting OAuth' : 'MISSING')
  ];
  console.log(parts.join(' | '));
});
