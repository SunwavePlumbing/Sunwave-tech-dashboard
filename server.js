const express = require('express');
const axios = require('axios');
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

// Pull monthly marketing spend from a parsed report — sums every account whose
// name contains "advertising" or "marketing" (case-insensitive). Returns { 'YYYY-MM': $ }
function marketingSpendByMonth(parsed) {
  const spend = {};
  (parsed.months || []).forEach(mk => { spend[mk] = 0; });
  Object.entries(parsed.accounts || {}).forEach(([name, byMonth]) => {
    const n = name.toLowerCase();
    if (!n.startsWith('total for ')) return; // use rollup lines only, avoid double counting
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
    .main-wrapper.no-sidebar { grid-template-columns: 1fr; }
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

    /* Filter bar — mobile first: stacked, full-width selects */
    .fin-filter-bar { display:flex;flex-direction:column;align-items:stretch;gap:10px;margin-bottom:1.2rem;background:white;padding:12px 14px;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.07); }
    .fin-filter-field { display:flex;flex-direction:column;gap:4px; }
    .fin-filter-label { font-size:11px;color:#aaa;text-transform:uppercase;font-weight:600;letter-spacing:0.4px; }
    .fin-select { width:100%;padding:10px 12px;font-size:15px;min-height:44px;border:1px solid #e5e5e5;border-radius:8px;background:white;color:#333;cursor:pointer; }
    .fin-toggle { display:inline-flex;border:1px solid #e5e5e5;border-radius:6px;overflow:hidden;align-self:flex-start; }
    .fin-toggle button { padding:8px 14px;min-height:36px;font-size:12px;font-weight:600;border:none;background:white;color:#888;cursor:pointer;transition:all 0.15s; }
    .fin-toggle button.active { background:#1a2d3a;color:white; }
    .fin-refresh-btn { align-self:flex-end;padding:10px 16px;min-height:40px;font-size:14px;font-weight:600;border:1px solid #e0e0e0;border-radius:8px;background:white;color:#555;cursor:pointer;transition:background 0.15s; }
    .fin-refresh-btn:hover { background:#f5f5f5; }
    .fin-updated { font-size:11px;color:#bbb; }
    @media (min-width: 700px) {
      .fin-filter-bar { flex-direction:row;align-items:flex-end;flex-wrap:wrap; }
      .fin-filter-field { flex:0 1 auto;min-width:160px; }
      .fin-select { width:auto;min-width:160px;padding:8px 10px;font-size:13px; }
      .fin-refresh-btn { margin-left:auto;align-self:flex-end; }
    }

    /* P&L card head — title + $/% toggle */
    .fin-pnl-head { display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap; }
    .fin-pnl-scroll { overflow-x:auto;-webkit-overflow-scrolling:touch; }
    /* Sticky first column on P&L so names stay visible while scrolling months */
    .pnl-grid th:first-child, .pnl-grid td:first-child { position:sticky;left:0;background:#fff;z-index:2; }
    .pnl-grid tr.subtotal td:first-child { background:#fafafa; }
    .pnl-grid tr.total td:first-child { background:#1a2d3a;color:#fff; }

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
    .fin-card-hint { font-size:11px;color:#9aa4ad;margin-top:8px;line-height:1.35;font-style:italic;border-top:1px dashed #eee;padding-top:6px; }
    .fin-flow { background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:14px 18px;margin-bottom:1.2rem;font-size:13px;color:#555;line-height:1.5; }
    .fin-flow strong { color:#1a2d3a; }
    .fin-flow .eq { color:#aaa;margin:0 6px; }
    .fin-row-title { font-size:11px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:1.2px;margin:0.6rem 0 0.5rem 2px; }
    .fin-card-delta { font-size:12px;font-weight:600; }
    .fin-card-delta.up { color:#12A071; }
    .fin-card-delta.down { color:#E5484D; }
    .fin-card-spark { position:absolute;bottom:0;right:0;opacity:0.6; }

    /* Formula card — the centerpiece */
    .fin-flow-card { background:white;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:18px 18px 14px;margin-bottom:1.2rem; }
    .fin-flow-card-head { display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:14px;padding:0 2px; }
    .fin-flow-card-title { font-size:12px;font-weight:700;color:#1a2d3a;text-transform:uppercase;letter-spacing:1.4px; }
    .fin-flow-card-stamp { font-size:11px;color:#bbb; }
    .fin-flow-stops { display:flex;flex-direction:column;gap:0; }
    .fin-flow-stop { position:relative;padding:14px 14px 14px 18px;border-left:5px solid #1a2d3a;background:#fafafa;border-radius:8px;display:flex;flex-direction:column; }
    .fin-flow-stop.rev { border-left-color:#1a2d3a; }
    .fin-flow-stop.gp  { border-left-color:#12A071; }
    .fin-flow-stop.noi { border-left-color:#3b82f6; }
    .fin-stop-title { font-size:13px;font-weight:700;color:#1a2d3a;text-transform:uppercase;letter-spacing:0.6px;line-height:1.2; }
    .fin-stop-desc  { font-size:12px;color:#777;font-weight:500;margin-top:2px;line-height:1.3; }
    .fin-stop-value { font-size:34px;font-weight:700;color:#1a2d3a;line-height:1.05;margin:10px 0 2px;font-variant-numeric:tabular-nums;letter-spacing:-0.5px; }
    .fin-stop-sub { font-size:12px;color:#888;margin-bottom:4px; }
    .fin-stop-delta { font-size:12px;font-weight:600;margin-top:auto;padding-top:4px; }
    .fin-stop-delta.up { color:#12A071; }
    .fin-stop-delta.down { color:#E5484D; }
    .fin-stop-delta .cmp-lbl { font-weight:400;color:#aaa;margin-left:4px; }

    /* Arrow connector — vertical on phone, horizontal on desktop */
    .fin-flow-arrow { display:flex;align-items:center;gap:10px;padding:10px 22px;font-size:12px;color:#888;line-height:1.3; }
    .fin-flow-arrow-icon { font-size:20px;color:#c8cbd0;flex-shrink:0;font-weight:700; }
    .fin-flow-arrow-label { flex:1; }
    .fin-flow-arrow-op { color:#c8cbd0;font-weight:700;margin-right:4px; }

    @media (min-width: 900px) {
      .fin-flow-card { padding:22px 20px 18px; }
      .fin-flow-stops { flex-direction:row;align-items:stretch;gap:0; }
      .fin-flow-stop { flex:1 1 0;min-width:0;padding:16px 18px; }
      .fin-flow-arrow {
        flex:0 0 auto;flex-direction:column;padding:0 14px;text-align:center;
        justify-content:flex-start;align-items:center;
        padding-top:52px; /* align with the big value row in each stop */
      }
      .fin-flow-arrow-icon { font-size:26px;margin-bottom:4px;transform:rotate(-90deg); }
      .fin-flow-arrow-label { font-size:11px;max-width:130px;color:#999;line-height:1.35; }
      .fin-stop-value { font-size:36px; }
    }
    @media (min-width: 1200px) {
      .fin-flow-arrow-label { max-width:160px; }
      .fin-stop-value { font-size:40px; }
    }

    /* Efficiency tiles */
    .fin-pct-tiles { display:grid;grid-template-columns:1fr;gap:10px;margin-bottom:1.4rem; }
    @media (min-width: 700px) { .fin-pct-tiles { grid-template-columns:repeat(3,1fr); } }
    .fin-pct-tile { background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:14px 16px; }
    .fin-pct-tile-label { font-size:11px;color:#888;text-transform:uppercase;font-weight:600;letter-spacing:0.4px;margin-bottom:4px; }
    .fin-pct-tile-value { font-size:28px;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums; }
    .fin-pct-tile-value.c-green { color:#12A071; }
    .fin-pct-tile-value.c-yellow { color:#C9820A; }
    .fin-pct-tile-value.c-red { color:#E5484D; }
    .fin-pct-tile-sub { font-size:12px;color:#888;margin-top:2px; }
    .fin-pct-tile-delta { font-size:12px;font-weight:600;margin-top:4px; }
    .fin-pct-tile-hint { font-size:11px;color:#9aa4ad;margin-top:8px;line-height:1.35;font-style:italic;border-top:1px dashed #eee;padding-top:6px; }

    .fin-row2 { display:grid;grid-template-columns:3fr 2fr;gap:14px;margin-bottom:1.4rem; }
    @media(max-width:768px) { .fin-row2 { grid-template-columns:1fr; } }
    .fin-chart-card { background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.08);padding:18px; }
    .fin-chart-title { font-size:13px;font-weight:700;color:#1a2d3a;margin-bottom:14px;letter-spacing:0.1px; }
    .fin-chart-title span { font-size:11px;font-weight:400;color:#aaa;margin-left:6px; }
    .fin-chart-wrap { position:relative; }

    .fin-trend-toggles { display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px; }
    .fin-trend-btn { padding:4px 12px;font-size:11px;font-weight:600;border:1px solid #e0e0e0;border-radius:20px;background:white;color:#888;cursor:pointer;transition:all 0.15s; }
    .fin-trend-btn.on { border-color:currentColor;background:currentColor;color:white!important; }

    /* Monthly P&L grid */
    .pnl-grid { width:100%;border-collapse:collapse;font-size:12px; }
    .pnl-grid th { text-align:right;padding:6px 8px;font-weight:600;color:#888;font-size:10px;text-transform:uppercase;letter-spacing:0.3px;border-bottom:1px solid #eee;white-space:nowrap; }
    .pnl-grid th:first-child { text-align:left; }
    .pnl-grid td { padding:10px 10px;text-align:right;color:#333;border-bottom:1px solid #f5f5f5;white-space:nowrap; font-variant-numeric:tabular-nums; }
    @media (min-width:700px) { .pnl-grid td { padding:7px 8px; } }
    .pnl-grid td:first-child { text-align:left;font-weight:500; }
    .pnl-grid tr.subtotal td { font-weight:700;background:#fafafa;color:#1a2d3a;border-top:1px solid #ddd; }
    .pnl-grid tr.total td { font-weight:700;background:#1a2d3a;color:#fff;border-top:2px solid #1a2d3a; }
    .pnl-grid tr.indent td:first-child { padding-left:22px;color:#666;font-weight:400; }
    .pnl-grid td.spark-cell { text-align:center;padding:4px 6px; }
    .pnl-grid td.neg { color:#E5484D; }
    .pnl-grid td.highlight { background:#fff8ec; }

    /* Card compare line */
    .fin-compare-line { font-size:11px;color:#aaa;margin-top:4px; }

    /* Breakeven widget */
    .be-bar { height:24px;border-radius:12px;background:#f0f0f0;overflow:hidden;position:relative;margin:14px 0 10px; }
    .be-bar-fill { height:100%;background:linear-gradient(90deg,#12A071,#0a8a5e);transition:width 0.3s; }
    .be-bar-target { position:absolute;top:-4px;bottom:-4px;width:2px;background:#1a2d3a; }
    .be-bar-target:after { content:attr(data-lbl);position:absolute;top:-16px;left:-20px;font-size:10px;color:#888;white-space:nowrap; }
    .be-stats { display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:11px;margin-top:14px; }
    .be-stat-label { color:#999;text-transform:uppercase;font-size:10px;font-weight:600;letter-spacing:0.3px; }
    .be-stat-value { font-weight:700;font-size:14px;color:#1a2d3a;margin-top:2px; }
    .be-headline { font-size:18px;font-weight:700;margin-bottom:4px; }
    .be-headline.ok { color:#12A071; }
    .be-headline.bad { color:#E5484D; }

    /* Variance table */
    .var-table { width:100%;border-collapse:collapse;font-size:12px; }
    .var-table th { text-align:right;padding:6px 8px;font-weight:600;color:#888;font-size:10px;text-transform:uppercase;letter-spacing:0.3px;border-bottom:1px solid #eee; }
    .var-table th:first-child { text-align:left; }
    .var-table td { padding:7px 8px;text-align:right;color:#333;border-bottom:1px solid #f5f5f5;font-variant-numeric:tabular-nums; }
    .var-table td:first-child { text-align:left;font-weight:500; }
    .var-table tr.subtotal td { font-weight:700;background:#fafafa;color:#1a2d3a; }
    .var-table td.pos { color:#12A071;font-weight:600; }
    .var-table td.neg { color:#E5484D;font-weight:600; }
    .var-table tr.noi td { font-size:15px;font-weight:800;background:#f5faff;color:#1a2d3a;border-top:2px solid #1a2d3a;padding:12px 8px; }
    .var-table tr.noi td.pos { color:#12A071; }
    .var-table tr.noi td.neg { color:#E5484D; }

    /* Mobile variance flow */
    .var-flow { display:flex;flex-direction:column;gap:0; }
    .var-flow-row { display:flex;justify-content:space-between;align-items:baseline;padding:8px 4px;border-bottom:1px solid #f5f5f5;font-size:13px; }
    .var-flow-row.indent { padding-left:22px;color:#666; }
    .var-flow-row.sub { font-weight:700;color:#1a2d3a;background:#fafafa; }
    .var-flow-row.noi { display:block;background:#f5faff;border-top:2px solid #1a2d3a;border-bottom:2px solid #1a2d3a;padding:14px 12px;margin-top:6px; }
    .var-flow-row.noi .var-noi-lbl { font-size:11px;color:#888;text-transform:uppercase;font-weight:700;letter-spacing:0.8px;margin-bottom:4px; }
    .var-flow-row.noi .var-noi-val { font-size:26px;font-weight:800;color:#1a2d3a;line-height:1.1;font-variant-numeric:tabular-nums; }
    .var-flow-row.noi .var-noi-vs { font-size:12px;color:#888;margin-top:2px; }
    .var-flow-row.noi .var-noi-change { font-size:15px;font-weight:700;margin-top:6px; }
    .var-flow-row.noi .var-noi-change.pos { color:#12A071; }
    .var-flow-row.noi .var-noi-change.neg { color:#E5484D; }
    .var-chg { font-weight:600;margin-left:10px; }
    .var-chg.pos { color:#12A071; }
    .var-chg.neg { color:#E5484D; }
    @media (max-width:768px) { .var-table-wrap { display:none; } }
    @media (min-width:769px) { .var-flow { display:none; } }

    /* Cash cards */
    .cash-row { display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px; }
    .cash-cell { background:#fafafa;border-radius:8px;padding:12px 14px; }
    .cash-cell-lbl { font-size:10px;color:#999;text-transform:uppercase;font-weight:600;letter-spacing:0.3px;margin-bottom:4px; }
    .cash-cell-val { font-size:20px;font-weight:700;color:#1a2d3a; }
    .cash-cell-sub { font-size:11px;color:#888;margin-top:2px; }
    .cash-cell.ratio .cash-cell-val.ok { color:#12A071; }
    .cash-cell.ratio .cash-cell-val.warn { color:#C9820A; }
    .cash-cell.ratio .cash-cell-val.bad { color:#E5484D; }
    .cash-cell.total { grid-column:1/-1;background:#fff5ed;border:1px solid #ffe0c2; }
    .cash-cell.total .cash-cell-val { color:#E5484D;font-size:22px; }

    /* Cash/balance flow — reads like a mini subtraction table */
    .cash-flow { display:flex;flex-direction:column;gap:0; }
    .cash-flow-section { margin-bottom:14px; }
    .cash-flow-head { font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;padding:0 2px; }
    .cash-flow-row { display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:7px 4px;font-size:13px;color:#333;border-bottom:1px solid #f5f5f5; }
    .cash-flow-row:last-child { border-bottom:none; }
    .cash-flow-row .lbl { display:flex;flex-direction:column;line-height:1.25; }
    .cash-flow-row .lbl-sub { font-size:11px;color:#9aa4ad;font-weight:400;margin-top:1px; }
    .cash-flow-row .val { font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;color:#1a2d3a; }
    .cash-flow-row .op { display:inline-block;width:14px;color:#bbb;font-weight:700; }
    .cash-flow-row.subtotal { border-top:1px solid #ddd;background:#fafafa;font-weight:700;padding:9px 4px; }
    .cash-flow-row.subtotal .val { color:#1a2d3a; }
    .cash-flow-row.total { border-top:2px solid #1a2d3a;background:#fff5ed;padding:11px 6px;margin-top:4px;border-radius:6px; }
    .cash-flow-row.total .val { font-size:18px;color:#E5484D; }
    .cash-flow-row.total .lbl { font-weight:700;color:#1a2d3a; }
    .cash-cushion { margin-top:12px;padding:12px 14px;background:#f3f8fb;border-radius:8px;display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap; }
    .cash-cushion .lbl { display:flex;flex-direction:column; }
    .cash-cushion .lbl-top { font-size:12px;font-weight:700;color:#1a2d3a; }
    .cash-cushion .lbl-sub { font-size:11px;color:#888;margin-top:2px; }
    .cash-cushion .val { font-size:20px;font-weight:700;font-variant-numeric:tabular-nums; }
    .cash-cushion .val.ok { color:#12A071; }
    .cash-cushion .val.warn { color:#C9820A; }
    .cash-cushion .val.bad { color:#E5484D; }

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
  </div>
</div>

<div class="main-wrapper" id="mainWrapper">
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
      <div class="fin-filter-bar" id="finFilterBar">
        <label class="fin-filter-field">
          <span class="fin-filter-label">Month</span>
          <select id="finMonthSel" class="fin-select" onchange="setFinMonth(this.value)"></select>
        </label>
        <label class="fin-filter-field">
          <span class="fin-filter-label">Compare to</span>
          <select id="finCompareSel" class="fin-select" onchange="setFinCompare(this.value)">
            <option value="prior_year_month" selected>Same month last year</option>
            <option value="prior_month">Prior month</option>
            <option value="prior_year_avg">Prior year avg</option>
            <option value="none">No comparison</option>
          </select>
        </label>
        <button class="fin-refresh-btn" onclick="fetchOwnersData(true)" aria-label="Refresh">&#8635;</button>
      </div>

      <!-- Formula card — the centerpiece -->
      <div id="finCards">
        <div style="text-align:center;padding:3rem;color:#aaa;font-size:14px">Loading financial data\u2026</div>
      </div>

      <!-- Efficiency tiles -->
      <div class="fin-row-title" id="finCardsTitle2" style="display:none">Where the money goes &mdash; as a share of revenue</div>
      <div class="fin-pct-tiles" id="finCards2"></div>

      <!-- Row 2: Where the money went + what's on hand -->
      <div class="fin-row2" id="finRow2" style="display:none">
        <div class="fin-chart-card">
          <div class="fin-chart-title">Where Every Dollar Went <span id="donutSubtitle"></span></div>
          <div style="font-size:11px;color:#888;margin-top:-8px;margin-bottom:10px">Hover a slice to see the category and dollar amount.</div>
          <div class="fin-chart-wrap" style="height:260px"><canvas id="donutChart"></canvas></div>
        </div>
        <div class="fin-chart-card">
          <div class="fin-chart-title">What We Have and What We Owe <span id="cashSubtitle"></span></div>
          <div style="font-size:11px;color:#888;margin-top:-8px;margin-bottom:10px">Snapshot of the bank accounts, bills, and debts from the balance sheet.</div>
          <div id="finCash"></div>
        </div>
      </div>

      <!-- Row 3: Year-over-year comparison -->
      <div class="fin-row2" id="finRow3" style="display:none">
        <div class="fin-chart-card" style="grid-column:1/-1">
          <div class="fin-chart-title">Same Month, Last Year vs. This Year <span id="varSubtitle"></span></div>
          <div style="font-size:11px;color:#888;margin-top:-8px;margin-bottom:10px">Are we bigger and more profitable than a year ago? Green = better, red = worse.</div>
          <div id="finVariance"></div>
        </div>
      </div>

      <!-- Key Ratios trend -->
      <div class="fin-chart-card" id="finTrendCard" style="display:none;margin-bottom:1.4rem">
        <div class="fin-chart-title">How The Ratios Have Moved, Month by Month</div>
        <div style="font-size:11px;color:#888;margin-top:-8px;margin-bottom:10px">Click a ratio below to plot just that one. Each line is that category&rsquo;s share of monthly revenue. <span style="color:#D4A017;font-weight:700">&mdash;</span> <strong style="color:#D4A017">Gold line = target</strong></div>
        <div class="fin-trend-toggles" id="trendToggles"></div>
        <div class="fin-chart-wrap" style="height:240px"><canvas id="trendChart"></canvas></div>
      </div>

      <!-- Monthly P&L grid (moved to bottom) -->
      <div class="fin-chart-card" id="finPnlCard" style="display:none;margin-bottom:1.4rem">
        <div class="fin-pnl-head">
          <div class="fin-chart-title" style="margin-bottom:0">Full Picture &mdash; Month by Month <span id="finPnlSubtitle"></span></div>
          <div class="fin-toggle" aria-label="Show dollars or percent of revenue">
            <button id="finModeDollar" class="active" onclick="setFinMode('dollar')">$</button>
            <button id="finModePct" onclick="setFinMode('pct')">% Rev</button>
          </div>
        </div>
        <div style="font-size:11px;color:#888;margin-top:4px;margin-bottom:10px">Every income and expense line, month by month. The selected month is highlighted. % Rev shows each line as a share of revenue over the whole window.</div>
        <div id="finPnlGrid" class="fin-pnl-scroll"></div>
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

    var periodEl = document.getElementById('period');
    if (periodEl) periodEl.textContent = summary.period;
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
    // Sidebar only on Technicians
    var isTech = tab === 'technicians';
    document.getElementById('dateSidebar').style.display = isTech ? '' : 'none';
    document.getElementById('mainWrapper').classList.toggle('no-sidebar', !isTech);
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
      // Use actual completed jobs (m.jobs) for spend ratio — not projected — so both sides are real numbers
      var costPerJob = (m.jobs > 0 && spend > 0) ? Math.round(spend / m.jobs) : 0;
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
  var finMonth = null;    // YYYY-MM currently selected
  var finCompare = 'prior_year_month'; // prior_month | prior_year_month | prior_year_avg | none
  var ownersBalance = null;
  var donutChartInst = null;
  var trendChartInst = null;
  var trendActive = 'gm'; // single-select key-ratio trend line

  function setFinMode(m) {
    finMode = m;
    document.getElementById('finModeDollar').classList.toggle('active', m === 'dollar');
    document.getElementById('finModePct').classList.toggle('active', m === 'pct');
    if (ownersData && ownersData.connected) renderOwners();
  }

  function setFinMonth(mk) {
    finMonth = mk;
    if (ownersData && ownersData.connected) renderOwners();
  }

  function setFinCompare(v) {
    finCompare = v;
    if (ownersData && ownersData.connected) renderOwners();
  }

  async function fetchOwnersData(force) {
    if (ownersData && !force) return;
    document.getElementById('finCards').innerHTML =
      '<div style="text-align:center;padding:3rem;color:#aaa;font-size:14px;grid-column:1/-1">Loading financial data\u2026</div>';
    document.getElementById('finPnlCard').style.display = 'none';
    document.getElementById('finRow2').style.display = 'none';
    document.getElementById('finRow3').style.display = 'none';
    document.getElementById('finTrendCard').style.display = 'none';
    try {
      var [finResp, balResp] = await Promise.all([
        fetch('/api/owners-financial').then(function(r){return r.json();}).catch(function(){return{connected:false,reason:'error'};}),
        fetch('/api/qbo-balance').then(function(r){return r.json();}).catch(function(){return{connected:false};})
      ]);
      ownersData = finResp;
      ownersBalance = balResp;
    } catch(e) {
      ownersData = { connected: false, reason: 'error' };
    }
    renderOwners();
  }

  function acct(name) {
    // Exact-match lookup against QBO account labels.
    if (!ownersData || !ownersData.accounts) return [];
    var months = ownersData.months || [];
    var a = ownersData.accounts[name];
    if (!a) return months.map(function() { return 0; });
    return months.map(function(mk) { return a[mk] || 0; });
  }

  function acctSum(names) {
    // Sum multiple accounts month-by-month
    if (!ownersData) return [];
    var out = (ownersData.months || []).map(function() { return 0; });
    names.forEach(function(n) {
      acct(n).forEach(function(v, i) { out[i] += v; });
    });
    return out;
  }

  function calcDiff(arrA, arrB) {
    return arrA.map(function(v, i) { return v - (arrB[i] || 0); });
  }

  function acctTotal(name) {
    return acct(name).reduce(function(s,v){ return s+v; }, 0);
  }

  function sumArr(arr) {
    return (arr || []).reduce(function(s,v){ return s + (v||0); }, 0);
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
      gm:    { g: 50, y: 43 },
      tl:    { g: 25, y: 30, inv: true },
      parts: { g: 25, y: 30, inv: true },
      admin: { g: 12, y: 15, inv: true },
      om:    { g: 15, y: 10 },
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

  function fmtMk(mk) {
    if (!mk) return '';
    var p = mk.split('-');
    var mn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(p[1])-1] || '';
    return mn + ' ' + p[0];
  }
  function fmtMkShort(mk) {
    if (!mk) return '';
    var p = mk.split('-');
    return (['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(p[1])-1] || '') + ' ' + p[0].slice(2);
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
      document.getElementById('finPnlCard').style.display = 'none';
      document.getElementById('finRow2').style.display = 'none';
      document.getElementById('finRow3').style.display = 'none';
      document.getElementById('finTrendCard').style.display = 'none';
      return;
    }

    var months = ownersData.months || [];
    if (!months.length) return;

    // ── Populate month picker (most-recent first) ───────────────
    var sel = document.getElementById('finMonthSel');
    if (sel.children.length !== months.length) {
      sel.innerHTML = months.slice().reverse().map(function(m) {
        return '<option value="' + m + '">' + fmtMk(m) + '</option>';
      }).join('');
    }
    if (!finMonth || months.indexOf(finMonth) === -1) {
      finMonth = months[months.length - 1];
    }
    sel.value = finMonth;

    // ── Key series (wired to exact QBO account labels) ──────────
    var revenue     = acct('Total Income');
    var cogs        = acct('Total Cost of goods sold'); // grand COGS
    var techLabor   = acct('Total Cost of Goods Sold - Labor');
    var parts       = acct('Cost of Goods Sold - Job Supplies');
    var subs        = acct('Subcontractors');
    var totalExp    = acct('Total Expenses');           // all OpEx
    var adminPay    = acct('Total Salaried & Admin Payroll Expense');
    var mktTotal    = acct('Total Advertising & marketing');
    var officeExp   = acct('Total Office expenses');
    var rentExp     = acct('Total Rent');
    var vehicleExp  = acct('Total Vehicle Expenses');
    var utilExp     = acct('Total Utilities');
    var travelExp   = acct('Total Travel');
    var mealsExp    = acct('Total Meals');
    var genExp      = acct('Total General Expenses');
    var taxesExp    = acct('Total Taxes paid');
    var merchExp    = acct('Total Merchant account fees');
    var benefitsExp = acct('Total Employee benefits');
    // Gross Profit & NOI aren't returned as rows — compute them.
    var gp          = revenue.map(function(r, i) { return r - (cogs[i] || 0); });
    var noi         = revenue.map(function(r, i) { return r - (cogs[i] || 0) - (totalExp[i] || 0); });
    var netInc      = noi; // No below-the-line items in this P&L

    // ── Selected-month index + comparison index ──────────────────
    var curIdx = months.indexOf(finMonth);
    if (curIdx < 0) curIdx = months.length - 1;
    var cmpIdx = -1;
    var cmpLabel = '';
    var cmpValues = null; // function(seriesArr) -> number
    if (finCompare === 'prior_month' && curIdx > 0) {
      cmpIdx = curIdx - 1;
      cmpLabel = 'vs. ' + fmtMkShort(months[cmpIdx]);
      cmpValues = function(arr) { return arr[cmpIdx] || 0; };
    } else if (finCompare === 'prior_year_month' && curIdx >= 12) {
      cmpIdx = curIdx - 12;
      cmpLabel = 'vs. ' + fmtMkShort(months[cmpIdx]);
      cmpValues = function(arr) { return arr[cmpIdx] || 0; };
    } else if (finCompare === 'prior_year_avg' && curIdx >= 12) {
      var s = curIdx - 12, e = curIdx; // 12 months ending the month before selected
      cmpLabel = 'vs. prior-yr avg';
      cmpValues = function(arr) {
        var sum = 0, n = 0;
        for (var i = s; i < e; i++) { sum += arr[i] || 0; n++; }
        return n > 0 ? sum / n : 0;
      };
    }

    // Current month scalars
    function at(arr) { return arr[curIdx] || 0; }
    var curRev = at(revenue), curGP = at(gp), curTL = at(techLabor);
    var curParts = at(parts), curNOI = at(noi);
    var gmPct    = curRev > 0 ? curGP / curRev * 100 : 0;
    var tlPct    = curRev > 0 ? curTL / curRev * 100 : 0;
    var partsPct = curRev > 0 ? curParts / curRev * 100 : 0;
    var noiPct   = curRev > 0 ? curNOI / curRev * 100 : 0;

    // % series (for trend chart)
    var gmArr    = months.map(function(_, i) { return revenue[i] > 0 ? gp[i]/revenue[i]*100 : 0; });
    var tlArr    = months.map(function(_, i) { return revenue[i] > 0 ? techLabor[i]/revenue[i]*100 : 0; });
    var partsArr = months.map(function(_, i) { return revenue[i] > 0 ? parts[i]/revenue[i]*100 : 0; });
    var noiArr   = months.map(function(_, i) { return revenue[i] > 0 ? noi[i]/revenue[i]*100 : 0; });
    var adminArr = months.map(function(_, i) { return revenue[i] > 0 ? (adminPay[i]+officeExp[i])/revenue[i]*100 : 0; });

    // ── Summary card deltas (respect compare mode) ───────────────
    function dollarCompare(curVal, arr) {
      if (!cmpValues) return '';
      var prev = cmpValues(arr);
      if (!prev) return '<div class="fin-compare-line">' + cmpLabel + ': —</div>';
      var d = curVal - prev;
      var pct = prev !== 0 ? Math.round(d / Math.abs(prev) * 100) : 0;
      var cls = d >= 0 ? 'up' : 'down';
      var arrow = d >= 0 ? '▲' : '▼';
      return '<span class="fin-card-delta ' + cls + '">' + arrow + ' ' + fmtDollar(Math.abs(d)) + ' (' + (pct>=0?'+':'') + pct + '%)</span>' +
        '<div class="fin-compare-line">' + cmpLabel + ': ' + fmtDollar(prev) + '</div>';
    }
    function pctCompare(curPct, arr) {
      // arr is the % series (already percentages). Show relative % change.
      if (!cmpValues) return '';
      var prev = cmpValues(arr);
      if (!prev) return '<div class="fin-compare-line">' + cmpLabel + ': —</div>';
      var d = curPct - prev;
      var relPct = Math.round(d / Math.abs(prev) * 100);
      var cls = d >= 0 ? 'up' : 'down';
      var arrow = d >= 0 ? '▲' : '▼';
      return '<span class="fin-card-delta ' + cls + '">' + arrow + ' ' + (relPct>=0?'+':'') + relPct + '%</span>' +
        '<div class="fin-compare-line">' + cmpLabel + ': ' + prev.toFixed(1) + '%</div>';
    }

    // Build compare-delta for a dollar value (inline, for formula-stop layout)
    function stopDelta(curVal, arr) {
      if (!cmpValues) return '';
      var prev = cmpValues(arr);
      if (!prev) return '<div class="fin-stop-delta"><span class="cmp-lbl">' + cmpLabel + ': —</span></div>';
      var d = curVal - prev;
      var pct = prev !== 0 ? Math.round(d / Math.abs(prev) * 100) : 0;
      var cls = d >= 0 ? 'up' : 'down';
      var arrow = d >= 0 ? '▲' : '▼';
      return '<div class="fin-stop-delta ' + cls + '">' + arrow + ' ' + fmtDollar(Math.abs(d)) +
        ' (' + (pct>=0?'+':'') + pct + '%) <span class="cmp-lbl">' + cmpLabel + '</span></div>';
    }

    var stamp = '';
    if (ownersData.fetchedAt) stamp = 'as of ' + new Date(ownersData.fetchedAt).toLocaleTimeString();

    var formulaHtml =
      '<div class="fin-flow-card">' +
        '<div class="fin-flow-card-head">' +
          '<div class="fin-flow-card-title">The Big Picture &mdash; ' + fmtMk(finMonth) + '</div>' +
          '<div class="fin-flow-card-stamp">' + stamp + '</div>' +
        '</div>' +
        '<div class="fin-flow-stops">' +
          '<div class="fin-flow-stop rev">' +
            '<div class="fin-stop-title">Revenue</div>' +
            '<div class="fin-stop-desc">Money in</div>' +
            '<div class="fin-stop-value">' + fmtDollar(curRev) + '</div>' +
            '<div class="fin-stop-sub">Completed jobs this month</div>' +
            stopDelta(curRev, revenue) +
          '</div>' +
          '<div class="fin-flow-arrow">' +
            '<span class="fin-flow-arrow-icon">&darr;</span>' +
            '<span class="fin-flow-arrow-label"><span class="fin-flow-arrow-op">&minus;</span>Job costs<br>(techs + parts)</span>' +
          '</div>' +
          '<div class="fin-flow-stop gp">' +
            '<div class="fin-stop-title">Gross Profit</div>' +
            '<div class="fin-stop-desc">Kept after the work</div>' +
            '<div class="fin-stop-value">' + fmtDollar(curGP) + '</div>' +
            '<div class="fin-stop-sub">' + fmtPct(gmPct) + ' of revenue</div>' +
            stopDelta(curGP, gp) +
          '</div>' +
          '<div class="fin-flow-arrow">' +
            '<span class="fin-flow-arrow-icon">&darr;</span>' +
            '<span class="fin-flow-arrow-label"><span class="fin-flow-arrow-op">&minus;</span>Overhead<br>(rent, admin, marketing, vehicles)</span>' +
          '</div>' +
          '<div class="fin-flow-stop noi">' +
            '<div class="fin-stop-title">Operating Profit</div>' +
            '<div class="fin-stop-desc">What&rsquo;s left</div>' +
            '<div class="fin-stop-value">' + fmtDollar(curNOI) + '</div>' +
            '<div class="fin-stop-sub">' + fmtPct(noiPct) + ' of revenue</div>' +
            stopDelta(curNOI, noi) +
          '</div>' +
        '</div>' +
      '</div>';
    document.getElementById('finCards').innerHTML = formulaHtml;

    // Efficiency tiles — share of revenue
    var pctTiles = [
      { label: 'Gross Margin', val: fmtPct(gmPct), sub: 'Healthy: 50% or higher',
        cls: colorClass('gm', gmPct), delta: pctCompare(gmPct, gmArr),
        hint: 'Share of revenue you keep after paying for the work itself.' },
      { label: 'Tech Labor',   val: fmtPct(tlPct), sub: 'Healthy: under 25%',
        cls: colorClass('tl', tlPct), delta: pctCompare(tlPct, tlArr),
        hint: 'Share of every dollar that went to crew wages.' },
      { label: 'Parts',        val: fmtPct(partsPct), sub: 'Healthy: under 25%',
        cls: colorClass('parts', partsPct), delta: pctCompare(partsPct, partsArr),
        hint: 'Share of every dollar that went to materials.' }
    ];
    document.getElementById('finCards2').innerHTML = pctTiles.map(function(c) {
      return '<div class="fin-pct-tile">' +
        '<div class="fin-pct-tile-label">' + esc(c.label) + '</div>' +
        '<div class="fin-pct-tile-value ' + c.cls + '">' + c.val + '</div>' +
        '<div class="fin-pct-tile-sub">' + c.sub + '</div>' +
        (c.delta || '').replace(/fin-card-delta/g, 'fin-pct-tile-delta').replace(/fin-compare-line/g, 'fin-pct-tile-sub') +
        '<div class="fin-pct-tile-hint">' + c.hint + '</div>' +
        '</div>';
    }).join('');
    document.getElementById('finCardsTitle2').style.display = '';

    // ── Show structural elements ─────────────────────────────────
    var multiMonth = months.length > 1;
    document.getElementById('finPnlCard').style.display = multiMonth ? '' : 'none';
    document.getElementById('finRow2').style.display = '';
    document.getElementById('finRow3').style.display = '';
    document.getElementById('finTrendCard').style.display = multiMonth ? '' : 'none';
    var updEl = document.getElementById('finUpdated');
    if (updEl) {
      var updTxt = fmtMk(finMonth) + '  ·  ';
      if (ownersData.fetchedAt) updTxt += 'as of ' + new Date(ownersData.fetchedAt).toLocaleTimeString();
      updEl.textContent = updTxt;
    }

    // ── Monthly P&L grid ─────────────────────────────────────────
    // On phone, show last 6 months; desktop, last 12.
    var isPhone = window.innerWidth < 700;
    var gridEnd = curIdx;
    var gridStart = Math.max(0, gridEnd - (isPhone ? 5 : 11));
    var gridMonths = months.slice(gridStart, gridEnd + 1);
    var otherOpex = totalExp.map(function(t, i) {
      return t - (adminPay[i]||0) - (mktTotal[i]||0) - (officeExp[i]||0) - (rentExp[i]||0)
        - (vehicleExp[i]||0) - (utilExp[i]||0) - (travelExp[i]||0) - (mealsExp[i]||0)
        - (genExp[i]||0) - (taxesExp[i]||0) - (merchExp[i]||0) - (benefitsExp[i]||0);
    });
    var pnlRows = [
      { label: 'Revenue', arr: revenue, cls: 'subtotal' },
      { label: 'Cost of Goods Sold', arr: cogs, cls: '' },
      { label: 'Tech Labor', arr: techLabor, cls: 'indent' },
      { label: 'Parts', arr: parts, cls: 'indent' },
      { label: 'Subcontractors', arr: subs, cls: 'indent' },
      { label: 'Gross Profit', arr: gp, cls: 'subtotal' },
      { label: 'Operating Expenses', arr: totalExp, cls: '' },
      { label: 'Admin Payroll', arr: adminPay, cls: 'indent' },
      { label: 'Marketing', arr: mktTotal, cls: 'indent' },
      { label: 'Rent', arr: rentExp, cls: 'indent' },
      { label: 'Vehicle', arr: vehicleExp, cls: 'indent' },
      { label: 'Office', arr: officeExp, cls: 'indent' },
      { label: 'Utilities', arr: utilExp, cls: 'indent' },
      { label: 'Merchant Fees', arr: merchExp, cls: 'indent' },
      { label: 'Employee Benefits', arr: benefitsExp, cls: 'indent' },
      { label: 'Taxes', arr: taxesExp, cls: 'indent' },
      { label: 'Travel', arr: travelExp, cls: 'indent' },
      { label: 'Meals', arr: mealsExp, cls: 'indent' },
      { label: 'Other', arr: otherOpex, cls: 'indent' },
      { label: 'Net Operating Income', arr: noi, cls: 'total' }
    ];
    var revGridTotal = 0;
    gridMonths.forEach(function(_, gi) { revGridTotal += revenue[gridStart+gi] || 0; });
    var pnlHead = '<tr><th>Line item</th>' +
      gridMonths.map(function(m) { return '<th>' + fmtMkShort(m) + '</th>'; }).join('') +
      '<th>Total</th><th>% Rev</th></tr>';
    var pnlBody = pnlRows.map(function(row) {
      var cells = gridMonths.map(function(_, gi) {
        var v = row.arr[gridStart+gi] || 0;
        var isHi = (gridStart+gi) === curIdx ? ' highlight' : '';
        var neg = v < 0 ? ' neg' : '';
        return '<td class="' + isHi + neg + '">' + (finMode==='pct' && revenue[gridStart+gi]>0 ? (v/revenue[gridStart+gi]*100).toFixed(1)+'%' : fmtDollar(v)) + '</td>';
      }).join('');
      var rowTotal = 0;
      gridMonths.forEach(function(_, gi) { rowTotal += row.arr[gridStart+gi] || 0; });
      var pctRev = revGridTotal > 0 ? (rowTotal / revGridTotal * 100).toFixed(1) + '%' : '—';
      return '<tr class="' + row.cls + '"><td>' + esc(row.label) + '</td>' + cells +
        '<td>' + fmtDollar(rowTotal) + '</td>' +
        '<td>' + pctRev + '</td></tr>';
    }).join('');
    document.getElementById('finPnlGrid').innerHTML =
      '<table class="pnl-grid"><thead>' + pnlHead + '</thead><tbody>' + pnlBody + '</tbody></table>';
    document.getElementById('finPnlSubtitle').textContent = gridMonths.length + ' months ending ' + fmtMkShort(finMonth);

    // ── Cost breakdown donut (selected month) ────────────────────
    var dTechLabor = at(techLabor);
    var dParts     = at(parts);
    var dSubs      = at(subs);
    var dAdmin     = at(adminPay);
    var dMkt       = at(mktTotal);
    var dRent      = at(rentExp);
    var dVehicle   = at(vehicleExp);
    var dOffice    = at(officeExp);
    var dMerch     = at(merchExp);
    var dInsure    = acct('Insurance')[curIdx] || 0;
    var dBenefits  = at(benefitsExp);
    var dUtil      = at(utilExp);
    var dAccounted = dTechLabor + dParts + dSubs + dAdmin + dMkt + dRent + dVehicle + dOffice + dMerch + dInsure + dBenefits + dUtil;
    var dAllCosts  = at(cogs) + at(totalExp);
    var dOther     = Math.max(dAllCosts - dAccounted, 0);
    document.getElementById('donutSubtitle').textContent = fmtDollar(dAllCosts) + ' · ' + fmtMkShort(finMonth);

    if (donutChartInst) donutChartInst.destroy();
    var dCtx = document.getElementById('donutChart').getContext('2d');
    donutChartInst = new Chart(dCtx, {
      type: 'doughnut',
      data: {
        labels: ['Tech Labor','Parts','Subcontractors','Admin Payroll','Marketing','Rent','Vehicle','Office','Merchant','Insurance','Benefits','Utilities','Other'],
        datasets: [{
          data: [dTechLabor,dParts,dSubs,dAdmin,dMkt,dRent,dVehicle,dOffice,dMerch,dInsure,dBenefits,dUtil,dOther],
          backgroundColor: ['#FF6B35','#E5484D','#f59e0b','#64748b','#14b8a6','#8b5cf6','#FF9500','#3b82f6','#a855f7','#6366f1','#22c55e','#06b6d4','#9ca3af'],
          borderWidth: 2, borderColor: '#fff', hoverOffset: 6
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '60%',
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 8, boxWidth: 10 } },
          tooltip: { callbacks: {
            label: function(ctx) {
              var v = ctx.parsed;
              var pct = dAllCosts > 0 ? (v/dAllCosts*100).toFixed(1) + '%' : '';
              return ctx.label + ': ' + fmtDollar(v) + (pct ? ' (' + pct + ')' : '');
            }
          }}
        }
      }
    });

    // ── Variance vs. prior year (selected month vs. same month last year) ─
    var pyIdx = curIdx - 12;
    if (pyIdx < 0) {
      document.getElementById('finVariance').innerHTML =
        '<div style="padding:2rem;text-align:center;color:#aaa;font-size:12px">Not enough history — need data from 12 months before ' + fmtMk(finMonth) + '.</div>';
      document.getElementById('varSubtitle').textContent = '';
    } else {
      var pyMonth = months[pyIdx];
      var varLines = [
        { label: 'Revenue', cur: revenue[curIdx], py: revenue[pyIdx], good: 'up', kind: 'top', op: '' },
        { label: 'Cost of Goods Sold', cur: cogs[curIdx], py: cogs[pyIdx], good: 'down', kind: 'indent', op: '\u2212' },
        { label: 'Gross Profit', cur: gp[curIdx], py: gp[pyIdx], good: 'up', kind: 'sub', op: '=' },
        { label: 'Operating Expenses', cur: totalExp[curIdx], py: totalExp[pyIdx], good: 'down', kind: 'indent', op: '\u2212' },
        { label: 'Operating Profit', cur: noi[curIdx], py: noi[pyIdx], good: 'up', kind: 'noi', op: '=' }
      ];
      function deltaParts(l) {
        var d = (l.cur||0) - (l.py||0);
        var pct = l.py ? (d / Math.abs(l.py) * 100) : 0;
        var isGood = l.good === 'up' ? d >= 0 : d <= 0;
        var cls = isGood ? 'pos' : 'neg';
        var signStr = d >= 0 ? '+' : '';
        return { d: d, pct: pct, cls: cls, signStr: signStr };
      }
      // Desktop table — NOI row emphasized
      var varBody = varLines.map(function(l) {
        var p = deltaParts(l);
        var rowCls = l.kind === 'sub' ? 'subtotal' : (l.kind === 'noi' ? 'noi' : '');
        return '<tr class="' + rowCls + '">' +
          '<td>' + esc(l.label) + '</td>' +
          '<td>' + fmtDollar(l.cur || 0) + '</td>' +
          '<td>' + fmtDollar(l.py || 0) + '</td>' +
          '<td class="' + p.cls + '">' + p.signStr + fmtDollar(p.d) + '</td>' +
          '<td class="' + p.cls + '">' + (l.py ? p.signStr + p.pct.toFixed(1) + '%' : '—') + '</td>' +
          '</tr>';
      }).join('');
      // Mobile flow — P&L order with big NOI payload
      var varFlow = varLines.map(function(l) {
        var p = deltaParts(l);
        if (l.kind === 'noi') {
          return '<div class="var-flow-row noi">' +
            '<div class="var-noi-lbl">' + (l.op ? l.op + ' ' : '') + 'Operating Profit</div>' +
            '<div class="var-noi-val">' + fmtDollar(l.cur || 0) + '</div>' +
            '<div class="var-noi-vs">vs ' + fmtDollar(l.py || 0) + ' in ' + fmtMkShort(pyMonth) + '</div>' +
            '<div class="var-noi-change ' + p.cls + '">' + (p.d >= 0 ? '▲' : '▼') + ' ' + p.signStr + fmtDollar(p.d) +
              (l.py ? ' (' + p.signStr + p.pct.toFixed(0) + '%)' : '') + '</div>' +
            '</div>';
        }
        var rowCls = l.kind === 'indent' ? 'indent' : (l.kind === 'sub' ? 'sub' : '');
        return '<div class="var-flow-row ' + rowCls + '">' +
          '<span>' + (l.op ? l.op + ' ' : '') + esc(l.label) + ' <span style="color:#aaa;font-size:12px">' + fmtDollar(l.cur||0) + '</span></span>' +
          '<span class="var-chg ' + p.cls + '">' + (l.py ? p.signStr + p.pct.toFixed(0) + '%' : '—') + '</span>' +
          '</div>';
      }).join('');
      document.getElementById('finVariance').innerHTML =
        '<div class="var-flow">' + varFlow + '</div>' +
        '<div class="var-table-wrap">' +
        '<table class="var-table"><thead><tr>' +
        '<th>Line item</th><th>This year (' + fmtMkShort(finMonth) + ')</th><th>Last year (' + fmtMkShort(pyMonth) + ')</th>' +
        '<th>Change ($)</th><th>Change (%)</th></tr></thead><tbody>' + varBody + '</tbody></table></div>';
      document.getElementById('varSubtitle').textContent = fmtMkShort(finMonth) + ' vs. ' + fmtMkShort(pyMonth);
    }

    // ── Cash / Working Capital ───────────────────────────────────
    if (ownersBalance && ownersBalance.connected) {
      var b = ownersBalance;
      var cr = b.currentRatio;
      var crCls = cr == null ? '' : (cr >= 1.5 ? 'ok' : cr >= 1.0 ? 'warn' : 'bad');
      var crText = cr == null ? '—' : cr.toFixed(2) + '\u00d7';
      var cash = b.cash || 0;
      var curAssets = b.currentAssets || 0;
      var otherCurAssets = Math.max(curAssets - cash, 0);
      var ap = b.accountsPayable || 0;
      var curLiab = b.currentLiabilities || 0;
      var otherCurLiab = Math.max(curLiab - ap, 0);
      var ltDebt = b.longTermLiabilities || 0;
      var totalLiab = (b.totalLiabilities != null) ? b.totalLiabilities : (curLiab + ltDebt);

      function row(label, sub, value, opts) {
        opts = opts || {};
        var cls = opts.cls ? ' ' + opts.cls : '';
        var op = opts.op ? '<span class="op">' + opts.op + '</span>' : '';
        return '<div class="cash-flow-row' + cls + '">' +
          '<div class="lbl">' + op + '<span>' + label + '</span>' +
          (sub ? '<span class="lbl-sub">' + sub + '</span>' : '') + '</div>' +
          '<div class="val">' + fmtDollar(value) + '</div>' +
          '</div>';
      }

      var haveHtml = '<div class="cash-flow-section">' +
        '<div class="cash-flow-head">What we have</div>' +
        row('Cash in the bank', 'Across all business accounts', cash) +
        row('Other short-term assets', 'Stuff that turns into cash within a year', otherCurAssets, { op: '+' }) +
        row('Short-term assets', 'Total we could pull from in a pinch', curAssets, { op: '=', cls: 'subtotal' }) +
      '</div>';

      var oweHtml = '<div class="cash-flow-section">' +
        '<div class="cash-flow-head">What we owe</div>' +
        row('Bills we owe', 'Unpaid supplier / vendor bills', ap) +
        row('Other due within a year', 'Credit cards, short-term loan payments', otherCurLiab, { op: '+' }) +
        row('Due within a year', 'Everything that has to be paid in 12 months', curLiab, { op: '=', cls: 'subtotal' }) +
        row('Long-term debt', 'Vehicle loans, equipment notes, mortgages', ltDebt, { op: '+' }) +
        row('Everything we owe', 'All debt combined, short + long-term', totalLiab, { op: '=', cls: 'total' }) +
      '</div>';

      var cushionHtml = '<div class="cash-cushion">' +
        '<div class="lbl"><span class="lbl-top">Short-term cushion</span>' +
        '<span class="lbl-sub">Short-term assets &divide; Due within a year. Above 1.5&times; = comfortable. Under 1&times; = tight.</span></div>' +
        '<div class="val ' + crCls + '">' + crText + '</div>' +
      '</div>';

      document.getElementById('finCash').innerHTML =
        '<div class="cash-flow">' + haveHtml + oweHtml + '</div>' + cushionHtml;
      document.getElementById('cashSubtitle').textContent = 'as of ' + b.asOf;
    } else {
      document.getElementById('finCash').innerHTML =
        '<div style="padding:2rem;text-align:center;color:#aaa;font-size:12px">Balance sheet data unavailable.</div>';
      document.getElementById('cashSubtitle').textContent = '';
    }

    // ── Trend lines ──────────────────────────────────────────────
    var TREND_SERIES = [
      { key: 'gm',    label: 'Gross Margin %',    color: '#12A071', data: gmArr,    goal: 50 },
      { key: 'tl',    label: 'Tech Labor %',       color: '#FF9500', data: tlArr,    goal: 25 },
      { key: 'parts', label: 'Parts %',            color: '#FF6B35', data: partsArr, goal: 25 },
      { key: 'admin', label: 'Admin & Office %',   color: '#8b5cf6', data: adminArr, goal: null },
      { key: 'om',    label: 'Operating Margin %', color: '#4A90D9', data: noiArr,   goal: 15 }
    ];

    // Build trend toggle buttons (single-select)
    var togHtml = TREND_SERIES.map(function(s) {
      var on = trendActive === s.key ? ' on' : '';
      return '<button class="fin-trend-btn' + on + '" data-key="' + s.key + '" style="color:' + s.color + '" onclick="selectTrendLine(this)">' + esc(s.label) + '</button>';
    }).join('');
    document.getElementById('trendToggles').innerHTML = togHtml;

    if (trendChartInst) trendChartInst.destroy();
    var tCtx = document.getElementById('trendChart').getContext('2d');
    var mLabels = months.map(function(mk) {
      var p = mk.split('-'); return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(p[1])-1] + ' ' + p[0].slice(2);
    });
    var tDatasets = [];
    TREND_SERIES.forEach(function(s) {
      tDatasets.push({
        label: s.label, data: s.data, borderColor: s.color,
        backgroundColor: s.color + '18',
        borderWidth: 2, pointRadius: 3, pointHoverRadius: 5,
        tension: 0.3, hidden: trendActive !== s.key,
        fill: false
      });
    });
    // Secondary goal-line datasets (dashed, grey) synced 1:1 with main series.
    TREND_SERIES.forEach(function(s) {
      tDatasets.push({
        label: s.label + ' target',
        data: s.goal == null ? [] : months.map(function() { return s.goal; }),
        borderColor: '#D4A017',
        borderWidth: 2, pointRadius: 0, pointHoverRadius: 0,
        tension: 0, fill: false,
        hidden: trendActive !== s.key || s.goal == null
      });
    });
    trendChartInst = new Chart(tCtx, {
      type: 'line',
      data: { labels: mLabels, datasets: tDatasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            filter: function(ctx) { return !/target$/.test(ctx.dataset.label); },
            callbacks: {
              label: function(ctx) { return ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(1) + '%'; }
            }
          }
        },
        scales: {
          x: { grid: { color: '#f5f5f5' }, ticks: { font: { size: 10 } } },
          y: { ticks: { callback: function(v) { return v.toFixed(0) + '%'; }, font: { size: 10 } }, grid: { color: '#f0f0f0' } }
        }
      }
    });

  }

  function selectTrendLine(btn) {
    var key = btn.dataset.key;
    trendActive = key;
    var btns = document.querySelectorAll('#trendToggles .fin-trend-btn');
    btns.forEach(function(b) { b.classList.toggle('on', b.dataset.key === key); });
    if (trendChartInst) {
      var keys = ['gm','tl','parts','admin','om'];
      var goals = { gm:50, tl:25, parts:25, admin:null, om:15 };
      keys.forEach(function(k, idx) {
        // main series at idx, goal series at idx + keys.length
        trendChartInst.data.datasets[idx].hidden = k !== key;
        if (trendChartInst.data.datasets[idx + keys.length]) {
          trendChartInst.data.datasets[idx + keys.length].hidden = k !== key || goals[k] == null;
        }
      });
      trendChartInst.update();
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

    // Projection for current month
    const cur = history[history.length - 1];
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysElapsed = now.getDate();
    const daysLeft = daysInMonth - daysElapsed;
    const dailyRate = daysElapsed > 0 ? cur.jobs / daysElapsed : 0;
    const projectedJobs = daysElapsed > 0 ? Math.round(dailyRate * daysInMonth) : 0;

    const payload = {
      history,
      projection: {
        jobsMtd: cur.jobs,
        projectedJobs,
        dailyRate,
        daysElapsed,
        daysLeft,
        totalDays: daysInMonth
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
    res.json({
      connected: true,
      ...parsed,
      fetchedAt: new Date().toISOString(),
      startDate,
      endDate,
      latestReliableMonth: parsed.months[parsed.months.length - 1]
    });
  } catch (err) {
    console.error('[/api/owners-financial]', err.response?.status || '', err.message);
    if (err.response?.status === 401) {
      qboTokens.accessToken = null;
      return res.json({ connected: false, reason: 'token_expired' });
    }
    res.status(500).json({ connected: false, reason: 'error', error: err.message });
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
// Cash / Working Capital — latest Balance Sheet snapshot.
// Returns: cash, accountsReceivable, accountsPayable, currentRatio.
app.get('/api/qbo-balance', async (req, res) => {
  if (!qboReady()) return res.json({ connected: false });
  try {
    const token = await getQBOAccessToken();
    if (!token) return res.json({ connected: false });
    const asOf = getReliableEndDate(new Date()).toISOString().slice(0, 10);
    const bsRes = await axios.get(
      QBO_BASE + '/v3/company/' + qboTokens.realmId + '/reports/BalanceSheet',
      {
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
        params: { as_of: asOf, accounting_method: 'Cash', minorversion: 75 }
      }
    );
    // Walk the BS report — section names contain "Bank", "Accounts Receivable",
    // "Accounts Payable", "Current Assets", "Current Liabilities".
    const byName = {};
    (function walk(rows) {
      if (!Array.isArray(rows)) return;
      rows.forEach(row => {
        if (row.Summary && row.Summary.ColData) {
          const n = (row.Summary.ColData[0].value || '').trim();
          const v = parseFloat((row.Summary.ColData[row.Summary.ColData.length - 1].value || '0').replace(/,/g, '')) || 0;
          if (n) byName[n] = v;
        }
        if (row.ColData && row.ColData[0]) {
          const n = (row.ColData[0].value || '').trim();
          const v = parseFloat((row.ColData[row.ColData.length - 1].value || '0').replace(/,/g, '')) || 0;
          if (n) byName[n] = v;
        }
        if (row.Rows && row.Rows.Row) walk(row.Rows.Row);
      });
    })((bsRes.data.Rows && bsRes.data.Rows.Row) || []);

    const findByKeyword = (kws) => {
      for (const k of Object.keys(byName)) {
        const kl = k.toLowerCase();
        if (kws.every(kw => kl.includes(kw))) return byName[k];
      }
      return 0;
    };

    const cash = findByKeyword(['total', 'bank']);
    const ar = findByKeyword(['total', 'receivable']);
    const ap = findByKeyword(['total', 'payable']);
    const currentAssets = findByKeyword(['total current assets']);
    const currentLiabs = findByKeyword(['total current liabilities']);
    const longTermLiabs = findByKeyword(['total long-term liabilities'])
      || findByKeyword(['total long term liabilities']);
    // Prefer the grand "Total Liabilities" row if QBO emits it; else fall
    // back to Total Liabilities and Equity minus Equity; else current+LT.
    let totalLiabs = findByKeyword(['total liabilities']);
    if (!totalLiabs) {
      const totalLE = findByKeyword(['total liabilities and equity'])
        || findByKeyword(['liabilities and equity']);
      const totalEquity = findByKeyword(['total equity']);
      if (totalLE && totalEquity) totalLiabs = totalLE - totalEquity;
    }
    if (!totalLiabs) totalLiabs = (currentLiabs || 0) + (longTermLiabs || 0);
    const currentRatio = currentLiabs > 0 ? currentAssets / currentLiabs : null;

    res.json({
      connected: true, asOf,
      cash, accountsReceivable: ar, accountsPayable: ap,
      currentAssets, currentLiabilities: currentLiabs,
      longTermLiabilities: longTermLiabs, totalLiabilities: totalLiabs,
      currentRatio,
      accounts: Object.keys(byName).sort()
    });
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
