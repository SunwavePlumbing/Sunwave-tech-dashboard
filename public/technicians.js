/* ── Technicians dashboard renderer ─────────────────────────────
   Flow:
     fetchData()   → delayed skeleton → /api/metrics → render()
     render()      → count-up stats + FLIP-reorder leaderboard rows
   No more full-container overlay + spinner — skeletons maintain the
   page's structural rhythm while data is in flight. */

var SKELETON_DELAY_MS = 150;   // don't flash skeleton if cache returns fast
var _skelTimer = null;
var _prevSummary = null;       // remembers previous stat values for count-up

/* Build 3 skeleton stat cards matching the real card dimensions */
function statsSkeletonHtml() {
  var card =
    '<div class="stat-card">' +
      '<div class="skel skel-line skel-line--sm" style="width:60%"></div>' +
      '<div class="skel skel-line skel-line--xl" style="width:80%;margin-top:10px"></div>' +
    '</div>';
  return card + card + card;
}

/* Build N skeleton rows matching the table row layout */
function rowsSkeletonHtml(n) {
  n = n || 6;
  var html = '';
  for (var i = 0; i < n; i++) {
    html +=
      '<tr class="skel-row">' +
        '<td><div class="tech-cell">' +
          '<div class="skel skel-avatar"></div>' +
          '<div class="skel skel-line" style="width:110px;height:13px"></div>' +
        '</div></td>' +
        '<td><div class="skel skel-line" style="width:60px;height:13px;margin-left:auto"></div></td>' +
        '<td><div class="skel skel-line" style="width:60px;height:13px;margin-left:auto"></div></td>' +
        '<td><div class="skel skel-line" style="width:30px;height:13px;margin-left:auto"></div></td>' +
      '</tr>';
  }
  return html;
}

function showTechSkeleton() {
  var prevRows = document.querySelectorAll('#leaderboardBody tr:not(.skel-row)').length;
  document.getElementById('stats').innerHTML = statsSkeletonHtml();
  document.getElementById('leaderboardBody').innerHTML =
    rowsSkeletonHtml(Math.max(prevRows, 6));
  document.getElementById('leaderboardFoot').innerHTML = '';
}

async function fetchData() {
  isFetching = true;
  // Delay skeleton — cache hits return in <100ms so the user never sees
  // a flicker. Only show skeleton if the request is genuinely slow.
  if (_skelTimer) clearTimeout(_skelTimer);
  _skelTimer = setTimeout(showTechSkeleton, SKELETON_DELAY_MS);

  try {
    var response = await fetch('/api/metrics?range=' + currentTimeRange);
    var data = await response.json();
    if (!response.ok || data.error) {
      clearTimeout(_skelTimer); _skelTimer = null;
      document.getElementById('leaderboardBody').innerHTML =
        '<tr><td colspan="4"><div class="error-msg">Error: ' + esc(data.error || 'Unknown error') + '</div></td></tr>';
      document.getElementById('leaderboardFoot').innerHTML = '';
      return;
    }
    clearTimeout(_skelTimer); _skelTimer = null;
    currentData = data;
    render();
  } catch (err) {
    clearTimeout(_skelTimer); _skelTimer = null;
    document.getElementById('leaderboardBody').innerHTML =
      '<tr><td colspan="4"><div class="error-msg">Error loading data. Check API key and server logs.</div></td></tr>';
  } finally {
    isFetching = false;
  }
}

/* Animate stat cards: count up from previous values (or 0 on first load)
   to the new ones. Keeps the card's existing DOM so CSS positions don't
   jump — only the inner text ticks. */
function animateStatCards(summary) {
  var prev = _prevSummary || { totalRevenue: 0, averageTicket: 0, totalJobs: 0 };
  var statsEl = document.getElementById('stats');
  statsEl.innerHTML =
    '<div class="stat-card">' +
      '<div class="stat-label">Total Revenue</div>' +
      '<div class="stat-value" id="statRev">$' + prev.totalRevenue.toLocaleString() + '</div>' +
    '</div>' +
    '<div class="stat-card">' +
      '<div class="stat-label">Avg Ticket</div>' +
      '<div class="stat-value" id="statAvg">$' + prev.averageTicket.toLocaleString() + '</div>' +
    '</div>' +
    '<div class="stat-card">' +
      '<div class="stat-label">Total Jobs</div>' +
      '<div class="stat-value" id="statJobs">' + prev.totalJobs.toLocaleString() + '</div>' +
    '</div>';

  var dollarFmt = function(v) { return '$' + Math.round(v).toLocaleString(); };
  var intFmt    = function(v) { return Math.round(v).toLocaleString(); };
  countUpEl(document.getElementById('statRev'),  prev.totalRevenue,   summary.totalRevenue,   450, dollarFmt);
  countUpEl(document.getElementById('statAvg'),  prev.averageTicket,  summary.averageTicket,  450, dollarFmt);
  countUpEl(document.getElementById('statJobs'), prev.totalJobs,      summary.totalJobs,      450, intFmt);

  _prevSummary = {
    totalRevenue:  summary.totalRevenue,
    averageTicket: summary.averageTicket,
    totalJobs:     summary.totalJobs
  };
}

/* FLIP reorder: before rerendering, capture each row's bounding rect by
   its technician name. After rerendering, compare to new positions and
   animate the delta. Keeps rows anchored during sort/data refresh so
   the user can track a specific row's movement. */
function captureRowRects() {
  var rects = {};
  document.querySelectorAll('#leaderboardBody tr[data-name]').forEach(function(row) {
    rects[row.dataset.name] = row.getBoundingClientRect().top;
  });
  return rects;
}
function playFlipReorder(oldRects) {
  if (!oldRects) return;
  document.querySelectorAll('#leaderboardBody tr[data-name]').forEach(function(row) {
    var oldTop = oldRects[row.dataset.name];
    if (oldTop == null) return;
    var newTop = row.getBoundingClientRect().top;
    var dy = oldTop - newTop;
    if (!dy) return;
    row.style.transition = 'none';
    row.style.transform  = 'translateY(' + dy + 'px)';
    // Force layout, then release to animate back to 0
    row.getBoundingClientRect();
    row.style.transition = 'transform 380ms cubic-bezier(0.32, 0.72, 0.24, 1)';
    row.style.transform  = 'translateY(0)';
  });
}

function render() {
  if (!currentData) return;
  var leaderboard = currentData.leaderboard;
  var summary = currentData.summary;

  var periodEl = document.getElementById('period');
  if (periodEl) periodEl.textContent = summary.period;

  // Stat cards: count-up animation
  animateStatCards(summary);

  // Capture current row positions BEFORE rerender (for FLIP)
  var oldRects = captureRowRects();

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
    return '<tr data-idx="' + idx + '" data-name="' + esc(tech.name) + '">' +
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

  // Run FLIP animation on the NEW DOM using the OLD positions
  playFlipReorder(oldRects);

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
