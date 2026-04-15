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
    var firstName = esc(tech.name.trim().split(/\s+/)[0]);
    return '<tr data-idx="' + idx + '">' +
      '<td><div class="tech-cell">' +
        '<div class="avatar" style="background:' + color + '">' + av + '</div>' +
        rankHtml +
        '<span class="tech-name-label">' +
          '<span class="tech-name-full">' + esc(tech.name) + '</span>' +
          '<span class="tech-name-short">' + firstName + '</span>' +
        '</span>' +
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
