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
    // Each cipher cell randomizes on every tick. Name cells roll A–Z,
    // numeric cells roll 0–9. Reads as "the system is computing."
    document.querySelectorAll('.skel-cipher').forEach(function(el) {
      var len = parseInt(el.dataset.len) || 6;
      var isLetters = el.classList.contains('skel-cipher--letters');
      el.textContent = isLetters ? letterStr(len) : cipherStr(len);
    });
  }, 85);
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
    html +=
      '<tr class="skel-row">' +
        '<td><div class="tech-cell">' +
          '<div class="skel skel-avatar"></div>' +
          '<span class="skel-cipher skel-cipher--letters" data-len="' + nL + '">' + letterStr(nL) + '</span>' +
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

var _fetchAbort = null;     // AbortController for the currently in-flight fetch

async function fetchData() {
  // Abort any previous in-flight fetch — the newer request supersedes it.
  // This lets users click a new range immediately after an accidental
  // click, instead of waiting for the old fetch to complete.
  if (_fetchAbort) _fetchAbort.abort();
  var thisAbort = _fetchAbort = new AbortController();

  isFetching = true;
  // Delay skeleton — cache hits return in <100ms so the user never sees
  // a flicker. Only show skeleton if the request is genuinely slow.
  if (_skelTimer) clearTimeout(_skelTimer);
  _skelTimer = setTimeout(showTechSkeleton, SKELETON_DELAY_MS);

  try {
    var response = await fetch('/api/metrics?range=' + currentTimeRange, { signal: thisAbort.signal });
    var data = await response.json();
    // Ignore response if this fetch was superseded by a newer one
    if (thisAbort !== _fetchAbort) return;
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
    // Aborted fetches throw AbortError — that's expected (user clicked
    // a different range). Silently skip; the newer fetch handles the UI.
    if (err.name === 'AbortError') return;
    clearTimeout(_skelTimer); _skelTimer = null;
    teardownLoadingUI();
    document.getElementById('leaderboardBody').innerHTML =
      '<tr><td colspan="4"><div class="error-msg">Error loading data. Check API key and server logs.</div></td></tr>';
  } finally {
    // Only clear the "fetching" state if THIS fetch is the currently
    // tracked one (not if we were superseded).
    if (thisAbort === _fetchAbort) {
      isFetching = false;
      _fetchAbort = null;
    }
  }
}

/* Scramble-then-lock reveal for a technician's name. For each character
   position (left → right): flash one random letter (matched to the
   FINAL character's case — so "John" scrambles as "J"→letter→"o"→
   letter→…, never flips uppercase→lowercase at the end). Then lock
   the real character. Once all positions are locked, swap in the
   final display HTML (with the responsive nested spans).
     el         — the <span> being animated
     finalName  — plain text full name (properly cased)
     finalHtml  — HTML to install once reveal completes
     opts       — { flashMs, stepMs } */
function revealName(el, finalName, finalHtml, opts) {
  opts = opts || {};
  var FLASH = opts.flashMs || 55;       // ms random letter stays visible
  var STEP  = opts.stepMs  || 90;       // ms between successive positions
  var UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var LOWER = 'abcdefghijklmnopqrstuvwxyz';
  // Build the target string preserving case; non-letter chars that
  // aren't spaces / hyphens / apostrophes are dropped.
  var target = (finalName || '').replace(/[^A-Za-z\s\-']/g, '');
  var len    = target.length;
  if (!len) { el.innerHTML = finalHtml; return; }
  var locked = '';
  // Return a random letter whose case matches the given target char
  function randLike(ch) {
    var isUpper = ch >= 'A' && ch <= 'Z';
    var pool = isUpper ? UPPER : LOWER;
    return pool.charAt(Math.floor(Math.random() * 26));
  }
  function stepChar(i) {
    if (i >= len) {
      el.innerHTML = finalHtml;
      return;
    }
    var realChar = target.charAt(i);
    // For non-letter chars (space, dash, apostrophe) skip the flash and
    // lock immediately — a random letter there would look weird.
    if (!/[A-Za-z]/.test(realChar)) {
      locked += realChar;
      el.textContent = locked;
      setTimeout(function() { stepChar(i + 1); }, Math.max(0, STEP - FLASH));
      return;
    }
    // Flash a random letter at this position, case-matched to the real char
    el.textContent = locked + randLike(realChar);
    setTimeout(function() {
      // Lock the real character and pause before advancing to the next slot
      locked += realChar;
      el.textContent = locked;
      setTimeout(function() { stepChar(i + 1); }, Math.max(0, STEP - FLASH));
    }, FLASH);
  }
  stepChar(0);
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
      '<div class="stat-label">Total Value Created</div>' +
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
    // Name starts blank so revealName() can scramble-and-lock each
    // character left-to-right, then swap in the proper nested
    // responsive spans once the final char resolves.
    var finalNameHtml =
      '<span class="tech-name-full">' + esc(tech.name) + '</span>' +
      '<span class="tech-name-short">' + firstName + '</span>';
    return '<tr data-idx="' + idx + '" data-name="' + esc(tech.name) + '">' +
      '<td><div class="tech-cell">' +
        '<div class="avatar" style="background:' + color.bg + ';color:' + color.fg + '">' + av + '</div>' +
        rankHtml +
        '<span class="tech-name-label"' +
          ' data-reveal-name="' + esc(tech.name) + '"' +
          ' data-reveal-html="' + esc(finalNameHtml) + '">' +
          /* Invisible placeholder reserves the FINAL rendered width
             from the very first paint — before the staggered reveal
             begins. Without this, each row's name reveal lands 50ms
             after the previous, and as each longer-named row finishes
             the entire column widens, shoving the revenue column to
             the right (desktop-visible glitch). The span contains
             BOTH .tech-name-full and .tech-name-short, so at any
             breakpoint the naturally-visible child sizes the cell.
             revealName() overwrites this via textContent once the
             scramble starts; by then the minWidth lock is in place. */
          '<span class="tech-name-spacer" aria-hidden="true">' + finalNameHtml + '</span>' +
        '</span>' +
      '</div></td>' +
      '<td><span class="row-count' + (idx === 0 ? ' is-winner' : '') + '" data-kind="dollar" data-val="' + tech.monthlyRevenue + '">$0</span></td>' +
      '<td class="' + ticketClass + '"><span class="row-count" data-kind="dollar" data-val="' + tech.averageTicket + '">$0</span></td>' +
      '<td><span class="row-count" data-kind="int" data-val="' + tech.jobsCompleted + '">0</span></td>' +
      '</tr>';
  }).join('');

  document.getElementById('leaderboardBody').innerHTML = rows ||
    '<tr><td colspan="4" style="text-align:center;color:#aaa;padding:2rem">No completed jobs in this period</td></tr>';

  // Run FLIP animation on the NEW DOM using the OLD positions
  playFlipReorder(oldRects);

  /* Pre-lock every name label's width to its FINAL rendered name size in
     a single synchronous pass, BEFORE any per-row timeouts fire. This is
     what keeps the Value Created column from jitter-shifting during the
     staggered reveal.

     Why we can't rely on the .tech-name-spacer alone: the spacer reserves
     width inside the label, but during scramble we write directly to the
     label's textContent, which wipes the spacer out. At that point only
     the currently-typed substring + the typewriter caret (::after) size
     the label. Near the end of each row's scramble, "near-full-name" +
     caret can exceed the would-be final width, pushing the label past
     its min-width lock and widening the column.

     The fix is twofold:
       (1) Do the measurement up front, once per row, in the same tick
           that we set innerHTML — no per-row setTimeout races, no
           measuring while font metrics are still settling under the
           FLIP reorder's forced reflow.
       (2) Use a FIXED `width` (not `min-width`) so the box is capped,
           not just floored. Overflow stays visible, so the caret can
           extend past the box visually without triggering layout. The
           column width is determined entirely by these locked boxes
           and never changes during the reveal. */
  document.querySelectorAll('#leaderboardBody tr[data-idx] .tech-name-label').forEach(function(lbl) {
    var spacer = lbl.querySelector('.tech-name-spacer');
    // The spacer already holds the final nested responsive HTML (full +
    // short spans) and inherits identical typography from the label. Its
    // offsetWidth is the exact width the label will occupy once the real
    // name is rendered — on desktop or mobile, whichever span the media
    // query currently shows.
    var w = spacer ? spacer.offsetWidth : 0;
    if (w > 0) {
      lbl.style.width       = w + 'px';
      lbl.style.display     = 'inline-block';
      lbl.style.whiteSpace  = 'nowrap';
      // overflow defaults to visible — caret can render past the locked
      // box without shifting the column.
    }
  });

  /* Staggered row reveal: each row starts 50ms after the previous.
     Runs TWO animations in parallel per row —
       (1) Name scramble-and-lock: flash a random A–Z at each slot,
           then lock the real character. Visually continues the cipher.
       (2) Numeric count-up: 700ms per cell with easeOutCubic. */
  document.querySelectorAll('#leaderboardBody tr[data-idx]').forEach(function(row, rowIdx) {
    var delay = rowIdx * 50;
    setTimeout(function() {
      // Name reveal — the label span itself is the animation target.
      // During scramble its textContent is overwritten directly; once
      // the final char locks, innerHTML is replaced with the proper
      // nested responsive spans (tech-name-full + tech-name-short).
      // The label's width was already locked above, so scramble can
      // freely overwrite textContent without affecting column width.
      var lbl = row.querySelector('.tech-name-label');
      if (lbl) {
        var fullNm = lbl.getAttribute('data-reveal-name') || '';
        var htm    = lbl.getAttribute('data-reveal-html') || fullNm;
        // On mobile the final render hides .tech-name-full and only shows
        // first name via .tech-name-short — so scramble just the first
        // name to match. Otherwise the animation reveals "John Smith"
        // then pops to "John" when the final HTML swaps in. Breakpoint
        // mirrors the `max-width: 768px` rule in styles.css.
        var isMobile = window.innerWidth <= 768;
        var nm = isMobile ? fullNm.trim().split(/\s+/)[0] : fullNm;

        // Apply cipher-style monospace ON the label during reveal,
        // removed at completion via innerHTML replace (nested spans
        // don't carry the reveal class so the style drops off).
        lbl.classList.add('is-revealing');
        revealName(lbl, nm, htm);
        // Strip the reveal styling once the swap completes. Release
        // the width lock too, so subsequent viewport resizes (rotation,
        // window drag) can reflow naturally — by this point the final
        // nested-span HTML is in place and its natural width matches
        // the locked width, so the release is seamless.
        var totalMs = (nm.length + 1) * 90 + 60;
        setTimeout(function() {
          lbl.classList.remove('is-revealing');
          lbl.style.width      = '';
          lbl.style.display    = '';
          lbl.style.whiteSpace = '';
        }, totalMs);
      }
      // Numeric count-up
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
