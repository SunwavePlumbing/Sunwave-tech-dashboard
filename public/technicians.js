/* ── Technicians dashboard renderer ─────────────────────────────
   Flow:
     fetchData()   → delayed skeleton → /api/metrics → render()
     render()      → count-up stats + FLIP-reorder leaderboard rows
   No more full-container overlay + spinner — skeletons maintain the
   page's structural rhythm while data is in flight. */

var SKELETON_DELAY_MS = 150;   // don't flash skeleton if cache returns fast
var _skelTimer = null;
var _prevSummary = null;       // remembers previous stat values for count-up
var _cipherId   = null;        // interval for rolling cipher digits
var _statusId   = null;        // interval for status phrase cycler

/* Short random monospace string of digits (used for revenue / ticket /
   jobs columns — those are numeric so digits read correctly). */
function cipherStr(len) {
  var chars = '0123456789';
  var out = '';
  for (var i = 0; i < len; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

/* Random uppercase-letter string used to seed the name-column
   typewriter effect. */
function letterStr(len) {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var out = '';
  for (var i = 0; i < len; i++) {
    out += chars.charAt(Math.floor(Math.random() * 26));
  }
  return out;
}

/* Loading phases shown above the table while data is in flight. Each
   one implies a different stage of work so the user experiences
   "heavy computation" rather than a single repetitive phrase. */
var STATUS_PHRASES = [
  'Fetching job records...',
  'Aggregating completed work...',
  'Crunching revenue per technician...',
  'Compiling leaderboard...',
  'Sorting by performance...'
];

function startCipherCycle() {
  stopCipherCycle();
  _cipherId = setInterval(function() {
    // Numeric columns — all digits re-randomize at once (rolling feel).
    document.querySelectorAll('.skel-cipher:not(.skel-typewriter)').forEach(function(el) {
      var len = parseInt(el.dataset.len) || 6;
      el.textContent = cipherStr(len);
    });
    // Name column — military-style typewriter: reveal one letter at a
    // time, hold the full string briefly, then wipe and start a new
    // random word. Each row drifts on its own schedule because its
    // initial progress is randomized at render time.
    document.querySelectorAll('.skel-typewriter').forEach(function(el) {
      var len     = parseInt(el.dataset.len) || 6;
      var target  = el.dataset.target || '';
      var progress = parseInt(el.dataset.progress) || 0;
      var hold     = parseInt(el.dataset.hold) || 0;
      if (!target || target.length !== len) {
        target = letterStr(len);
        el.dataset.target   = target;
        el.dataset.progress = '0';
        el.dataset.hold     = '0';
        el.textContent      = '';
        return;
      }
      if (progress < target.length) {
        // Type the next letter
        progress++;
        el.dataset.progress = String(progress);
        el.textContent      = target.substring(0, progress);
      } else if (hold < 10) {
        // Hold the full word for ~10 ticks (~800ms) so the eye can catch it
        el.dataset.hold = String(hold + 1);
      } else {
        // Reset — pick a fresh word, wipe screen
        target = letterStr(len);
        el.dataset.target   = target;
        el.dataset.progress = '0';
        el.dataset.hold     = '0';
        el.textContent      = '';
      }
    });
  }, 80);
}
function stopCipherCycle() {
  if (_cipherId) { clearInterval(_cipherId); _cipherId = null; }
}

function startStatusCycle() {
  stopStatusCycle();
  var idx = 0;
  var el = document.getElementById('techLoadingStatus');
  if (!el) return;
  el.textContent = STATUS_PHRASES[0];
  _statusId = setInterval(function() {
    idx = (idx + 1) % STATUS_PHRASES.length;
    el.classList.add('is-fading');
    setTimeout(function() {
      el.textContent = STATUS_PHRASES[idx];
      el.classList.remove('is-fading');
    }, 180);
  }, 1500);
}
function stopStatusCycle() {
  if (_statusId) { clearInterval(_statusId); _statusId = null; }
  var el = document.getElementById('techLoadingStatus');
  if (el) el.remove();
}

/* Build 3 skeleton stat cards matching the real card dimensions */
function statsSkeletonHtml() {
  var card =
    '<div class="stat-card">' +
      '<div class="skel skel-line skel-line--sm" style="width:60%"></div>' +
      '<div class="skel skel-line skel-line--xl" style="width:80%;margin-top:10px"></div>' +
    '</div>';
  return card + card + card;
}

/* Build N skeleton rows with rolling-cipher monospaced digits. Length
   varies between rows so it doesn't look like a grid of identical
   strings. Digits rotate ~12 times/sec via startCipherCycle(). */
function rowsSkeletonHtml(n) {
  n = n || 6;
  var nameLens    = [6, 8, 5, 7, 6, 8];
  var revenueLens = [5, 5, 6, 4, 5, 6];
  var ticketLens  = [4, 5, 4, 5, 4, 4];
  var jobsLens    = [2, 2, 1, 2, 2, 2];
  var html = '';
  for (var i = 0; i < n; i++) {
    var nL = nameLens[i % nameLens.length];
    var rL = revenueLens[i % revenueLens.length];
    var tL = ticketLens[i % ticketLens.length];
    var jL = jobsLens[i % jobsLens.length];
    // Seed each name cell with its own random target + progress offset
    // so rows don't all type in lockstep.
    var nameTarget   = letterStr(nL);
    var nameProgress = Math.floor(Math.random() * (nL + 1));
    html +=
      '<tr class="skel-row">' +
        '<td><div class="tech-cell">' +
          '<div class="skel skel-avatar"></div>' +
          '<span class="skel-cipher skel-typewriter" data-len="' + nL + '"' +
          ' data-target="' + nameTarget + '" data-progress="' + nameProgress + '" data-hold="0">' +
          nameTarget.substring(0, nameProgress) + '</span>' +
        '</div></td>' +
        '<td><span class="skel-cipher" data-len="' + rL + '">' + cipherStr(rL) + '</span></td>' +
        '<td><span class="skel-cipher" data-len="' + tL + '">' + cipherStr(tL) + '</span></td>' +
        '<td><span class="skel-cipher" data-len="' + jL + '">' + cipherStr(jL) + '</span></td>' +
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
  // Toggle container-level "breathing" pulse + status text
  var wrap = document.getElementById('tableWrapper');
  if (wrap) wrap.classList.add('is-loading');
  // Insert status phrase cycler above the table (once)
  if (!document.getElementById('techLoadingStatus')) {
    var status = document.createElement('div');
    status.id = 'techLoadingStatus';
    status.className = 'skel-status';
    wrap && wrap.parentNode.insertBefore(status, wrap);
  }
  startCipherCycle();
  startStatusCycle();
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
      teardownLoadingUI();
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
    teardownLoadingUI();
    document.getElementById('leaderboardBody').innerHTML =
      '<tr><td colspan="4"><div class="error-msg">Error loading data. Check API key and server logs.</div></td></tr>';
  } finally {
    isFetching = false;
  }
}

/* Tear down skeleton-era UI: stops the cipher and status intervals
   and removes the breathing-pulse class. Called from render() and
   from error paths. */
function teardownLoadingUI() {
  stopCipherCycle();
  stopStatusCycle();
  var wrap = document.getElementById('tableWrapper');
  if (wrap) wrap.classList.remove('is-loading');
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

  // Stop cipher/status first so no intervals keep running after reveal
  teardownLoadingUI();

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
    /* Wrap numeric values in spans tagged with the target value so they
       can be counted-up after render. Show $0 / 0 initially so the
       cascade visibly "fills in" each row. */
    return '<tr data-idx="' + idx + '" data-name="' + esc(tech.name) + '">' +
      '<td><div class="tech-cell">' +
        '<div class="avatar" style="background:' + color + '">' + av + '</div>' +
        rankHtml +
        '<span class="tech-name-label">' +
          '<span class="tech-name-full">' + esc(tech.name) + '</span>' +
          '<span class="tech-name-short">' + firstName + '</span>' +
        '</span>' +
      '</div></td>' +
      '<td><span class="row-count" data-kind="dollar" data-val="' + tech.monthlyRevenue + '">$0</span></td>' +
      '<td class="' + ticketClass + '"><span class="row-count" data-kind="dollar" data-val="' + tech.averageTicket + '">$0</span></td>' +
      '<td><span class="row-count" data-kind="int" data-val="' + tech.jobsCompleted + '">0</span></td>' +
      '</tr>';
  }).join('');

  document.getElementById('leaderboardBody').innerHTML = rows ||
    '<tr><td colspan="4" style="text-align:center;color:#aaa;padding:2rem">No completed jobs in this period</td></tr>';

  // Run FLIP animation on the NEW DOM using the OLD positions
  playFlipReorder(oldRects);

  /* Staggered row count-up: each row starts 50ms after the previous.
     700ms per row with easeOutCubic via countUpEl. Numbers spin up
     fast then gracefully settle into final values. */
  document.querySelectorAll('#leaderboardBody tr[data-idx]').forEach(function(row, rowIdx) {
    var delay = rowIdx * 50;
    setTimeout(function() {
      row.querySelectorAll('.row-count').forEach(function(el) {
        var target = parseFloat(el.getAttribute('data-val'));
        if (isNaN(target)) return;
        var kind = el.getAttribute('data-kind');
        var formatter = kind === 'dollar'
          ? function(v) { return '$' + Math.round(v).toLocaleString(); }
          : function(v) { return Math.round(v).toLocaleString(); };
        countUpEl(el, 0, target, 700, formatter);
      });
    }, delay);
  });

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
