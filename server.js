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
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #fafafa; }
    .header { background: #1a2d3a; color: white; padding: 1.5rem 1rem; text-align: center; }
    .header h1 { font-size: 28px; font-weight: 600; margin: 0 0 0.5rem 0; }
    .header p { margin: 0; font-size: 13px; opacity: 0.9; }
    .main-wrapper { display: grid; grid-template-columns: 180px 1fr; min-height: calc(100vh - 120px); gap: 0; }
    .sidebar { background: white; padding: 1.5rem 1rem; border-right: 1px solid #eee; overflow-y: auto; }
    .date-btn { display: block; width: 100%; padding: 10px 12px; font-size: 13px; border: none; background: transparent; color: #333; cursor: pointer; text-align: left; border-radius: 4px; margin-bottom: 4px; transition: all 0.2s; }
    .date-btn:hover { background: #f0f0f0; }
    .date-btn.active { background: #FF9500; color: white; font-weight: 600; }
    .content { padding: 1.5rem; max-width: 900px; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-bottom: 1.5rem; }
    .stat-card { background: white; padding: 1rem; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center; }
    .stat-card p:first-child { font-size: 12px; color: #666; text-transform: uppercase; font-weight: 600; margin-bottom: 8px; }
    .stat-card p:last-child { font-size: 24px; font-weight: 700; color: #FF9500; margin: 0; }
    .sort-section { margin-bottom: 1.5rem; }
    .section-label { font-size: 12px; color: #666; text-transform: uppercase; font-weight: 600; margin-bottom: 10px; display: block; }
    .sort-filters { display: flex; gap: 8px; flex-wrap: wrap; }
    .sort-btn { padding: 8px 14px; font-size: 13px; border: none; border-radius: 20px; background: white; color: #333; cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,0.1); transition: all 0.2s; white-space: nowrap; }
    .sort-btn:hover { background: #f0f0f0; }
    .sort-btn.active { background: #FF9500; color: white; font-weight: 600; }
    .leaderboard { background: white; border-radius: 8px; padding: 1rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .tech-row { padding: 1rem; margin-bottom: 8px; border-radius: 6px; background: #fafafa; display: flex; align-items: center; gap: 12px; }
    .tech-row:last-child { margin-bottom: 0; }
    .rank { min-width: 35px; text-align: center; font-size: 18px; font-weight: 700; color: #FF9500; }
    .tech-info { flex: 1; }
    .tech-name { font-size: 14px; font-weight: 600; color: #333; margin: 0; }
    .tech-stats { font-size: 12px; color: #999; margin: 4px 0 0 0; }
    .revenue { text-align: right; }
    .revenue p { font-size: 16px; font-weight: 700; color: #FF9500; margin: 0; }
    .loading { text-align: center; padding: 2rem; color: #666; }
    .error { background: #ffebee; color: #c62828; padding: 1rem; border-radius: 8px; margin: 1rem 0; }
    .footer { text-align: center; font-size: 11px; color: #999; padding: 1rem; }
    @media (max-width: 768px) {
      .main-wrapper { grid-template-columns: 1fr; }
      .sidebar { border-right: none; border-bottom: 1px solid #eee; padding: 1rem; display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 8px; }
      .date-btn { margin-bottom: 0; }
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
        <div class="stat-card"><p>Total Revenue</p><p>$0</p></div>
        <div class="stat-card"><p>Avg Ticket</p><p>$0</p></div>
        <div class="stat-card"><p>Total Jobs</p><p>0</p></div>
      </div>
      <div class="sort-section">
        <label class="section-label">Sort By</label>
        <div class="sort-filters" id="sortFilters">
          <button class="sort-btn active" data-sort="revenue">Revenue</button>
          <button class="sort-btn" data-sort="ticket">Avg Ticket</button>
          <button class="sort-btn" data-sort="jobs">Jobs</button>
        </div>
      </div>
      <div class="leaderboard" id="leaderboard"></div>
    </div>
  </div>
  <div class="footer">
    Updates every 5 minutes • Last updated: <span id="lastUpdate">Never</span>
  </div>

  <script>
    let currentData = null;
    let currentSort = 'revenue';
    let currentTimeRange = 'month';

    const dateRanges = [
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

    // Build sidebar
    const sidebar = document.getElementById('dateSidebar');
    dateRanges.forEach(range => {
      const btn = document.createElement('button');
      btn.className = 'date-btn' + (range.key === 'month' ? ' active' : '');
      btn.textContent = range.label;
      btn.dataset.range = range.key;
      btn.addEventListener('click', function() {
        currentTimeRange = this.dataset.range;
        document.querySelectorAll('.date-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        fetchData();
      });
      sidebar.appendChild(btn);
    });

    document.querySelectorAll('.sort-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        currentSort = this.dataset.sort;
        document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        render();
      });
    });

    function getDateRange(range) {
      const now = new Date();
      let start, end, label;

      const getDayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const getDayEnd = (d) => { const e = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1); return e; };

      switch(range) {
        case 'day':
          start = getDayStart(now);
          end = getDayEnd(now);
          label = 'Today';
          break;
        case 'yesterday':
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          start = getDayStart(yesterday);
          end = getDayEnd(yesterday);
          label = 'Yesterday';
          break;
        case 'week':
          start = new Date(now);
          start.setDate(now.getDate() - now.getDay());
          end = new Date(start);
          end.setDate(end.getDate() + 7);
          label = 'This Week';
          break;
        case 'wtd':
          start = new Date(now);
          start.setDate(now.getDate() - now.getDay());
          end = getDayEnd(now);
          label = 'Week to Date';
          break;
        case 'l7d':
          start = new Date(now);
          start.setDate(now.getDate() - 7);
          end = getDayEnd(now);
          label = 'Last 7 Days';
          break;
        case 'l14d':
          start = new Date(now);
          start.setDate(now.getDate() - 14);
          end = getDayEnd(now);
          label = 'Last 14 Days';
          break;
        case 'l30d':
          start = new Date(now);
          start.setDate(now.getDate() - 30);
          end = getDayEnd(now);
          label = 'Last 30 Days';
          break;
        case 'mtd':
          start = new Date(now.getFullYear(), now.getMonth(), 1);
          end = getDayEnd(now);
          label = 'Month to Date';
          break;
        case 'lm':
          const lastMonth = new Date(now);
          lastMonth.setMonth(lastMonth.getMonth() - 1);
          start = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
          end = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 1);
          label = 'Last Month';
          break;
        case 'l90d':
          start = new Date(now);
          start.setDate(now.getDate() - 90);
          end = getDayEnd(now);
          label = 'Last 90 Days';
          break;
        case 'qtd':
          const quarter = Math.floor(now.getMonth() / 3);
          start = new Date(now.getFullYear(), quarter * 3, 1);
          end = getDayEnd(now);
          label = 'Quarter to Date';
          break;
        case 'lq':
          const lastQuarter = Math.floor(now.getMonth() / 3) - 1;
          start = new Date(now.getFullYear(), lastQuarter * 3, 1);
          end = new Date(now.getFullYear(), (lastQuarter + 1) * 3, 1);
          label = 'Last Quarter';
          break;
        case 'q2d':
          const q = Math.floor(now.getMonth() / 3);
          start = new Date(now.getFullYear(), q * 3, 1);
          end = getDayEnd(now);
          label = 'Quarter to Date';
          break;
        case 'ytd':
          start = new Date(now.getFullYear(), 0, 1);
          end = getDayEnd(now);
          label = 'Year to Date';
          break;
        case 'l365d':
          start = new Date(now);
          start.setDate(now.getDate() - 365);
          end = getDayEnd(now);
          label = 'Last 365 Days';
          break;
        case 'ly':
          const lastYear = new Date(now);
          lastYear.setFullYear(lastYear.getFullYear() - 1);
          start = new Date(lastYear.getFullYear(), 0, 1);
          end = new Date(lastYear.getFullYear(), 11, 31);
          label = 'Last Year';
          break;
        default:
          start = new Date(now.getFullYear(), now.getMonth(), 1);
          end = getDayEnd(now);
          label = 'This Month';
      }

      return { start, end, label };
    }

    async function fetchData() {
      try {
        const response = await fetch('/api/metrics?range=' + currentTimeRange);
        const data = await response.json();
        currentData = data;
        render();
      } catch (error) {
        document.getElementById('leaderboard').innerHTML = '<div class="error">Error loading data. Check API key.</div>';
      }
    }

    function render() {
      if (!currentData) {
        document.getElementById('leaderboard').innerHTML = '<div class="loading">Loading...</div>';
        return;
      }

      const leaderboard = currentData.leaderboard;
      const summary = currentData.summary;

      document.getElementById('period').textContent = summary.period;

      const statsHtml = '<div class="stat-card"><p>Total Revenue</p><p>$' + summary.totalRevenue.toLocaleString() + '</p></div>' +
        '<div class="stat-card"><p>Avg Ticket</p><p>$' + summary.averageTicket.toLocaleString() + '</p></div>' +
        '<div class="stat-card"><p>Total Jobs</p><p>' + summary.totalJobs + '</p></div>';
      document.getElementById('stats').innerHTML = statsHtml;

      let sorted = JSON.parse(JSON.stringify(leaderboard));
      if (currentSort === 'revenue') sorted.sort((a, b) => b.monthlyRevenue - a.monthlyRevenue);
      if (currentSort === 'ticket') sorted.sort((a, b) => b.averageTicket - a.averageTicket);
      if (currentSort === 'jobs') sorted.sort((a, b) => b.jobsCompleted - a.jobsCompleted);

      const medals = ['🥇', '🥈', '🥉'];
      const html = sorted.map((tech, idx) => {
        const medal = medals[idx] || ('#' + (idx + 1));
        const jobWord = tech.jobsCompleted !== 1 ? 'jobs' : 'job';
        return '<div class="tech-row">' +
          '<div class="rank">' + medal + '</div>' +
          '<div class="tech-info">' +
          '<p class="tech-name">' + tech.name + '</p>' +
          '<p class="tech-stats">' + tech.jobsCompleted + ' ' + jobWord + ' • Avg: $' + tech.averageTicket.toLocaleString() + '</p>' +
          '</div>' +
          '<div class="revenue"><p>$' + tech.monthlyRevenue.toLocaleString() + '</p></div>' +
          '</div>';
      }).join('');

      document.getElementById('leaderboard').innerHTML = html || '<div class="loading">No data yet</div>';
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
    const range = req.query.range || 'month';
    const now = new Date();
    let periodStart, periodEnd, periodLabel;

    const getDayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const getDayEnd = (d) => { const e = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1); return e; };

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
      default:
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
        periodEnd = getDayEnd(now);
        periodLabel = 'This Month';
    }

    const headers = {
      'Authorization': API_KEY,
      'Accept': 'application/json'
    };

    console.log('Fetching employees from: ' + BASE_URL + '/employees');
    const employeesRes = await axios.get(BASE_URL + '/employees', { headers });
    const employees = employeesRes.data.employees || [];
    console.log('Got ' + employees.length + ' employees');

    console.log('Fetching jobs from: ' + BASE_URL + '/jobs');
    const jobsRes = await axios.get(BASE_URL + '/jobs', { 
      headers,
      params: {
        status: 'completed',
        start_date: periodStart.toISOString().split('T')[0],
        end_date: periodEnd.toISOString().split('T')[0]
      }
    });
    const jobs = jobsRes.data.jobs || [];
    console.log('Got ' + jobs.length + ' jobs');

    const techMetrics = {};
    jobs.forEach(job => {
      const techId = job.assigned_employee_id || job.employee_id;
      if (!techId) return;

      if (!techMetrics[techId]) {
        const techInfo = employees.find(e => e.id === techId);
        const techName = techInfo ? (techInfo.first_name + ' ' + techInfo.last_name) : 'Unknown';
        techMetrics[techId] = {
          id: techId,
          name: techName,
          revenue: 0,
          jobs: 0
        };
      }

      const jobRevenue = parseFloat(job.total || job.amount || 0);
      techMetrics[techId].revenue += jobRevenue;
      techMetrics[techId].jobs += 1;
    });

    const leaderboard = Object.values(techMetrics)
      .map(tech => ({
        id: tech.id,
        name: tech.name,
        monthlyRevenue: Math.round(tech.revenue),
        jobsCompleted: tech.jobs,
        averageTicket: tech.jobs > 0 ? Math.round(tech.revenue / tech.jobs) : 0
      }))
      .sort((a, b) => b.monthlyRevenue - a.monthlyRevenue);

    const totalRevenue = leaderboard.reduce((sum, t) => sum + t.monthlyRevenue, 0);
    const totalJobs = leaderboard.reduce((sum, t) => sum + t.jobsCompleted, 0);
    const avgTicket = totalJobs > 0 ? Math.round(totalRevenue / totalJobs) : 0;

    res.json({
      leaderboard,
      summary: {
        totalRevenue,
        totalJobs,
        averageTicket: avgTicket,
        period: periodLabel
      }
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
