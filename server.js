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
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; }

    .header { background: #1a2d3a; color: white; padding: 1.5rem 1rem; text-align: center; }
    .header h1 { font-size: 28px; font-weight: 600; margin: 0 0 0.4rem 0; }
    .header p { margin: 0; font-size: 13px; opacity: 0.85; }

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
    .sort-btn { padding: 6px 14px; font-size: 13px; border: 1px solid #e0e0e0; border-radius: 20px; background: white; color: #555; cursor: pointer; transition: all 0.15s; }
    .sort-btn:hover { background: #f5f5f5; }
    .sort-btn.active { background: #FF9500; color: white; border-color: #FF9500; font-weight: 600; }

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
    .modal-table thead th:last-child { text-align: right; }
    .modal-table tbody td { padding: 11px 16px; font-size: 13px; border-bottom: 1px solid #f7f7f7; color: #444; }
    .modal-table tbody tr:last-child td { border-bottom: none; }
    .modal-table tbody td:last-child { text-align: right; font-weight: 600; color: #333; font-variant-numeric: tabular-nums; }
    .modal-footer { padding: 1rem 1.4rem; border-top: 2px solid #f0f0f0; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }
    .modal-footer-left { font-size: 13px; color: #888; }
    .modal-footer-right { font-size: 16px; font-weight: 700; color: #FF9500; }

    .footer { text-align: center; font-size: 11px; color: #aaa; padding: 1rem; }
    .error-msg { background: #fff3f3; color: #c62828; padding: 1.2rem 1.4rem; font-size: 14px; }

    @media (max-width: 768px) {
      .main-wrapper { grid-template-columns: 1fr; }
      .sidebar { border-right: none; border-bottom: 1px solid #eee; display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 4px; padding: 0.8rem; }
      .content { padding: 1rem; }
    }
  </style>
</head>
<body>

<div class="header">
  <h1>Sunwave Performance</h1>
  <p id="period">Loading...</p>
</div>

<div class="main-wrapper">
  <div class="sidebar" id="dateSidebar"></div>
  <div class="content">
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
            <th>Amount</th>
          </tr>
        </thead>
        <tbody id="modalBody"></tbody>
      </table>
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
  dateRanges.forEach(function(range) {
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
    sidebar.appendChild(btn);
  });

  document.querySelectorAll('.sort-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      currentSort = this.dataset.sort;
      document.querySelectorAll('.sort-btn').forEach(function(b) { b.classList.remove('active'); });
      this.classList.add('active');
      render();
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
    var rows = jobs.map(function(job) {
      var desc = job.description ? esc(job.description) : (job.invoice ? 'Invoice #' + esc(job.invoice) : '\u2014');
      return '<tr>' +
        '<td>' + fmtDate(job.date) + '</td>' +
        '<td>' + desc + '</td>' +
        '<td>' + esc(job.customer || '\u2014') + '</td>' +
        '<td>' + fmt(job.amount) + '</td>' +
        '</tr>';
    }).join('');
    document.getElementById('modalBody').innerHTML = rows ||
      '<tr><td colspan="4" style="text-align:center;color:#aaa;padding:2rem">No jobs found</td></tr>';
    document.getElementById('modalJobCount').textContent = jobs.length + ' job' + (jobs.length !== 1 ? 's' : '');
    document.getElementById('modalTotal').textContent = fmt(tech.monthlyRevenue) + ' total';
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

    const techMetrics = {};
    allJobs.forEach(job => {
      const assignedEmployees = job.assigned_employees || [];
      if (assignedEmployees.length === 0) return;

      const jobRevenue = parseFloat(job.total_amount || 0) / 100;
      const customer = job.customer
        ? ((job.customer.first_name || '') + ' ' + (job.customer.last_name || '')).trim()
        : '';
      const jobDate = (job.work_timestamps && job.work_timestamps.completed_at)
        ? job.work_timestamps.completed_at
        : (job.schedule && job.schedule.scheduled_start ? job.schedule.scheduled_start : null);

      assignedEmployees.forEach(emp => {
        const techId = emp.id;
        if (!techId) return;

        if (!techMetrics[techId]) {
          const techName = ((emp.first_name || '') + ' ' + (emp.last_name || '')).trim() || 'Unknown';
          techMetrics[techId] = { id: techId, name: techName, revenue: 0, jobs: 0, jobList: [] };
        }

        techMetrics[techId].revenue += jobRevenue;
        techMetrics[techId].jobs += 1;
        techMetrics[techId].jobList.push({
          invoice: job.invoice_number || null,
          description: job.description || null,
          customer,
          date: jobDate,
          amount: jobRevenue
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
    const totalJobs = leaderboard.reduce((sum, t) => sum + t.jobsCompleted, 0);
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

app.listen(PORT, () => {
  console.log('Dashboard running on port ' + PORT);
  console.log('API Key configured: ' + (!!API_KEY));
});
