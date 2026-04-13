const express = require('express');
const axios = require('axios');
const app = express();

const API_KEY = process.env.HOUSECALL_PRO_API_KEY;
const PORT = process.env.PORT || 3000;
const BASE_URL = 'https://api.housecallpro.com';

app.get('/', (req, res) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sunwave Tech Dashboard</title>
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
      <button class="tab-btn active" data-tab="tech">Technicians</button>
      <button class="tab-btn" data-tab="marketing">Marketing</button>
    </div>

    <!-- Technicians view -->
    <div class="view-panel active" id="techView">
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
        ? '<div style="font-size:11px;color:#aaa;margin-top:2px">w/ ' + job.splitWith.map(esc).join(', ') + '</div>' : '';
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
        ? ' <span style="font-size:11px;color:#bbb">w/ ' + job.splitWith.map(esc).join(', ') + '</span>' : '';
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

  // ── Tab navigation ──────────────────────────────────────────────
  var marketingLoaded = false;
  document.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var tab = this.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
      this.classList.add('active');
      document.querySelectorAll('.view-panel').forEach(function(p) { p.classList.remove('active'); });
      if (tab === 'tech') {
        document.getElementById('techView').classList.add('active');
      } else if (tab === 'marketing') {
        document.getElementById('marketingView').classList.add('active');
        if (!marketingLoaded) { marketingLoaded = true; fetchMarketing(); }
      }
    });
  });

  // ── Marketing ───────────────────────────────────────────────────
  var marketingData = null;

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
      renderMarketing();
    } catch(e) {
      document.getElementById('marketingContent').innerHTML =
        '<div class="error-msg">Error loading marketing data. Check server logs.</div>';
    }
  }

  function renderMarketing() {
    if (!marketingData) return;
    var proj = marketingData.projection;
    var history = marketingData.history; // array [{month, label, jobs, revenue, avgTicket}]

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

    // Bar chart — last 12 months
    var maxJobs = Math.max.apply(null, history.map(function(m) { return m.jobs; })) || 1;
    var BAR_MAX_PX = 100;
    var bars = history.map(function(m) {
      var h = Math.max(3, Math.round(m.jobs / maxJobs * BAR_MAX_PX));
      var isCur = m.isCurrent ? ' is-current' : '';
      return '<div class="bar-col">' +
        '<div class="bar-val">' + (m.jobs > 0 ? m.jobs : '') + '</div>' +
        '<div class="bar' + isCur + '" style="height:' + h + 'px"></div>' +
        '<div class="bar-lbl">' + esc(m.label) + '</div>' +
      '</div>';
    }).join('');

    var chartHTML =
      '<div class="section-title">Jobs Per Month</div>' +
      '<div class="bar-chart-card"><div class="bar-chart">' + bars + '</div></div>';

    // Monthly history table
    var tableRows = history.slice().reverse().map(function(m, i, arr) {
      var prev = arr[i + 1];
      var deltaJobs = '';
      if (prev && prev.jobs > 0) {
        var diff = m.jobs - prev.jobs;
        var pctD = Math.round(diff / prev.jobs * 100);
        deltaJobs = diff > 0
          ? '<span class="delta delta-up">+' + pctD + '%</span>'
          : diff < 0
          ? '<span class="delta delta-down">' + pctD + '%</span>'
          : '<span class="delta" style="color:#bbb">—</span>';
      }
      var rowClass = m.isCurrent ? ' class="mkt-row-current"' : '';
      return '<tr' + rowClass + '>' +
        '<td>' + esc(m.fullLabel) + (m.isCurrent ? ' <span style="font-size:10px;color:#FF9500;font-weight:600">MTD</span>' : '') + '</td>' +
        '<td>' + m.jobs + deltaJobs + '</td>' +
        '<td>' + fmt(m.revenue) + '</td>' +
        '<td>' + (m.jobs > 0 ? fmt(m.avgTicket) : '—') + '</td>' +
        '</tr>';
    }).join('');

    // Totals for history table
    var totalHistJobs = history.reduce(function(s,m){ return s + m.jobs; }, 0);
    var totalHistRev = history.reduce(function(s,m){ return s + m.revenue; }, 0);
    var avgHistTicket = totalHistJobs > 0 ? Math.round(totalHistRev / totalHistJobs) : 0;

    var tableHTML =
      '<div class="section-title">Monthly History</div>' +
      '<div class="mkt-table-card"><table class="mkt-table">' +
        '<thead><tr><th>Month</th><th># Jobs</th><th>Revenue</th><th>Avg Ticket</th></tr></thead>' +
        '<tbody>' + tableRows + '</tbody>' +
        '<tfoot><tr><td>12-Month Total</td><td>' + totalHistJobs + '</td><td>' + fmt(totalHistRev) + '</td><td>' + fmt(avgHistTicket) + '</td></tr></tfoot>' +
      '</table></div>';

    document.getElementById('marketingContent').innerHTML = projHTML + chartHTML + tableHTML;
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
              .then(r => ({ id, employees: r.data.assigned_employees || [] }))
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
        const splitWith = allInvolvedNames.filter(n => n !== ((emp.first_name || '') + ' ' + (emp.last_name || '')).trim());

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

app.listen(PORT, () => {
  console.log('Dashboard running on port ' + PORT);
  console.log('API Key configured: ' + (!!API_KEY));
});
