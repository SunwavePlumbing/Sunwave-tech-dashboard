const express = require('express');
const axios = require('axios');
const app = express();

// Log every request so we can see in Railway logs what's actually hitting Express
app.use((req, res, next) => {
  console.log('[REQ]', req.method, req.path);
  next();
});

// Simple test route
app.get('/ping', (req, res) => res.send('pong'));

const API_KEY = process.env.HOUSECALL_PRO_API_KEY;
const PORT = process.env.PORT || 3000;
const BASE_URL = 'https://api.housecallpro.com';

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
  console.log('[QBO] Access token refreshed. Refresh token: ' + qboTokens.refreshToken);
  return qboTokens.accessToken;
}

// Parse QBO P&L response: extract "Advertising & Marketing" spend per month
// Returns { 'YYYY-MM': dollars, ... }
function extractMarketingSpend(report) {
  const spend = {};

  // Build a map: column index → 'YYYY-MM'
  const colIndexToMonth = {};
  const columns = (report.Columns && report.Columns.Column) || [];
  columns.forEach((col, idx) => {
    if (col.ColType !== 'Money') return;
    const meta = col.MetaData || [];
    const startMeta = meta.find(m => m.Name === 'StartDate');
    if (!startMeta) return;
    const d = new Date(startMeta.Value);
    colIndexToMonth[idx] = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  });

  const KEYWORDS = ['advertising', 'marketing'];
  function isMarketing(name) {
    const n = (name || '').toLowerCase();
    return KEYWORDS.some(k => n.includes(k));
  }

  function addRow(colData) {
    // colData[0] = label, colData[1..] = values
    Object.entries(colIndexToMonth).forEach(([idx, month]) => {
      const raw = (colData[idx] && colData[idx].value) || '0';
      const val = parseFloat(raw.replace(/,/g, '')) || 0;
      if (val !== 0) spend[month] = (spend[month] || 0) + val;
    });
  }

  function walk(rows) {
    if (!Array.isArray(rows)) return;
    rows.forEach(row => {
      const headerName = row.Header && row.Header.ColData && row.Header.ColData[0] && row.Header.ColData[0].value;
      if (isMarketing(headerName)) {
        // Use the Summary totals for this section (avoids double-counting sub-rows)
        if (row.Summary && row.Summary.ColData) {
          addRow(row.Summary.ColData);
        } else if (row.Rows && row.Rows.Row) {
          walk(row.Rows.Row); // no summary — walk sub-rows
        }
        return; // don't recurse further into marketing section
      }
      // Check plain data rows (no sub-rows)
      if (row.ColData && isMarketing(row.ColData[0] && row.ColData[0].value)) {
        addRow(row.ColData);
      }
      // Recurse into sections
      if (row.Rows && row.Rows.Row) walk(row.Rows.Row);
    });
  }

  walk((report.Rows && report.Rows.Row) || []);
  return spend;
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

  function walk(rows) {
    if (!Array.isArray(rows)) return;
    rows.forEach(row => {
      if (row.Header && row.Header.ColData) {
        if (row.Rows && row.Rows.Row) walk(row.Rows.Row);
        if (row.Summary && row.Summary.ColData) {
          const n = ((row.Summary.ColData[0] || {}).value || '').trim();
          store(n, row.Summary.ColData);
        }
      }
      if (row.ColData && row.ColData[0]) {
        const n = (row.ColData[0].value || '').trim();
        store(n, row.ColData);
      }
    });
  }

  walk((report.Rows && report.Rows.Row) || []);
  return { months, accounts };
}
// ────────────────────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sunwave Tech Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { overflow-x: hidden; max-width: 100%; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; }

    .header { background: #1a2d3a; color: white; padding: 1.25rem 1rem 1.1rem; text-align: center; }
    .header-eyebrow { font-size: 11px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; opacity: 0.5; margin-bottom: 4px; }
    .header h1 { font-size: 26px; font-weight: 700; margin: 0 0 0.35rem 0; letter-spacing: -0.3px; }
    .header-sub { display: flex; align-items: center; justify-content: center; gap: 10px; }
    .header-location { font-size: 12px; font-weight: 500; opacity: 0.6; letter-spacing: 0.5px; }
    .header-dot { width: 3px; height: 3px; border-radius: 50%; background: white; opacity: 0.35; display: inline-block; }
    .header-period { font-size: 12px; opacity: 0.75; }

    .main-wrapper { display: grid; grid-template-columns: 180px 1fr; min-height: calc(100vh - 100px); }
    .sidebar { background: white; padding: 1.5rem 1rem; border-right: 1px solid #e5e5e5; overflow-y: auto; }
    .date-btn { display: block; width: 100%; padding: 9px 12px; font-size: 13px; border: none; background: transparent; color: #444; cursor: pointer; text-align: left; border-radius: 6px; margin-bottom: 3px; transition: background 0.15s; }
    .date-btn:hover { background: #f0f0f0; }
    .date-btn.active { background: #FF9500; color: white; font-weight: 600; }

    .content { padding: 1.5rem; }

    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin-bottom: 1.5rem; }
    .stat-card { background: white; padding: 1.1rem 1rem; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); text-align: center; }
    .stat-label { font-size: 11px; color: #888; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; margin-bottom: 6px; }
    .stat-value { font-size: 26px; font-weight: 700; color: #FF9500; }

    .sort-section { display: flex; align-items: center; gap: 8px; margin-bottom: 1rem; flex-wrap: wrap; }
    .sort-label { font-size: 12px; color: #888; text-transform: uppercase; font-weight: 600; }
    .sort-btn { padding: 6px 14px; font-size: 13px; border: 1px solid #e0e0e0; border-radius: 20px; background: white; color: #555; cursor: pointer; transition: all 0.15s; white-space: nowrap; }
    .sort-btn:hover { background: #f5f5f5; }
    .sort-btn.active { background: #FF9500; color: white; border-color: #FF9500; font-weight: 600; }
    #leaderboardBody { transition: opacity 0.15s ease; }
    #leaderboardBody.sorting { opacity: 0.3; }

    .table-wrapper { position: relative; background: white; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); overflow: hidden; }
    .table-wrapper.loading::after { content: ''; position: absolute; inset: 0; background: rgba(255,255,255,0.65); z-index: 10; }
    .spinner { display: none; position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); z-index: 11; width: 36px; height: 36px; border: 3px solid #eee; border-top-color: #FF9500; border-radius: 50%; animation: spin 0.7s linear infinite; }
    .table-wrapper.loading .spinner { display: block; }
    @keyframes spin { to { transform: translate(-50%,-50%) rotate(360deg); } }

    table { width: 100%; border-collapse: collapse; }
    thead th { padding: 12px 16px; text-align: left; font-size: 12px; color: #888; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; border-bottom: 1px solid #f0f0f0; }
    thead th:not(:first-child) { text-align: right; }
    tbody tr { border-bottom: 1px solid #f7f7f7; transition: background 0.1s; cursor: pointer; }
    tbody tr:last-child { border-bottom: none; }
    tbody tr:hover { background: #fff8f0; }
    tbody td { padding: 14px 16px; font-size: 14px; }
    tbody td:not(:first-child) { text-align: right; font-variant-numeric: tabular-nums; }
    .ticket-red { color: #E5484D; font-weight: 600; }
    .ticket-amber { color: #C9820A; font-weight: 600; }
    .ticket-green { color: #12A071; font-weight: 600; }
    tfoot tr { border-top: 2px solid #f0f0f0; }
    tfoot td { padding: 12px 16px; font-size: 13px; font-weight: 700; color: #555; text-transform: uppercase; letter-spacing: 0.3px; }
    tfoot td:not(:first-child) { text-align: right; font-variant-numeric: tabular-nums; }

    .tech-cell { display: flex; align-items: center; gap: 12px; }
    .avatar { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; color: white; flex-shrink: 0; letter-spacing: 0.5px; }
    .tech-name-label { font-size: 14px; font-weight: 500; color: #333; }
    .rank-num { font-size: 13px; font-weight: 700; color: #bbb; min-width: 18px; text-align: center; }

    .modal-backdrop { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 100; align-items: center; justify-content: center; }
    .modal-backdrop.open { display: flex; }
    .modal { background: white; border-radius: 12px; width: 90%; max-width: 660px; max-height: 80vh; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
    .modal-header { padding: 1.2rem 1.4rem; border-bottom: 1px solid #f0f0f0; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
    .modal-title { font-size: 16px; font-weight: 700; color: #1a2d3a; }
    .modal-close { background: none; border: none; font-size: 24px; color: #bbb; cursor: pointer; line-height: 1; padding: 0 2px; }
    .modal-close:hover { color: #555; }
    .modal-body { overflow-y: auto; flex: 1; }
    .modal-table { width: 100%; border-collapse: collapse; }
    .modal-table thead th { padding: 10px 16px; font-size: 11px; color: #888; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; border-bottom: 1px solid #f0f0f0; text-align: left; position: sticky; top: 0; background: white; }
    .modal-table thead th:nth-child(4), .modal-table thead th:nth-child(5) { text-align: right; }
    .modal-table tbody td { padding: 11px 16px; font-size: 13px; border-bottom: 1px solid #f7f7f7; color: #444; }
    .modal-table tbody tr:last-child td { border-bottom: none; }
    .modal-table tbody td:nth-child(4), .modal-table tbody td:nth-child(5) { text-align: right; font-weight: 600; color: #333; font-variant-numeric: tabular-nums; }
    .modal-footer { padding: 1rem 1.4rem; border-top: 2px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }
    .modal-footer-left { font-size: 13px; color: #888; }
    .modal-footer-right { font-size: 16px; font-weight: 700; color: #FF9500; }
    .role-badge { display: inline-block; font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 4px; margin-left: 6px; vertical-align: middle; letter-spacing: 0.3px; }
    .role-sold-did { background: #FFF3E0; color: #E65100; }
    .role-sold { background: #E8F5E9; color: #2E7D32; }
    .role-did { background: #F3F4F6; color: #6B7280; }
    .share-pct { font-size: 11px; color: #aaa; font-weight: 400; margin-left: 4px; }

    .footer { text-align: center; font-size: 11px; color: #aaa; padding: 1rem; }
    .error-msg { background: #fff3f3; color: #c62828; padding: 1.2rem 1.4rem; font-size: 14px; }

    @media (max-width: 768px) {
      .main-wrapper { grid-template-columns: 1fr; }
      .sidebar { border-right: none; border-bottom: 1px solid #eee; display: block; padding: 0; background: white; }
      .sidebar-primary { display: flex; overflow-x: auto; gap: 6px; padding: 10px 14px; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
      .sidebar-primary::-webkit-scrollbar { display: none; }
      .date-btn { display: inline-flex; align-items: center; width: auto; white-space: nowrap; flex-shrink: 0; margin-bottom: 0; padding: 7px 13px; border-radius: 20px; border: 1px solid #e8e8e8; background: white; font-size: 13px; }
      .date-btn.active { border-color: #FF9500; }
      .sidebar-more-toggle { width: 100%; padding: 7px 14px; font-size: 12px; color: #999; background: #fafafa; border: none; border-top: 1px solid #f0f0f0; cursor: pointer; text-align: center; letter-spacing: 0.2px; }
      .sidebar-more-panel { display: none; grid-template-columns: 1fr 1fr 1fr; gap: 5px; padding: 10px 14px 14px; background: #fafafa; border-top: 1px solid #f0f0f0; }
      .sidebar-more-panel.open { display: grid; }
      .sidebar-more-panel .date-btn { width: 100%; white-space: normal; text-align: center; font-size: 11px; padding: 6px 4px; border-radius: 8px; justify-content: center; line-height: 1.3; }
      .content { padding: 0.85rem; }
      .sort-section { gap: 6px; margin-bottom: 0.85rem; }
      .sort-label { display: none; }
      .sort-btn { padding: 5px 12px; font-size: 12px; }
      .stats { grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 1rem; }
      .stat-card { padding: 0.7rem 0.4rem; }
      .stat-label { font-size: 10px; }
      .stat-value { font-size: 18px; }
      .table-wrapper { border-radius: 8px; overflow-x: auto; }
      .avatar { width: 28px; height: 28px; font-size: 10px; border-radius: 6px; }
      thead th, tbody td, tfoot td { padding: 9px 8px; font-size: 12px; }
      tbody td:first-child, thead th:first-child { padding-left: 10px; }
      .tech-cell { gap: 7px; }
      .tech-name-label { font-size: 12px; }
      /* Modal becomes a bottom sheet on mobile */
      .modal-backdrop { align-items: flex-end; }
      .modal { border-radius: 20px 20px 0 0; width: 100%; max-width: 100%; max-height: 88vh; }
      .modal-table { display: none; }
      .modal-cards { display: block; }
      .job-card { padding: 12px 16px; border-bottom: 1px solid #f3f3f3; }
      .job-card:last-child { border-bottom: none; }
      .job-card-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 3px; }
      .job-card-date { font-size: 12px; color: #aaa; }
      .job-card-right { text-align: right; }
      .job-card-credit { font-size: 15px; font-weight: 700; color: #333; }
      .job-card-credit-pct { font-size: 11px; color: #bbb; margin-left: 3px; }
      .job-card-total { font-size: 11px; color: #bbb; }
      .job-card-desc { font-size: 13px; color: #444; margin-bottom: 3px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .job-card-meta { font-size: 12px; color: #aaa; display: flex; align-items: center; gap: 6px; }
    }
    @media (min-width: 769px) { .modal-cards { display: none; } }

    /* Tab navigation */
    .tab-nav { display: flex; gap: 0; border-bottom: 2px solid #f0f0f0; margin-bottom: 1.2rem; }
    .tab-btn { padding: 10px 20px; font-size: 14px; font-weight: 600; background: none; border: none; color: #aaa; cursor: pointer; border-bottom: 3px solid transparent; margin-bottom: -2px; transition: all 0.15s; letter-spacing: 0.2px; }
    .tab-btn:hover { color: #555; }
    .tab-btn.active { color: #FF9500; border-bottom-color: #FF9500; }
    .view-panel { display: none; }
    .view-panel.active { display: block; }

    /* Marketing view */
    .proj-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin-bottom: 1.5rem; }
    .proj-card { background: white; padding: 1.1rem 1rem; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); text-align: center; }
    .proj-card-label { font-size: 11px; color: #888; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; margin-bottom: 6px; }
    .proj-card-value { font-size: 26px; font-weight: 700; color: #FF9500; }
    .proj-card-sub { font-size: 11px; color: #bbb; margin-top: 4px; }
    .progress-wrap { background: white; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); padding: 1.1rem 1.2rem; margin-bottom: 1.5rem; }
    .progress-label-row { display: flex; justify-content: space-between; font-size: 12px; color: #888; margin-bottom: 8px; font-weight: 500; }
    .progress-bar-bg { background: #f0f0f0; border-radius: 8px; height: 10px; overflow: hidden; }
    .progress-bar-fill { height: 100%; background: linear-gradient(90deg, #FF9500, #FF6B35); border-radius: 8px; transition: width 0.5s ease; }
    .section-title { font-size: 12px; font-weight: 700; color: #aaa; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 0.75rem; }
    .bar-chart-card { background: white; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); padding: 1.2rem 1.4rem 0.8rem; margin-bottom: 1.5rem; }
    .bar-chart { display: flex; align-items: flex-end; gap: 6px; height: 130px; margin-bottom: 0; }
    .bar-col { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; flex: 1; min-width: 0; }
    .bar { width: 100%; background: #FF9500; border-radius: 4px 4px 0 0; min-height: 3px; }
    .bar.is-current { background: #FF6B35; }
    .bar-val { font-size: 9px; color: #888; font-weight: 600; margin-bottom: 2px; line-height: 1; }
    .bar-lbl { font-size: 9px; color: #bbb; margin-top: 5px; text-align: center; width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .mkt-table-card { background: white; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); overflow: hidden; margin-bottom: 1.5rem; }
    .mkt-table { width: 100%; border-collapse: collapse; }
    .mkt-table thead th { padding: 11px 16px; font-size: 11px; color: #888; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; border-bottom: 1px solid #f0f0f0; text-align: left; }
    .mkt-table thead th:not(:first-child) { text-align: right; }
    .mkt-table tbody td { padding: 12px 16px; font-size: 13px; border-bottom: 1px solid #f7f7f7; color: #444; }
    .mkt-table tbody tr:last-child td { border-bottom: none; }
    .mkt-table tbody td:not(:first-child) { text-align: right; font-variant-numeric: tabular-nums; }
    .mkt-table tfoot td { padding: 11px 16px; font-size: 12px; font-weight: 700; color: #555; border-top: 2px solid #f0f0f0; text-align: right; }
    .mkt-table tfoot td:first-child { text-align: left; }
    .delta { font-size: 11px; margin-left: 5px; }
    .delta-up { color: #12A071; }
    .delta-down { color: #E5484D; }
    .mkt-row-current { background: #fffbf5; font-weight: 600; }
    @media (max-width: 768px) {
      .tab-btn { padding: 9px 14px; font-size: 13px; }
      .bar-chart { gap: 3px; height: 90px; }
      .bar-val { font-size: 8px; }
      .bar-lbl { font-size: 8px; }
      .mkt-table thead th, .mkt-table tbody td, .mkt-table tfoot td { padding: 9px 10px; font-size: 12px; }
    }

    /* ── Financial / Owners Tab ─────────────────────────────────── */
    .fin-connect-banner { background:#fff8f0;border:1px solid #FFE0B2;border-radius:10px;padding:20px 24px;text-align:center;margin:2rem 0; }
    .fin-connect-banner p { font-size:14px;color:#888;margin-bottom:12px; }

    .fin-filter-bar { display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:1.4rem;background:white;padding:10px 14px;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.07); }
    .fin-filter-label { font-size:11px;color:#aaa;text-transform:uppercase;font-weight:600;letter-spacing:0.4px; }
    .fin-select { padding:6px 10px;font-size:13px;border:1px solid #e5e5e5;border-radius:6px;background:white;color:#333;cursor:pointer; }
    .fin-toggle { display:flex;border:1px solid #e5e5e5;border-radius:6px;overflow:hidden; }
    .fin-toggle button { padding:5px 12px;font-size:12px;font-weight:600;border:none;background:white;color:#888;cursor:pointer;transition:all 0.15s; }
    .fin-toggle button.active { background:#1a2d3a;color:white; }
    .fin-refresh-btn { margin-left:auto;padding:6px 14px;font-size:12px;font-weight:600;border:1px solid #e0e0e0;border-radius:6px;background:white;color:#555;cursor:pointer;transition:background 0.15s; }
    .fin-refresh-btn:hover { background:#f5f5f5; }
    .fin-updated { font-size:11px;color:#bbb; }

    .fin-cards { display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:1.4rem; }
    @media(max-width:900px) { .fin-cards { grid-template-columns:repeat(2,1fr); } }
    @media(max-width:500px) { .fin-cards { grid-template-columns:1fr; } }
    .fin-card { background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:16px 18px;position:relative;overflow:hidden; }
    .fin-card-label { font-size:11px;color:#888;text-transform:uppercase;font-weight:600;letter-spacing:0.4px;margin-bottom:4px; }
    .fin-card-value { font-size:24px;font-weight:700;color:#1a2d3a;margin-bottom:2px; }
    .fin-card-value.c-green { color:#12A071; }
    .fin-card-value.c-yellow { color:#C9820A; }
    .fin-card-value.c-red { color:#E5484D; }
    .fin-card-sub { font-size:12px;color:#888;margin-bottom:8px; }
    .fin-card-delta { font-size:12px;font-weight:600; }
    .fin-card-delta.up { color:#12A071; }
    .fin-card-delta.down { color:#E5484D; }
    .fin-card-spark { position:absolute;bottom:0;right:0;opacity:0.6; }

    .fin-row2 { display:grid;grid-template-columns:3fr 2fr;gap:14px;margin-bottom:1.4rem; }
    @media(max-width:768px) { .fin-row2 { grid-template-columns:1fr; } }
    .fin-chart-card { background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:18px; }
    .fin-chart-title { font-size:13px;font-weight:700;color:#1a2d3a;margin-bottom:14px;letter-spacing:0.1px; }
    .fin-chart-title span { font-size:11px;font-weight:400;color:#aaa;margin-left:6px; }
    .fin-chart-wrap { position:relative; }

    .fin-trend-toggles { display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px; }
    .fin-trend-btn { padding:4px 12px;font-size:11px;font-weight:600;border:1px solid #e0e0e0;border-radius:20px;background:white;color:#888;cursor:pointer;transition:all 0.15s; }
    .fin-trend-btn.on { border-color:currentColor;background:currentColor;color:white!important; }

    .fin-alerts { margin-bottom:1.4rem; }
    .fin-alerts-title { font-size:13px;font-weight:700;color:#1a2d3a;margin-bottom:10px; }
    .fin-alert { display:flex;align-items:flex-start;gap:12px;background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.07);padding:14px 16px;margin-bottom:8px;border-left:4px solid transparent; }
    .fin-alert.red { border-left-color:#E5484D; }
    .fin-alert.yellow { border-left-color:#C9820A; }
    .fin-alert-dot { width:10px;height:10px;border-radius:50%;flex-shrink:0;margin-top:3px; }
    .fin-alert.red .fin-alert-dot { background:#E5484D; }
    .fin-alert.yellow .fin-alert-dot { background:#C9820A; }
    .fin-alert-body { flex:1; }
    .fin-alert-msg { font-size:13px;color:#333;line-height:1.5; }
    .fin-alert-range { font-size:11px;color:#aaa;margin-top:2px; }
    .fin-no-alerts { background:white;border-radius:10px;padding:16px 18px;font-size:13px;color:#aaa;box-shadow:0 1px 3px rgba(0,0,0,0.07); }
  </style>
</head>
<body>

<div class="header">
  <div class="header-eyebrow">Tech Performance</div>
  <h1>Sunwave</h1>
  <div class="header-sub">
    <span class="header-location">&#x1F4CD; Charlottesville</span>
    <span class="header-dot"></span>
    <span class="header-period" id="period">Loading...</span>
  </div>
</div>

<div class="main-wrapper">
  <div class="sidebar" id="dateSidebar"></div>
  <div class="content">
    <!-- Tab navigation -->
    <div class="tab-nav">
      <button class="tab-btn" data-tab="technicians">Technicians</button>
      <button class="tab-btn" data-tab="marketing">Marketing</button>
      <button class="tab-btn" data-tab="owners">Location Owners</button>
    </div>

    <!-- Technicians view -->
    <div class="view-panel" id="techView">
      <div class="stats" id="stats">
        <div class="stat-card"><div class="stat-label">Total Revenue</div><div class="stat-value">—</div></div>
        <div class="stat-card"><div class="stat-label">Avg Ticket</div><div class="stat-value">—</div></div>
        <div class="stat-card"><div class="stat-label">Total Jobs</div><div class="stat-value">—</div></div>
      </div>
      <div class="sort-section">
        <span class="sort-label">Sort:</span>
        <button class="sort-btn active" data-sort="revenue">Revenue</button>
        <button class="sort-btn" data-sort="ticket">Avg Ticket</button>
        <button class="sort-btn" data-sort="jobs"># Jobs</button>
      </div>
      <div class="table-wrapper" id="tableWrapper">
        <div class="spinner"></div>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Revenue</th>
              <th>Avg Ticket</th>
              <th># Jobs</th>
            </tr>
          </thead>
          <tbody id="leaderboardBody">
            <tr><td colspan="4" style="padding:2rem;text-align:center;color:#aaa">Loading...</td></tr>
          </tbody>
          <tfoot id="leaderboardFoot"></tfoot>
        </table>
      </div>
    </div>

    <!-- Marketing view -->
    <div class="view-panel" id="marketingView">
      <div id="marketingContent">
        <div style="text-align:center;padding:3rem;color:#aaa;font-size:14px">Loading marketing data...</div>
      </div>
    </div>

    <!-- Location Owners view -->
    <div class="view-panel" id="ownersView">
      <!-- Filter bar -->
      <div class="fin-filter-bar" id="finFilterBar" style="display:none">
        <span class="fin-filter-label">View</span>
        <div class="fin-toggle">
          <button id="finModeDollar" class="active" onclick="setFinMode('dollar')">$</button>
          <button id="finModePct" onclick="setFinMode('pct')">% Rev</button>
        </div>
        <button class="fin-refresh-btn" onclick="fetchOwnersData(true)">&#8635; Refresh</button>
        <span class="fin-updated" id="finUpdated"></span>
      </div>

      <!-- Summary cards -->
      <div class="fin-cards" id="finCards">
        <div style="text-align:center;padding:3rem;color:#aaa;font-size:14px;grid-column:1/-1">Loading financial data\u2026</div>
      </div>

      <!-- Row 2: Waterfall + Donut -->
      <div class="fin-row2" id="finRow2" style="display:none">
        <div class="fin-chart-card">
          <div class="fin-chart-title">P&amp;L Waterfall <span>Revenue → Net Operating Income</span></div>
          <div class="fin-chart-wrap" style="height:280px"><canvas id="waterfallChart"></canvas></div>
        </div>
        <div class="fin-chart-card">
          <div class="fin-chart-title">Operating Expenses <span id="donutSubtitle"></span></div>
          <div class="fin-chart-wrap" style="height:260px"><canvas id="donutChart"></canvas></div>
        </div>
      </div>

      <!-- Row 3: Trend lines -->
      <div class="fin-chart-card" id="finTrendCard" style="display:none;margin-bottom:1.4rem">
        <div class="fin-chart-title">Key Ratios — Monthly Trend <span>% of Revenue</span></div>
        <div class="fin-trend-toggles" id="trendToggles"></div>
        <div class="fin-chart-wrap" style="height:240px"><canvas id="trendChart"></canvas></div>
      </div>

      <!-- Alerts -->
      <div class="fin-alerts" id="finAlerts" style="display:none">
        <div class="fin-alerts-title">&#9888;&#65039; Alerts &amp; Insights</div>
        <div id="finAlertsList"></div>
      </div>
    </div>
  </div>
</div>

<div class="footer">
  Updates every 5 minutes &bull; Last updated: <span id="lastUpdate">Never</span>
</div>

<div class="modal-backdrop" id="modalBackdrop">
  <div class="modal">
    <div class="modal-header">
      <span class="modal-title" id="modalTitle">Jobs</span>
      <button class="modal-close" id="modalClose">&times;</button>
    </div>
    <div class="modal-body">
      <table class="modal-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Customer</th>
            <th>Job Total</th>
            <th>Their Share</th>
          </tr>
        </thead>
        <tbody id="modalBody"></tbody>
      </table>
      <div id="modalCards" class="modal-cards"></div>
    </div>
    <div class="modal-footer">
      <span class="modal-footer-left" id="modalJobCount"></span>
      <span class="modal-footer-right" id="modalTotal"></span>
    </div>
  </div>
</div>

<script>
  var currentData = null;
  var currentSort = 'revenue';
  var currentTimeRange = 'mtd';
  var isFetching = false;

  var dateRanges = [
    { label: 'Today', key: 'day' },
    { label: 'Yesterday', key: 'yesterday' },
    { label: 'This Week', key: 'week' },
    { label: 'Week to Date', key: 'wtd' },
    { label: 'Last 7 Days', key: 'l7d' },
    { label: 'Last 14 Days', key: 'l14d' },
    { label: 'Last 30 Days', key: 'l30d' },
    { label: 'Month to Date', key: 'mtd' },
    { label: 'Last Month', key: 'lm' },
    { label: 'Last 90 Days', key: 'l90d' },
    { label: 'This Quarter', key: 'qtd' },
    { label: 'Last Quarter', key: 'lq' },
    { label: 'Quarter to Date', key: 'q2d' },
    { label: 'Year to Date', key: 'ytd' },
    { label: 'Last 365 Days', key: 'l365d' },
    { label: 'Last Year', key: 'ly' }
  ];

  var AVATAR_COLORS = ['#FF9500','#007AFF','#34C759','#AF52DE','#FF3B30','#5AC8FA','#FF6B35','#30B0C7'];
  function avatarColor(name) {
    var h = 0;
    for (var i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
    return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
  }
  function initials(name) {
    var p = name.trim().split(/\s+/);
    if (p.length >= 2) return (p[0][0] + p[p.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  function fmt(n) { return '$' + Math.round(n).toLocaleString(); }
  function fmtDate(iso) {
    if (!iso) return '\u2014';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Build sidebar
  var sidebar = document.getElementById('dateSidebar');
  var commonKeys = ['day', 'yesterday', 'mtd', 'lm', 'l30d', 'ytd'];

  function createDateBtn(range) {
    var btn = document.createElement('button');
    btn.className = 'date-btn' + (range.key === 'mtd' ? ' active' : '');
    btn.textContent = range.label;
    btn.dataset.range = range.key;
    btn.addEventListener('click', function() {
      if (isFetching) return;
      currentTimeRange = this.dataset.range;
      document.querySelectorAll('.date-btn').forEach(function(b) { b.classList.remove('active'); });
      this.classList.add('active');
      fetchData();
    });
    return btn;
  }

  if (window.innerWidth <= 768) {
    var primaryRow = document.createElement('div');
    primaryRow.className = 'sidebar-primary';
    var morePanel = document.createElement('div');
    morePanel.className = 'sidebar-more-panel';

    dateRanges.forEach(function(range) {
      if (commonKeys.indexOf(range.key) !== -1) {
        primaryRow.appendChild(createDateBtn(range));
      } else {
        morePanel.appendChild(createDateBtn(range));
      }
    });

    var moreToggle = document.createElement('button');
    moreToggle.className = 'sidebar-more-toggle';
    moreToggle.textContent = 'More date ranges \u25be';
    moreToggle.addEventListener('click', function() {
      var open = morePanel.classList.toggle('open');
      this.textContent = open ? 'Fewer options \u25b4' : 'More date ranges \u25be';
    });

    sidebar.appendChild(primaryRow);
    sidebar.appendChild(moreToggle);
    sidebar.appendChild(morePanel);
  } else {
    dateRanges.forEach(function(range) {
      sidebar.appendChild(createDateBtn(range));
    });
  }

  document.querySelectorAll('.sort-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var newSort = this.dataset.sort;
      if (newSort === currentSort) return;
      currentSort = newSort;
      document.querySelectorAll('.sort-btn').forEach(function(b) { b.classList.remove('active'); });
      this.classList.add('active');
      var body = document.getElementById('leaderboardBody');
      body.classList.add('sorting');
      setTimeout(function() {
        render();
        body.classList.remove('sorting');
      }, 120);
    });
  });

  // Modal
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalBackdrop').addEventListener('click', function(e) {
    if (e.target === this) closeModal();
  });
  document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeModal(); });

  function openModal(tech) {
    document.getElementById('modalTitle').textContent = esc(tech.name) + ' \u2014 Jobs';
    var jobs = (tech.jobList || []).slice().sort(function(a, b) {
      return new Date(b.date || 0) - new Date(a.date || 0);
    });

    var roleClass = function(role) {
      return role === 'Sold & Did' ? 'role-sold-did' : role === 'Sold' ? 'role-sold' : 'role-did';
    };

    // Desktop: table rows
    var rows = jobs.map(function(job) {
      var desc = job.description ? esc(job.description) : (job.invoice ? 'Invoice #' + esc(job.invoice) : '\u2014');
      var roleBadge = job.role ? '<span class="role-badge ' + roleClass(job.role) + '">' + esc(job.role) + '</span>' : '';
      var splitNote = (job.splitWith && job.splitWith.length > 0)
        ? '<div style="font-size:11px;color:#aaa;margin-top:2px">w/ ' + job.splitWith.map(function(s){ return esc(s.name || s) + (s.creditPct != null ? ' <span style="color:#ccc">(' + s.creditPct + '%)</span>' : ''); }).join(', ') + '</div>' : '';
      var jobTotal = job.jobTotal != null ? fmt(job.jobTotal) : fmt(job.credit);
      var shareHtml = job.creditPct != null && job.creditPct < 100
        ? fmt(job.credit) + '<span class="share-pct">(' + job.creditPct + '%)</span>'
        : fmt(job.credit != null ? job.credit : job.amount);
      return '<tr>' +
        '<td>' + fmtDate(job.date) + '</td>' +
        '<td>' + desc + roleBadge + splitNote + '</td>' +
        '<td>' + esc(job.customer || '\u2014') + '</td>' +
        '<td>' + jobTotal + '</td>' +
        '<td>' + shareHtml + '</td>' +
        '</tr>';
    }).join('');
    document.getElementById('modalBody').innerHTML = rows ||
      '<tr><td colspan="5" style="text-align:center;color:#aaa;padding:2rem">No jobs found</td></tr>';

    // Mobile: cards
    var cards = jobs.map(function(job) {
      var desc = job.description ? esc(job.description) : (job.invoice ? 'Invoice #' + esc(job.invoice) : '\u2014');
      var roleBadge = job.role ? '<span class="role-badge ' + roleClass(job.role) + '">' + esc(job.role) + '</span>' : '';
      var splitNote = (job.splitWith && job.splitWith.length > 0)
        ? ' <span style="font-size:11px;color:#bbb">w/ ' + job.splitWith.map(function(s){ return esc(s.name || s) + (s.creditPct != null ? ' (' + s.creditPct + '%)' : ''); }).join(', ') + '</span>' : '';
      var creditAmt = fmt(job.credit != null ? job.credit : job.amount);
      var pctHtml = job.creditPct != null && job.creditPct < 100
        ? '<span class="job-card-credit-pct">(' + job.creditPct + '%)</span>' : '';
      var totalLine = job.jobTotal != null && job.creditPct < 100
        ? '<div class="job-card-total">of ' + fmt(job.jobTotal) + '</div>' : '';
      return '<div class="job-card">' +
        '<div class="job-card-top">' +
          '<span class="job-card-date">' + fmtDate(job.date) + '</span>' +
          '<div class="job-card-right"><span class="job-card-credit">' + creditAmt + '</span>' + pctHtml + totalLine + '</div>' +
        '</div>' +
        '<div class="job-card-desc">' + desc + '</div>' +
        '<div class="job-card-meta">' + esc(job.customer || '\u2014') + roleBadge + splitNote + '</div>' +
        '</div>';
    }).join('');
    document.getElementById('modalCards').innerHTML = cards ||
      '<p style="text-align:center;color:#aaa;padding:2rem">No jobs found</p>';

    document.getElementById('modalJobCount').textContent = jobs.length + ' job' + (jobs.length !== 1 ? 's' : '');
    document.getElementById('modalTotal').textContent = fmt(tech.monthlyRevenue) + ' credited';
    document.getElementById('modalBackdrop').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    document.getElementById('modalBackdrop').classList.remove('open');
    document.body.style.overflow = '';
  }

  async function fetchData() {
    isFetching = true;
    document.getElementById('tableWrapper').classList.add('loading');
    try {
      var response = await fetch('/api/metrics?range=' + currentTimeRange);
      var data = await response.json();
      if (!response.ok || data.error) {
        document.getElementById('leaderboardBody').innerHTML =
          '<tr><td colspan="4"><div class="error-msg">Error: ' + esc(data.error || 'Unknown error') + '</div></td></tr>';
        document.getElementById('leaderboardFoot').innerHTML = '';
        return;
      }
      currentData = data;
      render();
    } catch (err) {
      document.getElementById('leaderboardBody').innerHTML =
        '<tr><td colspan="4"><div class="error-msg">Error loading data. Check API key and server logs.</div></td></tr>';
    } finally {
      isFetching = false;
      document.getElementById('tableWrapper').classList.remove('loading');
    }
  }

  function render() {
    if (!currentData) return;
    var leaderboard = currentData.leaderboard;
    var summary = currentData.summary;

    document.getElementById('period').textContent = summary.period;
    document.getElementById('stats').innerHTML =
      '<div class="stat-card"><div class="stat-label">Total Revenue</div><div class="stat-value">$' + summary.totalRevenue.toLocaleString() + '</div></div>' +
      '<div class="stat-card"><div class="stat-label">Avg Ticket</div><div class="stat-value">$' + summary.averageTicket.toLocaleString() + '</div></div>' +
      '<div class="stat-card"><div class="stat-label">Total Jobs</div><div class="stat-value">' + summary.totalJobs + '</div></div>';

    var sorted = leaderboard.slice();
    if (currentSort === 'revenue') sorted.sort(function(a, b) { return b.monthlyRevenue - a.monthlyRevenue; });
    else if (currentSort === 'ticket') sorted.sort(function(a, b) { return b.averageTicket - a.averageTicket; });
    else if (currentSort === 'jobs') sorted.sort(function(a, b) { return b.jobsCompleted - a.jobsCompleted; });

    var medals = ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49'];
    var rows = sorted.map(function(tech, idx) {
      var color = avatarColor(tech.name);
      var av = initials(tech.name);
      var rankHtml = medals[idx]
        ? '<span style="font-size:16px">' + medals[idx] + '</span>'
        : '<span class="rank-num">' + (idx + 1) + '</span>';
      var ticketClass = tech.averageTicket >= 1000 ? 'ticket-green'
        : tech.averageTicket >= 750 ? 'ticket-amber'
        : 'ticket-red';
      return '<tr data-idx="' + idx + '">' +
        '<td><div class="tech-cell">' +
          '<div class="avatar" style="background:' + color + '">' + av + '</div>' +
          rankHtml +
          '<span class="tech-name-label">' + esc(tech.name) + '</span>' +
        '</div></td>' +
        '<td>' + fmt(tech.monthlyRevenue) + '</td>' +
        '<td class="' + ticketClass + '">' + fmt(tech.averageTicket) + '</td>' +
        '<td>' + tech.jobsCompleted + '</td>' +
        '</tr>';
    }).join('');

    document.getElementById('leaderboardBody').innerHTML = rows ||
      '<tr><td colspan="4" style="text-align:center;color:#aaa;padding:2rem">No completed jobs in this period</td></tr>';

    // Attach click handlers to rows
    var sortedSnapshot = sorted;
    document.querySelectorAll('#leaderboardBody tr[data-idx]').forEach(function(row) {
      row.addEventListener('click', function() {
        openModal(sortedSnapshot[parseInt(this.dataset.idx)]);
      });
    });

    // Totals row
    var totalRev = sorted.reduce(function(s, t) { return s + t.monthlyRevenue; }, 0);
    var totalJbs = sorted.reduce(function(s, t) { return s + t.jobsCompleted; }, 0);
    var avgTkt = totalJbs > 0 ? Math.round(totalRev / totalJbs) : 0;
    document.getElementById('leaderboardFoot').innerHTML =
      '<tr>' +
        '<td>Totals &amp; Averages</td>' +
        '<td>' + fmt(totalRev) + '</td>' +
        '<td>' + fmt(avgTkt) + '</td>' +
        '<td>' + totalJbs + '</td>' +
      '</tr>';

    document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
  }

  fetchData();
  setInterval(fetchData, 5 * 60 * 1000);

  // ── Tab navigation with hash-based URLs ────────────────────────
  // URLs: /#technicians  /#marketing  /#owners
  var marketingLoaded = false;
  var ownersLoaded = false;

  var TAB_MAP = {
    'technicians': { view: 'techView' },
    'marketing':   { view: 'marketingView' },
    'owners':      { view: 'ownersView' }
  };
  var DEFAULT_TAB = 'technicians';

  function activateTab(tab) {
    if (!TAB_MAP[tab]) tab = DEFAULT_TAB;
    // Update buttons
    document.querySelectorAll('.tab-btn').forEach(function(b) {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    // Update panels
    document.querySelectorAll('.view-panel').forEach(function(p) { p.classList.remove('active'); });
    document.getElementById(TAB_MAP[tab].view).classList.add('active');
    // Lazy-load tab data
    if (tab === 'marketing' && !marketingLoaded) {
      marketingLoaded = true;
      fetchMarketing();
      fetchQBOMarketing();
    }
    if (tab === 'owners' && !ownersLoaded) {
      ownersLoaded = true;
      fetchOwnersData(false);
    }
  }

  // Tab button clicks — update hash (triggers hashchange)
  document.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      window.location.hash = this.dataset.tab;
    });
  });

  // Handle hash changes (back/forward, direct link, refresh)
  window.addEventListener('hashchange', function() {
    var tab = window.location.hash.replace('#', '') || DEFAULT_TAB;
    activateTab(tab);
  });

  // On first load, read hash from URL
  (function() {
    var tab = window.location.hash.replace('#', '') || DEFAULT_TAB;
    activateTab(tab);
  })();


  // ── Marketing ───────────────────────────────────────────────────
  var marketingData = null;
  var qboData = null; // null=not fetched, {connected:false}=unavailable, {connected:true,...}=ready

  async function fetchQBOMarketing() {
    try {
      var resp = await fetch('/api/qbo-marketing');
      qboData = await resp.json();
    } catch(e) {
      qboData = { connected: false, reason: 'error' };
    }
    if (marketingData) renderMarketing();
  }

  async function fetchMarketing() {
    document.getElementById('marketingContent').innerHTML =
      '<div style="text-align:center;padding:3rem;color:#aaa;font-size:14px">Loading marketing data\u2026</div>';
    try {
      var resp = await fetch('/api/marketing');
      var data = await resp.json();
      if (!resp.ok || data.error) {
        document.getElementById('marketingContent').innerHTML =
          '<div class="error-msg">Error: ' + esc(data.error || 'Unknown error') + '</div>';
        return;
      }
      marketingData = data;
      renderMarketing(); // initial render; will re-render once qboData arrives
    } catch(e) {
      document.getElementById('marketingContent').innerHTML =
        '<div class="error-msg">Error loading marketing data. Check server logs.</div>';
    }
  }

  function renderMarketing() {
    if (!marketingData) return;
    var proj = marketingData.projection;
    var history = marketingData.history;

    // QBO availability
    var qboReady = qboData && qboData.connected && qboData.monthlyMarketing;
    var mktSpend = qboReady ? qboData.monthlyMarketing : {};

    // Connect QBO banner (show while qboData is null = still loading, or when not connected)
    var qboBanner = '';
    if (!qboData) {
      qboBanner = '<div style="background:#f5f5f5;border-radius:8px;padding:11px 16px;margin-bottom:1rem;font-size:13px;color:#aaa">Loading QuickBooks data\u2026</div>';
    } else if (!qboData.connected) {
      var reason = qboData.reason === 'not_configured'
        ? 'Add QBO_CLIENT_ID, QBO_CLIENT_SECRET &amp; QBO_REALM_ID to Railway, then '
        : 'QuickBooks token expired or missing. ';
      qboBanner =
        '<div style="background:#fff8f0;border:1px solid #FFE0B2;border-radius:8px;padding:12px 16px;margin-bottom:1rem;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
          '<span style="font-size:13px;color:#888">' + reason + 'Connect QuickBooks to see marketing spend columns.</span>' +
          '<a href="/connect-quickbooks" style="background:#FF9500;color:white;padding:7px 16px;border-radius:6px;font-size:13px;font-weight:600;text-decoration:none;white-space:nowrap">Connect QuickBooks \u203a</a>' +
        '</div>';
    }

    // Projection cards
    var pct = proj.totalDays > 0 ? Math.min(Math.round(proj.jobsMtd / proj.projectedJobs * 100), 100) : 0;
    var projHTML =
      '<div class="proj-cards">' +
        '<div class="proj-card"><div class="proj-card-label">Jobs This Month</div><div class="proj-card-value">' + proj.jobsMtd + '</div><div class="proj-card-sub">' + proj.daysElapsed + ' of ' + proj.totalDays + ' days</div></div>' +
        '<div class="proj-card"><div class="proj-card-label">Projected Jobs</div><div class="proj-card-value">' + proj.projectedJobs + '</div><div class="proj-card-sub">by end of month</div></div>' +
        '<div class="proj-card"><div class="proj-card-label">Daily Rate</div><div class="proj-card-value">' + proj.dailyRate.toFixed(1) + '</div><div class="proj-card-sub">jobs / day</div></div>' +
        '<div class="proj-card"><div class="proj-card-label">Days Left</div><div class="proj-card-value">' + proj.daysLeft + '</div><div class="proj-card-sub">in the month</div></div>' +
      '</div>' +
      '<div class="progress-wrap">' +
        '<div class="progress-label-row"><span>Month Progress</span><span>' + pct + '%</span></div>' +
        '<div class="progress-bar-bg"><div class="progress-bar-fill" style="width:' + pct + '%"></div></div>' +
      '</div>';

    // Bar chart
    var BAR_MAX_PX = 100;
    var effectiveJobs = history.map(function(m) {
      return m.isCurrent ? (proj.projectedJobs || m.jobs) : m.jobs;
    });
    var maxJobs = Math.max.apply(null, effectiveJobs) || 1;
    var bars = history.map(function(m, idx) {
      var displayJobs = effectiveJobs[idx];
      var h = Math.max(3, Math.round(displayJobs / maxJobs * BAR_MAX_PX));
      var isCur = m.isCurrent ? ' is-current' : '';
      var barStyle = m.isCurrent
        ? 'height:' + h + 'px;opacity:0.6;background:repeating-linear-gradient(135deg,#FF6B35 0,#FF6B35 4px,#ffb07a 4px,#ffb07a 8px)'
        : 'height:' + h + 'px';
      var valHtml = m.isCurrent
        ? displayJobs + '<div style="font-size:7px;color:#FF9500;font-weight:700;line-height:1;margin-top:1px">PROJ</div>'
        : (m.jobs > 0 ? m.jobs : '');
      return '<div class="bar-col">' +
        '<div class="bar-val">' + valHtml + '</div>' +
        '<div class="bar' + isCur + '" style="' + barStyle + '"></div>' +
        '<div class="bar-lbl">' + esc(m.label) + '</div>' +
      '</div>';
    }).join('');

    var chartHTML =
      '<div class="section-title">Jobs Per Month</div>' +
      '<div class="bar-chart-card"><div class="bar-chart">' + bars + '</div></div>';

    // Monthly history table — with optional QBO spend columns
    var showQBO = qboReady;
    var qboHeaderCols = showQBO
      ? '<th>Mktg Spend</th><th>Cost / Job</th>'
      : '<th style="color:#ccc">Mktg Spend</th><th style="color:#ccc">Cost / Job</th>';

    var tableRows = history.slice().reverse().map(function(m, i, arr) {
      var prev = arr[i + 1];
      // Use projected jobs for current month so the number reflects end-of-month estimate
      var displayJobs = (m.isCurrent && proj.projectedJobs > 0) ? proj.projectedJobs : m.jobs;
      var deltaJobs = '';
      if (prev && prev.jobs > 0) {
        var diff = displayJobs - prev.jobs;
        var pctD = Math.round(diff / prev.jobs * 100);
        deltaJobs = diff > 0
          ? '<span class="delta delta-up">+' + pctD + '%</span>'
          : diff < 0
          ? '<span class="delta delta-down">' + pctD + '%</span>'
          : '';
      }
      var spend = mktSpend[m.monthKey || (m.year + '-' + String(m.month + 1).padStart(2, '0'))] || 0;
      var costPerJob = (displayJobs > 0 && spend > 0) ? Math.round(spend / displayJobs) : 0;
      var spendCell = showQBO
        ? (spend > 0 ? fmt(spend) : '<span style="color:#ccc">—</span>')
        : '<span style="color:#ddd">—</span>';
      var costCell = showQBO
        ? (costPerJob > 0 ? fmt(costPerJob) : '<span style="color:#ccc">—</span>')
        : '<span style="color:#ddd">—</span>';
      var rowClass = m.isCurrent ? ' class="mkt-row-current"' : '';
      var jobsLabel = m.isCurrent
        ? displayJobs + ' <span style="font-size:10px;color:#FF9500;font-weight:600">PROJ</span>'
        : displayJobs;
      return '<tr' + rowClass + '>' +
        '<td>' + esc(m.fullLabel) + '</td>' +
        '<td>' + jobsLabel + deltaJobs + '</td>' +
        '<td>' + fmt(m.revenue) + '</td>' +
        '<td>' + (m.jobs > 0 ? fmt(m.avgTicket) : '—') + '</td>' +
        '<td>' + spendCell + '</td>' +
        '<td>' + costCell + '</td>' +
        '</tr>';
    }).join('');

    var totalHistJobs = history.reduce(function(s,m){ return s + m.jobs; }, 0);
    var totalHistRev  = history.reduce(function(s,m){ return s + m.revenue; }, 0);
    var totalSpend    = Object.values(mktSpend).reduce(function(s,v){ return s + v; }, 0);
    var avgHistTicket = totalHistJobs > 0 ? Math.round(totalHistRev / totalHistJobs) : 0;
    var avgCostPerJob = totalHistJobs > 0 && totalSpend > 0 ? Math.round(totalSpend / totalHistJobs) : 0;

    var footSpend = showQBO ? (totalSpend > 0 ? fmt(totalSpend) : '—') : '—';
    var footCost  = showQBO ? (avgCostPerJob > 0 ? fmt(avgCostPerJob) : '—') : '—';

    var tableHTML =
      '<div class="section-title">Monthly History</div>' +
      '<div class="mkt-table-card"><table class="mkt-table">' +
        '<thead><tr><th>Month</th><th># Jobs</th><th>Revenue</th><th>Avg Ticket</th>' + qboHeaderCols + '</tr></thead>' +
        '<tbody>' + tableRows + '</tbody>' +
        '<tfoot><tr><td>12-Month Total</td><td>' + totalHistJobs + '</td><td>' + fmt(totalHistRev) + '</td><td>' + fmt(avgHistTicket) + '</td><td>' + footSpend + '</td><td>' + footCost + '</td></tr></tfoot>' +
      '</table></div>';

    document.getElementById('marketingContent').innerHTML = qboBanner + projHTML + chartHTML + tableHTML;
  }

  // ── Location Owners / Financial Tab ────────────────────────────
  var ownersData = null;
  var finMode = 'dollar'; // 'dollar' | 'pct'
  var waterfallChartInst = null;
  var donutChartInst = null;
  var trendChartInst = null;
  var trendVisibility = { gm: true, tl: false, parts: false, admin: false, om: true };

  function setFinMode(m) {
    finMode = m;
    document.getElementById('finModeDollar').classList.toggle('active', m === 'dollar');
    document.getElementById('finModePct').classList.toggle('active', m === 'pct');
    if (ownersData && ownersData.connected) renderOwners();
  }

  async function fetchOwnersData(force) {
    if (ownersData && !force) return;
    document.getElementById('finCards').innerHTML =
      '<div style="text-align:center;padding:3rem;color:#aaa;font-size:14px;grid-column:1/-1">Loading financial data\u2026</div>';
    try {
      var resp = await fetch('/api/owners-financial');
      ownersData = await resp.json();
    } catch(e) {
      ownersData = { connected: false, reason: 'error' };
    }
    renderOwners();
  }

  function acct(name) {
    // Get monthly values array for a named QBO account
    if (!ownersData || !ownersData.accounts) return [];
    var a = ownersData.accounts[name];
    if (!a) return ownersData.months.map(function() { return 0; });
    return ownersData.months.map(function(mk) { return a[mk] || 0; });
  }

  function acctTotal(name) {
    return acct(name).reduce(function(s,v){ return s+v; }, 0);
  }

  function last(arr) { return arr.length ? arr[arr.length - 1] : 0; }

  function fmtDollar(v) {
    var abs = Math.abs(Math.round(v));
    var s = abs >= 1000000
      ? '$' + (abs/1000000).toFixed(1) + 'M'
      : abs >= 1000
      ? '$' + Math.round(abs/1000) + 'K'
      : '$' + abs;
    return v < 0 ? '-' + s : s;
  }

  function fmtPct(v) { return (v >= 0 ? '' : '-') + Math.abs(v).toFixed(1) + '%'; }

  function colorClass(metric, val) {
    var t = {
      gm:    { g: 43, y: 38 },
      tl:    { g: 29, y: 33, inv: true },
      parts: { g: 27, y: 30, inv: true },
      admin: { g: 12, y: 15, inv: true },
      om:    { g: 10, y: 6 },
      mkt:   { g: 5,  y: 7,  inv: true },
      merch: { g: 2.5,y: 3.5,inv: true }
    }[metric];
    if (!t) return '';
    if (t.inv) {
      if (val <= t.g) return 'c-green';
      if (val <= t.y) return 'c-yellow';
      return 'c-red';
    } else {
      if (val >= t.g) return 'c-green';
      if (val >= t.y) return 'c-yellow';
      return 'c-red';
    }
  }

  function sparkSVG(values, color) {
    if (!values || values.length < 2) return '';
    var w = 80, h = 28;
    var mn = Math.min.apply(null, values), mx = Math.max.apply(null, values);
    var range = mx - mn || 1;
    var pts = values.map(function(v, i) {
      var x = Math.round(i / (values.length - 1) * w);
      var y = Math.round((1 - (v - mn) / range) * (h - 6) + 3);
      return x + ',' + y;
    }).join(' ');
    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" style="display:block">' +
      '<polyline points="' + pts + '" fill="none" stroke="' + (color||'#FF9500') + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>';
  }

  function renderOwners() {
    if (!ownersData || !ownersData.connected) {
      var reason = ownersData && ownersData.reason || 'unknown';
      var isNoCreds = reason === 'not_configured';
      var banner = '<div class="fin-connect-banner">' +
        '<p>' + (isNoCreds
          ? 'QuickBooks is not connected. Connect it to see financial data.'
          : 'QuickBooks is connected but data could not load. Reason: ' + esc(reason)) + '</p>' +
        (isNoCreds ? '<a href="/connect-quickbooks" style="background:#FF9500;color:white;padding:8px 20px;border-radius:6px;font-size:13px;font-weight:600;text-decoration:none">Connect QuickBooks ›</a>' : '') +
        '</div>';
      document.getElementById('finCards').innerHTML = banner;
      document.getElementById('finRow2').style.display = 'none';
      document.getElementById('finTrendCard').style.display = 'none';
      document.getElementById('finAlerts').style.display = 'none';
      document.getElementById('finFilterBar').style.display = 'none';
      return;
    }

    var months = ownersData.months || [];
    var last6 = months.slice(-6);

    // ── Key series ───────────────────────────────────────────────
    var revenue    = acct('Total for Income');
    var gp         = acct('Gross Profit');
    var techLabor  = acct('Total for Hourly Payroll Expense');
    var parts      = acct('Cost of Goods Sold - Job Supplies');
    var subs       = acct('Subcontractors');
    var adminPay   = acct('Total for Salaried & Admin Payroll Expense');
    var mktTotal   = acct('Total for Advertising & marketing');
    var officeExp  = acct('Total for Office expenses');
    var rentExp    = acct('Total for Rent');
    var vehicleExp = acct('Total for Vehicle Expenses');
    var noi        = acct('Net Operating Income');
    var netInc     = acct('Net Income');

    // ── Current month (last column) ─────────────────────────────
    var curRev   = last(revenue);
    var curGP    = last(gp);
    var curTL    = last(techLabor);
    var curParts = last(parts);
    var curNOI   = last(noi);
    var prevRev  = revenue.length > 1 ? revenue[revenue.length - 2] : 0;
    var prevGP   = gp.length > 1 ? gp[gp.length - 2] : 0;
    var prevNOI  = noi.length > 1 ? noi[noi.length - 2] : 0;

    var gmPct    = curRev > 0 ? curGP / curRev * 100 : 0;
    var tlPct    = curRev > 0 ? curTL / curRev * 100 : 0;
    var partsPct = curRev > 0 ? curParts / curRev * 100 : 0;
    var noiPct   = curRev > 0 ? curNOI / curRev * 100 : 0;
    var gmArr    = months.map(function(_, i) { return revenue[i] > 0 ? gp[i]/revenue[i]*100 : 0; });
    var tlArr    = months.map(function(_, i) { return revenue[i] > 0 ? techLabor[i]/revenue[i]*100 : 0; });
    var partsArr = months.map(function(_, i) { return revenue[i] > 0 ? parts[i]/revenue[i]*100 : 0; });
    var noiArr   = months.map(function(_, i) { return revenue[i] > 0 ? noi[i]/revenue[i]*100 : 0; });
    var adminArr = months.map(function(_, i) { return revenue[i] > 0 ? (adminPay[i]+officeExp[i])/revenue[i]*100 : 0; });

    var curMonth = months.length ? months[months.length - 1] : '';
    var prevMonth = months.length > 1 ? months[months.length - 2] : '';
    function fmtMk(mk) {
      if (!mk) return '';
      var parts2 = mk.split('-');
      var mn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(parts2[1])-1] || '';
      return mn + ' ' + parts2[0];
    }

    // ── Summary cards ────────────────────────────────────────────
    function revDelta(cur, prev) {
      if (!prev) return '';
      var d = cur - prev;
      var pct = Math.round(d / prev * 100);
      var cls = d >= 0 ? 'up' : 'down';
      var arrow = d >= 0 ? '▲' : '▼';
      return '<span class="fin-card-delta ' + cls + '">' + arrow + ' ' + fmtDollar(Math.abs(d)) + ' (' + Math.abs(pct) + '% MoM)</span>';
    }
    function pctDelta(arr) {
      if (arr.length < 2) return '';
      var d = (arr[arr.length-1] - arr[arr.length-2]).toFixed(1);
      var cls = parseFloat(d) <= 0 ? 'up' : 'down'; // for ratios, lower is generally better? depends on metric
      var arrow = parseFloat(d) >= 0 ? '▲' : '▼';
      return '<span class="fin-card-delta ' + (parseFloat(d) >= 0 ? 'up':'down') + '">' + arrow + ' ' + Math.abs(d) + 'pp MoM</span>';
    }

    var cards = [
      { label: 'Total Revenue', val: finMode==='pct' ? '100%' : fmtDollar(curRev), sub: 'Current month', cls: '', spark: revenue.slice(-6), delta: revDelta(curRev, prevRev), color: '#1a2d3a' },
      { label: 'Gross Profit', val: finMode==='pct' ? fmtPct(gmPct) : fmtDollar(curGP), sub: fmtPct(gmPct) + ' of Revenue', cls: colorClass('gm', gmPct), spark: finMode==='pct' ? gmArr.slice(-6) : gp.slice(-6), delta: revDelta(curGP, prevGP), color: '#12A071' },
      { label: 'Gross Margin %', val: fmtPct(gmPct), sub: 'Target ≥ 43%', cls: colorClass('gm', gmPct), spark: gmArr.slice(-6), delta: pctDelta(gmArr), color: '#12A071' },
      { label: 'Tech Labor %', val: fmtPct(tlPct), sub: 'Target ≤ 29%', cls: colorClass('tl', tlPct), spark: tlArr.slice(-6), delta: pctDelta(tlArr), color: '#FF9500' },
      { label: 'Parts % of Revenue', val: fmtPct(partsPct), sub: 'Target ≤ 27%', cls: colorClass('parts', partsPct), spark: partsArr.slice(-6), delta: pctDelta(partsArr), color: '#FF6B35' },
      { label: 'Net Operating Income', val: finMode==='pct' ? fmtPct(noiPct) : fmtDollar(curNOI), sub: fmtPct(noiPct) + ' of Revenue', cls: colorClass('om', noiPct), spark: finMode==='pct' ? noiArr.slice(-6) : noi.slice(-6), delta: revDelta(curNOI, prevNOI), color: '#4A90D9' }
    ];

    var cardsHtml = cards.map(function(c) {
      return '<div class="fin-card">' +
        '<div class="fin-card-label">' + esc(c.label) + '</div>' +
        '<div class="fin-card-value ' + c.cls + '">' + c.val + '</div>' +
        '<div class="fin-card-sub">' + c.sub + '</div>' +
        c.delta +
        '<div class="fin-card-spark">' + sparkSVG(c.spark, c.color) + '</div>' +
        '</div>';
    }).join('');
    document.getElementById('finCards').innerHTML = cardsHtml;

    // ── Show/hide structural elements ────────────────────────────
    document.getElementById('finFilterBar').style.display = '';
    document.getElementById('finRow2').style.display = '';
    document.getElementById('finTrendCard').style.display = '';
    document.getElementById('finAlerts').style.display = '';
    if (ownersData.fetchedAt) {
      document.getElementById('finUpdated').textContent =
        'Data as of ' + new Date(ownersData.fetchedAt).toLocaleString();
    }

    // ── Waterfall chart ──────────────────────────────────────────
    var wRevTotal  = acctTotal('Total for Income');
    var wParts     = acctTotal('Cost of Goods Sold - Job Supplies');
    var wTL        = acctTotal('Total for Hourly Payroll Expense');
    var wSubs      = acctTotal('Subcontractors');
    var wGP        = acctTotal('Gross Profit');
    var wAdmin     = acctTotal('Total for Salaried & Admin Payroll Expense');
    var wMkt       = acctTotal('Total for Advertising & marketing');
    var wOffice    = acctTotal('Total for Office expenses');
    var wRent      = acctTotal('Total for Rent');
    var wVehicle   = acctTotal('Total for Vehicle Expenses');
    var wNOI       = acctTotal('Net Operating Income');
    // Other opex = NOI + all accounted opex subtracted from GP (catch-all)
    var wOtherOpex = wGP - wAdmin - wMkt - wOffice - wRent - wVehicle - wNOI;

    // Build floating bars: [bottom, top] for each step
    var wfLabels = ['Revenue','Parts','Tech Labor','Subcontractors','Gross Profit','Admin Payroll','Marketing','Office','Rent','Vehicle','Other OpEx','Net Op. Income'];
    var running = 0;
    function subtractBar(val) {
      var top = running;
      running -= val;
      return [running, top];
    }
    function totalBar(val) { return [0, val]; }

    running = wRevTotal;
    var wfBars = [
      totalBar(wRevTotal),
      subtractBar(wParts),
      subtractBar(wTL),
      subtractBar(wSubs),
      totalBar(wGP),
      subtractBar(wAdmin),
      subtractBar(wMkt),
      subtractBar(wOffice),
      subtractBar(wRent),
      subtractBar(wVehicle),
      subtractBar(Math.max(wOtherOpex,0)),
      totalBar(wNOI)
    ];
    // Reset running after gross profit subtotal
    running = wGP;
    wfBars[5] = subtractBar(wAdmin);
    wfBars[6] = subtractBar(wMkt);
    wfBars[7] = subtractBar(wOffice);
    wfBars[8] = subtractBar(wRent);
    wfBars[9] = subtractBar(wVehicle);
    wfBars[10] = subtractBar(Math.max(wOtherOpex,0));
    wfBars[11] = totalBar(wNOI);

    var wfColors = ['#4A90D9','#E5484D','#E5484D','#E5484D','#12A071','#FF9500','#FF9500','#FF9500','#FF9500','#FF9500','#FF9500', wNOI >= 0 ? '#12A071' : '#E5484D'];

    if (waterfallChartInst) waterfallChartInst.destroy();
    var wfCtx = document.getElementById('waterfallChart').getContext('2d');
    waterfallChartInst = new Chart(wfCtx, {
      type: 'bar',
      data: {
        labels: wfLabels,
        datasets: [{
          data: wfBars,
          backgroundColor: wfColors,
          borderRadius: 3,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false },
          tooltip: { callbacks: {
            label: function(ctx) {
              var v = ctx.raw;
              var amt = Array.isArray(v) ? (v[1] - v[0]) : v;
              var pct = wRevTotal > 0 ? (Math.abs(amt)/wRevTotal*100).toFixed(1) + '%' : '';
              return fmtDollar(amt) + (pct ? '  (' + pct + ' of Rev)' : '');
            }
          }}
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          y: { ticks: { callback: function(v) { return fmtDollar(v); }, font: { size: 10 } }, grid: { color: '#f0f0f0' } }
        }
      }
    });

    // ── Expense donut ────────────────────────────────────────────
    var dAdmin   = acctTotal('Total for Salaried & Admin Payroll Expense');
    var dMkt     = acctTotal('Total for Advertising & marketing');
    var dOffice  = acctTotal('Total for Office expenses');
    var dRent    = acctTotal('Total for Rent');
    var dVehicle = acctTotal('Total for Vehicle Expenses');
    var dMerch   = acctTotal('Other Merchant Account Fees') || acctTotal('Total for Merchant account fees');
    var dInsure  = acctTotal('Insurance');
    var dTools   = acctTotal('Small Tools & Equipment') + acctTotal('Uniforms');
    var dAccounted = dAdmin + dMkt + dOffice + dRent + dVehicle + dMerch + dInsure + dTools;
    var dTotalOpex = acctTotal('Total for Expenses') || (acctTotal('Gross Profit') - acctTotal('Net Operating Income'));
    var dOther   = Math.max(dTotalOpex - dAccounted, 0);
    var dTotal   = dAdmin + dMkt + dOffice + dRent + dVehicle + dMerch + dInsure + dTools + dOther;

    document.getElementById('donutSubtitle').textContent = fmtDollar(dTotal) + ' TTM';

    if (donutChartInst) donutChartInst.destroy();
    var dCtx = document.getElementById('donutChart').getContext('2d');
    donutChartInst = new Chart(dCtx, {
      type: 'doughnut',
      data: {
        labels: ['Admin Payroll','Marketing','Office & Software','Rent & Facilities','Vehicle & Fleet','Merchant Fees','Insurance','Tools & Uniforms','All Other'],
        datasets: [{
          data: [dAdmin,dMkt,dOffice,dRent,dVehicle,dMerch,dInsure,dTools,dOther],
          backgroundColor: ['#64748b','#14b8a6','#3b82f6','#f59e0b','#FF9500','#8b5cf6','#6366f1','#22c55e','#9ca3af'],
          borderWidth: 2, borderColor: '#fff', hoverOffset: 6
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 10, boxWidth: 12 } },
          tooltip: { callbacks: {
            label: function(ctx) {
              var v = ctx.parsed;
              var pct = dTotal > 0 ? (v/dTotal*100).toFixed(1) + '%' : '';
              return ctx.label + ': ' + fmtDollar(v) + (pct ? ' (' + pct + ')' : '');
            }
          }}
        }
      }
    });

    // ── Trend lines ──────────────────────────────────────────────
    var TREND_SERIES = [
      { key: 'gm',    label: 'Gross Margin %',    color: '#12A071', data: gmArr,    targetLo: 42, targetHi: 46 },
      { key: 'tl',    label: 'Tech Labor %',       color: '#FF9500', data: tlArr,    targetLo: 26, targetHi: 30 },
      { key: 'parts', label: 'Parts %',            color: '#FF6B35', data: partsArr, targetLo: 24, targetHi: 28 },
      { key: 'admin', label: 'Admin & Office %',   color: '#8b5cf6', data: adminArr, targetLo: 10, targetHi: 14 },
      { key: 'om',    label: 'Operating Margin %', color: '#4A90D9', data: noiArr,   targetLo: 6,  targetHi: 10 }
    ];

    // Build trend toggle buttons
    var togHtml = TREND_SERIES.map(function(s) {
      var on = trendVisibility[s.key] ? ' on' : '';
      return '<button class="fin-trend-btn' + on + '" data-key="' + s.key + '" style="color:' + s.color + '" onclick="toggleTrendLine(this)">' + esc(s.label) + '</button>';
    }).join('');
    document.getElementById('trendToggles').innerHTML = togHtml;

    if (trendChartInst) trendChartInst.destroy();
    var tCtx = document.getElementById('trendChart').getContext('2d');
    var mLabels = months.map(function(mk) {
      var p = mk.split('-'); return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(p[1])-1] + ' ' + p[0].slice(2);
    });
    var tDatasets = TREND_SERIES.map(function(s) {
      return {
        label: s.label, data: s.data, borderColor: s.color,
        backgroundColor: s.color + '18',
        borderWidth: 2, pointRadius: 3, pointHoverRadius: 5,
        tension: 0.3, hidden: !trendVisibility[s.key],
        fill: false
      };
    });
    trendChartInst = new Chart(tCtx, {
      type: 'line',
      data: { labels: mLabels, datasets: tDatasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: {
            label: function(ctx) { return ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(1) + '%'; }
          }}
        },
        scales: {
          x: { grid: { color: '#f5f5f5' }, ticks: { font: { size: 10 } } },
          y: { ticks: { callback: function(v) { return v.toFixed(0) + '%'; }, font: { size: 10 } }, grid: { color: '#f0f0f0' } }
        }
      }
    });

    // ── Alerts ───────────────────────────────────────────────────
    var alerts = [];
    months.forEach(function(mk, i) {
      var rev = revenue[i];
      if (!rev) return;
      var label = mLabels[i];
      var gm = rev > 0 ? gp[i]/rev*100 : 0;
      var tl = rev > 0 ? techLabor[i]/rev*100 : 0;
      var pt = rev > 0 ? parts[i]/rev*100 : 0;
      var no = rev > 0 ? noi[i]/rev*100 : 0;
      var adm = rev > 0 ? (adminPay[i]+officeExp[i])/rev*100 : 0;
      if (gm < 38) alerts.push({ sev:'red', msg:'Gross margin dropped to ' + gm.toFixed(1) + '% in ' + label + '. Check parts costs and tech labor.', range: label });
      if (tl > 33) alerts.push({ sev:'red', msg:'Tech labor hit ' + tl.toFixed(1) + '% of revenue in ' + label + '. Review overtime and crew sizing.', range: label });
      if (pt > 30) alerts.push({ sev:'yellow', msg:'Parts cost reached ' + pt.toFixed(1) + '% in ' + label + '. Review supplier pricing or job estimates.', range: label });
      if (adm > 15) alerts.push({ sev:'yellow', msg:'Admin overhead at ' + adm.toFixed(1) + '% in ' + label + '. Review software subscriptions and staffing.', range: label });
      if (no < 3 && no > -50) alerts.push({ sev:'red', msg:'Operating margin is ' + no.toFixed(1) + '% in ' + label + '. This location is near breakeven.', range: label });
    });
    // Consecutive revenue decline
    var declineCount = 0;
    for (var di = revenue.length - 1; di > 0; di--) {
      if (revenue[di] < revenue[di-1]) declineCount++;
      else break;
    }
    if (declineCount >= 2) alerts.push({ sev:'red', msg:'Revenue has declined for ' + declineCount + ' consecutive months. Review lead flow and booking.', range: 'Last ' + declineCount + ' months' });

    var alertsHtml = alerts.length
      ? alerts.map(function(a) {
          return '<div class="fin-alert ' + a.sev + '">' +
            '<div class="fin-alert-dot"></div>' +
            '<div class="fin-alert-body">' +
            '<div class="fin-alert-msg">' + esc(a.msg) + '</div>' +
            '<div class="fin-alert-range">' + esc(a.range) + '</div>' +
            '</div></div>';
        }).join('')
      : '<div class="fin-no-alerts">&#10003; No alerts — all key metrics are within target ranges.</div>';
    document.getElementById('finAlertsList').innerHTML = alertsHtml;
  }

  function toggleTrendLine(btn) {
    var key = btn.dataset.key;
    trendVisibility[key] = !trendVisibility[key];
    btn.classList.toggle('on', trendVisibility[key]);
    if (trendChartInst) {
      var idx = ['gm','tl','parts','admin','om'].indexOf(key);
      if (idx >= 0) {
        trendChartInst.data.datasets[idx].hidden = !trendVisibility[key];
        trendChartInst.update();
      }
    }
  }
</script>
</body>
</html>`;
  res.send(html);
});

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

    const headers = {
      'Authorization': 'Token ' + API_KEY,
      'Accept': 'application/json'
    };

    console.log('Fetching jobs from: ' + BASE_URL + '/jobs');
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
    console.log('Got ' + allJobs.length + ' jobs');

    // Fetch original estimates to identify who sold each job (the seller gets 1/3 credit)
    const estimateIds = [...new Set(
      allJobs
        .map(j => j.original_estimate_id || (j.original_estimate_uuids && j.original_estimate_uuids[0]))
        .filter(Boolean)
    )];
    const estimateSellerMap = {};
    if (estimateIds.length > 0) {
      console.log('Fetching ' + estimateIds.length + ' estimates for seller attribution');
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
    console.error('Full error:', {
      status: error.response?.status,
      message: error.message,
      data: error.response?.data
    });
    res.status(500).json({ error: error.message, details: error.response?.data });
  }
});

app.get('/api/marketing', async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }
  try {
    const headers = {
      'Authorization': 'Token ' + API_KEY,
      'Accept': 'application/json'
    };

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

    // Projection for current month
    const cur = history[history.length - 1];
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysElapsed = now.getDate();
    const daysLeft = daysInMonth - daysElapsed;
    const dailyRate = daysElapsed > 0 ? cur.jobs / daysElapsed : 0;
    const projectedJobs = daysElapsed > 0 ? Math.round(dailyRate * daysInMonth) : 0;

    res.json({
      history,
      projection: {
        jobsMtd: cur.jobs,
        projectedJobs,
        dailyRate,
        daysElapsed,
        daysLeft,
        totalDays: daysInMonth
      }
    });
  } catch (error) {
    console.error('Marketing API error:', error.message);
    res.status(500).json({ error: error.message, details: error.response?.data });
  }
});

// ── QuickBooks OAuth ─────────────────────────────────────────────────────────
// Safe debug — shows credential shape without exposing full values
app.get('/qbo-debug', (req, res) => {
  res.json({
    client_id_length:     QBO_CLIENT_ID     ? QBO_CLIENT_ID.length     : 0,
    client_id_first4:     QBO_CLIENT_ID     ? QBO_CLIENT_ID.slice(0,4) : null,
    client_id_last4:      QBO_CLIENT_ID     ? QBO_CLIENT_ID.slice(-4)  : null,
    secret_length:        QBO_CLIENT_SECRET ? QBO_CLIENT_SECRET.length  : 0,
    secret_first4:        QBO_CLIENT_SECRET ? QBO_CLIENT_SECRET.slice(0,4) : null,
    redirect_uri:         QBO_REDIRECT_URI,
    realm_id_in_memory:   !!qboTokens.realmId,
    refresh_token_in_memory: !!qboTokens.refreshToken
  });
});

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
    console.log('[QBO] Connected! Realm ID: ' + qboTokens.realmId);
    console.log('[QBO] Refresh Token: ' + qboTokens.refreshToken);
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
    console.error('[QBO] OAuth callback error - status:', err.response?.status);
    console.error('[QBO] OAuth callback error - body:', JSON.stringify(detail));
    console.error('[QBO] redirect_uri used:', QBO_REDIRECT_URI);
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

    const monthlyMarketing = extractMarketingSpend(pnlRes.data);
    res.json({ connected: true, monthlyMarketing });
  } catch (err) {
    console.error('[QBO] P&L error:', err.response?.data || err.message);
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
app.get('/api/owners-financial', async (req, res) => {
  if (!qboReady()) {
    return res.json({ connected: false, reason: qboConfigured() ? 'not_connected' : 'not_configured' });
  }
  try {
    const token = await getQBOAccessToken();
    if (!token) return res.json({ connected: false, reason: 'no_token' });

    const now = new Date();
    const endDate   = now.toISOString().slice(0, 10);
    const startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().slice(0, 10);

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
    res.json({ connected: true, ...parsed, fetchedAt: new Date().toISOString() });
  } catch (err) {
    console.error('[QBO] owners-financial error:', err.response?.data || err.message);
    if (err.response?.status === 401) {
      qboTokens.accessToken = null;
      return res.json({ connected: false, reason: 'token_expired' });
    }
    res.status(500).json({ connected: false, reason: 'error', error: err.message });
  }
});
// ────────────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log('Dashboard running on port ' + PORT);
  console.log('API Key configured: ' + (!!API_KEY));
  console.log('QBO configured: ' + qboConfigured() + (qboReady() ? ' (ready)' : ' (visit /connect-quickbooks to connect)'));
});
