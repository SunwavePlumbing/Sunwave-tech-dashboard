const express = require('express');
const axios = require('axios');
const app = express();

const API_KEY = process.env.HOUSECALL_PRO_API_KEY;
const PORT = process.env.PORT || 3000;

// Serve the dashboard
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Sunwave Tech Dashboard</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #fafafa;
        }
        .header {
          background: #0D7A7D;
          color: white;
          padding: 1.5rem 1rem;
          text-align: center;
        }
        .header h1 {
          font-size: 28px;
          font-weight: 600;
          margin: 0 0 0.5rem 0;
        }
        .header p {
          margin: 0;
          font-size: 13px;
          opacity: 0.9;
        }
        .container {
          padding: 0 1rem;
          max-width: 600px;
          margin: 0 auto;
        }
        .stats {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 10px;
          margin: 1rem 0;
        }
        .stat-card {
          background: white;
          padding: 1rem;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          text-align: center;
        }
        .stat-card p:first-child {
          font-size: 12px;
          color: #666;
          text-transform: uppercase;
          font-weight: 600;
          margin-bottom: 8px;
        }
        .stat-card p:last-child {
          font-size: 24px;
          font-weight: 700;
          color: #0D7A7D;
          margin: 0;
        }
        .filters {
          display: flex;
          gap: 8px;
          margin: 1rem 0;
          overflow-x: auto;
          padding-bottom: 10px;
        }
        .filter-btn {
          padding: 8px 16px;
          font-size: 13px;
          border: none;
          border-radius: 20px;
          background: white;
          color: #333;
          cursor: pointer;
          white-space: nowrap;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          font-weight: 400;
          transition: all 0.2s;
        }
        .filter-btn.active {
          background: #0D7A7D;
          color: white;
          font-weight: 600;
        }
        .leaderboard {
          padding: 0 0 2rem 0;
        }
        .tech-row {
          background: white;
          padding: 1rem;
          margin-bottom: 10px;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .rank {
          min-width: 40px;
          text-align: center;
          font-size: 16px;
          font-weight: 700;
          color: #0D7A7D;
        }
        .tech-info {
          flex: 1;
        }
        .tech-name {
          font-size: 15px;
          font-weight: 600;
          color: #333;
          margin: 0;
        }
        .tech-stats {
          font-size: 12px;
          color: #999;
          margin: 4px 0 0 0;
        }
        .revenue {
          text-align: right;
        }
        .revenue p {
          font-size: 16px;
          font-weight: 700;
          color: #0D7A7D;
          margin: 0;
        }
        .loading {
          text-align: center;
          padding: 2rem;
          color: #666;
        }
        .error {
          background: #ffebee;
          color: #c62828;
          padding: 1rem;
          border-radius: 8px;
          margin: 1rem 0;
          font-size: 14px;
        }
        .footer {
          text-align: center;
          font-size: 11px;
          color: #999;
          padding: 1rem;
          background: white;
          border-top: 1px solid #eee;
          margin-top: 1rem;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Sunwave Performance</h1>
        <p id="month">Loading...</p>
      </div>

      <div class="container">
        <div class="stats" id="stats">
          <div class="stat-card"><p>Total Revenue</p><p>$0</p></div>
          <div class="stat-card"><p>Avg Ticket</p><p>$0</p></div>
          <div class="stat-card"><p>Total Jobs</p><p>0</p></div>
        </div>

        <div class="filters">
          <button class="filter-btn active" onclick="sortBy('revenue')">Revenue</button>
          <button class="filter-btn" onclick="sortBy('ticket')">Avg Ticket</button>
          <button class="filter-btn" onclick="sortBy('jobs')">Jobs</button>
        </div>

        <div class="leaderboard" id="leaderboard"></div>
      </div>

      <div class="footer">
        Updates every 5 minutes • Last updated: <span id="lastUpdate">Never</span>
      </div>

      <script>
        let currentData = null;
        let currentSort = 'revenue';

        async function fetchData() {
          try {
            const response = await fetch('/api/metrics');
            const data = await response.json();
            currentData = data;
            render();
          } catch (error) {
            document.getElementById('leaderboard').innerHTML = 
              '<div class="error">❌ Error loading data. Check API key.</div>';
            console.error(error);
          }
        }

        function render() {
          if (!currentData) {
            document.getElementById('leaderboard').innerHTML = '<div class="loading">Loading...</div>';
            return;
          }

          const { leaderboard, summary } = currentData;

          // Update header
          document.getElementById('month').textContent = summary.month;

          // Update stats
          const statsHtml = `
            <div class="stat-card"><p>Total Revenue</p><p>$${summary.totalRevenue.toLocaleString()}</p></div>
            <div class="stat-card"><p>Avg Ticket</p><p>$${summary.averageTicket.toLocaleString()}</p></div>
            <div class="stat-card"><p>Total Jobs</p><p>${summary.totalJobs}</p></div>
          `;
          document.getElementById('stats').innerHTML = statsHtml;

          // Sort leaderboard
          let sorted = [...leaderboard];
          if (currentSort === 'revenue') sorted.sort((a, b) => b.monthlyRevenue - a.monthlyRevenue);
          if (currentSort === 'ticket') sorted.sort((a, b) => b.averageTicket - a.averageTicket);
          if (currentSort === 'jobs') sorted.sort((a, b) => b.jobsCompleted - a.jobsCompleted);

          // Render leaderboard
          const medals = ['🥇', '🥈', '🥉'];
          const html = sorted.map((tech, idx) => {
            const medal = medals[idx] || `#${idx + 1}`;
            return \`
              <div class="tech-row">
                <div class="rank">\${medal}</div>
                <div class="tech-info">
                  <p class="tech-name">\${tech.name}</p>
                  <p class="tech-stats">\${tech.jobsCompleted} job\${tech.jobsCompleted !== 1 ? 's' : ''} • Avg: $\${tech.averageTicket.toLocaleString()}</p>
                </div>
                <div class="revenue">
                  <p>$\${tech.monthlyRevenue.toLocaleString()}</p>
                </div>
              </div>
            \`;
          }).join('');

          document.getElementById('leaderboard').innerHTML = html || '<div class="loading">No data yet</div>';
          document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
        }

        function sortBy(field) {
          currentSort = field;
          document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
          event.target.classList.add('active');
          render();
        }

        // Fetch on load and every 5 minutes
        fetchData();
        setInterval(fetchData, 5 * 60 * 1000);
      </script>
    </body>
    </html>
  `);
});

// API endpoint
app.get('/api/metrics', async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Fetch staff
    const staffRes = await axios.get('https://api.housecallpro.com/v1/staff', {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const staff = staffRes.data.data || [];

    // Fetch jobs
    const jobsRes = await axios.get('https://api.housecallpro.com/v1/jobs', {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      params: {
        status: 'completed',
        created_after: monthStart.toISOString(),
        created_before: monthEnd.toISOString()
      }
    });

    const jobs = jobsRes.data.data || [];

    // Aggregate
    const techMetrics = {};
    jobs.forEach(job => {
      const techId = job.assigned_staff_id || job.technician_id;
      if (!techId) return;

      if (!techMetrics[techId]) {
        const techInfo = staff.find(s => s.id === techId);
        techMetrics[techId] = {
          id: techId,
          name: techInfo?.name || 'Unknown',
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
        month: monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      }
    });

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Dashboard running on port ${PORT}`);
  console.log(`API Key configured: ${!!API_KEY}`);
});
