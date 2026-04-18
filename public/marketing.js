// ── Marketing ───────────────────────────────────────────────────
var marketingData = null;
var qboData = null; // null=not fetched, {connected:false}=unavailable, {connected:true,...}=ready
var _ttLoader = null; // teletype loader handle (first-visit loading UI)

async function fetchQBOMarketing() {
  try {
    var resp = await fetch('/api/qbo-marketing');
    qboData = await resp.json();
  } catch(e) {
    qboData = { connected: false, reason: 'error' };
  }
  if (marketingData) renderMarketing();
}

/* ── "Architect's Draft" loading state ──────────────────────────
   Minimalist paper-drafting aesthetic. No scrolling streams, no
   digital noise — just an SVG geometric drafting figure (concentric
   rings + crosshair + rotating diagonal spokes) drawn in graphite
   pencil over a warm radial vignette, a single centered tagline
   with a hand-dragged sunflower highlighter behind "Marketing
   Ledger", and a clean "N / target accounts" tally that cross-fades
   on each update. The entire composition is quiet by design —
   complexity is implied through precision geometry, not visual
   clutter.
     .destroy()    — tear down all timers (used on error paths)
     .finalize(cb) — fade out + fire `cb` when safe to mount */
function startLedgerLoader(container) {
  if (_ttLoader) _ttLoader.destroy();

  var isMobile = window.innerWidth <= 768;

  // Plausible account-count ceiling that the tally climbs toward.
  // Random within 28k–40k so the UI feels specific to this run;
  // climb rate (~170/sec) keeps the "current / total" ratio visible
  // in the 5–25% band during typical load windows.
  var totalTarget = 28000 + Math.floor(Math.random() * 12000);
  var totalStr    = totalTarget.toLocaleString();

  // ── SVG drafting figure ───────────────────────────────────────
  // viewBox 0 0 220 220, centered at (110, 110). Four concentric
  // rings (r = 95 / 70 / 45 / 22) intersected by a horizontal +
  // vertical crosshair and two diagonal spokes that rotate as a
  // group. Cardinal "registration" dots anchor the four compass
  // points of the outer ring.
  //
  // Each stroke element is drawn in via stroke-dashoffset keyframes
  // (see llDraw* in marketing-paper.css). After draw-in completes,
  // the whole figure breathes (scale 1 → 1.03 → 1 on a 7s cycle)
  // and the spokes rotate at a slow, independent cadence.
  //
  // Mobile: rings 1 & 3 are hidden via CSS media query (keeps the
  // paper's negative space visible — a denser figure reads as
  // "mechanical noise" on a 375px-wide viewport). The whole SVG
  // also scales down ~30% through its container width. */
  var svgHtml =
    '<svg class="ll-draft" viewBox="0 0 220 220" aria-hidden="true" focusable="false">' +
      '<g class="ll-draft-figure">' +
        // Concentric rings — drawn from outside in
        '<circle class="ll-draft-ring ll-draft-ring--1" cx="110" cy="110" r="95"/>' +
        '<circle class="ll-draft-ring ll-draft-ring--2" cx="110" cy="110" r="70"/>' +
        '<circle class="ll-draft-ring ll-draft-ring--3" cx="110" cy="110" r="45"/>' +
        '<circle class="ll-draft-ring ll-draft-ring--4" cx="110" cy="110" r="22"/>' +
        // Static crosshair through center
        '<line class="ll-draft-line ll-draft-line--h" x1="15"  y1="110" x2="205" y2="110"/>' +
        '<line class="ll-draft-line ll-draft-line--v" x1="110" y1="15"  x2="110" y2="205"/>' +
        // Rotating diagonal spokes — transform-origin: center, the
        // group spins continuously after the draw-in completes
        '<g class="ll-draft-spokes">' +
          '<line class="ll-draft-line ll-draft-line--d1" x1="45"  y1="45"  x2="175" y2="175"/>' +
          '<line class="ll-draft-line ll-draft-line--d2" x1="175" y1="45"  x2="45"  y2="175"/>' +
        '</g>' +
        // Cardinal registration dots on outer ring
        '<circle class="ll-draft-tick" cx="110" cy="15"  r="2"/>' +
        '<circle class="ll-draft-tick" cx="205" cy="110" r="2"/>' +
        '<circle class="ll-draft-tick" cx="110" cy="205" r="2"/>' +
        '<circle class="ll-draft-tick" cx="15"  cy="110" r="2"/>' +
      '</g>' +
    '</svg>';

  container.innerHTML =
    '<div class="ledger-loader ledger-loader--draft" id="ttLoader">' +
      '<div class="ll-vignette" aria-hidden="true"></div>' +
      '<div class="ll-overlay">' +
        svgHtml +
        '<div class="ll-title">' +
          'Reconciling ' +
          '<span class="ll-highlight">Marketing Ledger</span>' +
        '</div>' +
        '<div class="ll-tally">' +
          '<span class="ll-tally-num" id="llTallyNum">0</span>' +
          '<span class="ll-tally-sep">/</span>' +
          '<span class="ll-tally-total">' + totalStr + '</span>' +
          '<span class="ll-tally-unit">accounts</span>' +
        '</div>' +
      '</div>' +
    '</div>';

  var rootEl  = container.querySelector('#ttLoader');
  var tallyEl = container.querySelector('#llTallyNum');

  // ── Tally with cross-fade ──────────────────────────────────────
  // A 150ms opacity transition on the num element, combined with a
  // ~220ms update cadence (throttled, not per-RAF), gives a smooth
  // "cross-fade on each update" feel without the DOM churn of
  // layering two number nodes. Rate is ~170/sec so numbers visibly
  // advance; tabular-nums keeps column widths locked.
  var startTs        = performance.now();
  var lastPaintedTs  = 0;
  var destroyed      = false;
  var rafId          = null;
  var lastValue      = 0;
  var UPDATE_MS      = 220; // cadence that plays nicely with 150ms fade

  function tickTally(ts) {
    if (destroyed) return;
    var elapsed = ts - startTs;
    var rate    = 170 + Math.sin(elapsed / 850) * 50;  // ~120–220/sec
    var value   = Math.min(totalTarget - 1, Math.floor(elapsed / 1000 * rate));
    if (ts - lastPaintedTs >= UPDATE_MS && value !== lastValue && tallyEl) {
      lastPaintedTs = ts;
      // Brief dip → update → restore. The CSS transition on opacity
      // (150ms) interpolates the fade; the rAF on the way back
      // guarantees the class toggle ticks across separate frames.
      tallyEl.classList.add('is-ticking');
      tallyEl.textContent = value.toLocaleString();
      requestAnimationFrame(function() {
        if (!destroyed && tallyEl) tallyEl.classList.remove('is-ticking');
      });
      lastValue = value;
    }
    rafId = requestAnimationFrame(tickTally);
  }
  rafId = requestAnimationFrame(tickTally);

  return {
    destroy: function() {
      destroyed = true;
      if (rafId) cancelAnimationFrame(rafId);
    },
    finalize: function(onComplete) {
      if (destroyed) { if (onComplete) onComplete(); return; }
      destroyed = true;
      if (rafId) cancelAnimationFrame(rafId);

      // Overlay fades + whole loader cross-fades out so the real
      // dashboard underneath can mount.
      rootEl.classList.add('ll-focusing');
      setTimeout(function() {
        rootEl.classList.add('ll-done');
        setTimeout(function() {
          if (onComplete) onComplete();
        }, 180);
      }, 360);
    }
  };
}

async function fetchMarketing() {
  var container = document.getElementById('marketingContent');
  _ttLoader = startLedgerLoader(container);
  try {
    var resp = await fetch('/api/marketing');
    var data = await resp.json();
    if (!resp.ok || data.error) {
      _ttLoader.destroy();
      container.innerHTML =
        '<div class="error-msg">Error: ' + esc(data.error || 'Unknown error') + '</div>';
      return;
    }
    marketingData = data;
    // Orchestrate the "data snap": let the teletype play its success
    // line + fade-out, then mount the dashboard with a slide-up so
    // the transition from processing → reviewing feels intentional.
    _ttLoader.finalize(function() {
      renderMarketing();
      container.classList.add('mkt-mount-in');
      setTimeout(function() { container.classList.remove('mkt-mount-in'); }, 650);
    });
  } catch(e) {
    if (_ttLoader) _ttLoader.destroy();
    container.innerHTML =
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
  var pct = proj.projectedJobs > 0 ? Math.min(Math.round(proj.jobsMtd / proj.projectedJobs * 100), 100) : 0;
  var wdElapsed = proj.wdElapsed || proj.daysElapsed;
  var wdTotal   = proj.wdTotal   || proj.totalDays;
  var wdLeft    = proj.wdLeft    != null ? proj.wdLeft : proj.daysLeft;
  var projHTML =
    '<div class="proj-cards">' +
      '<div class="proj-card"><div class="proj-card-label">Jobs This Month</div><div class="proj-card-value">' + proj.jobsMtd + '</div><div class="proj-card-sub">' + wdElapsed + ' of ' + wdTotal + ' workdays</div></div>' +
      '<div class="proj-card"><div class="proj-card-label">Projected Jobs</div><div class="proj-card-value">' + proj.projectedJobs + '</div><div class="proj-card-sub">by end of month</div></div>' +
      '<div class="proj-card"><div class="proj-card-label">Daily Rate</div><div class="proj-card-value">' + proj.dailyRate.toFixed(1) + '</div><div class="proj-card-sub">jobs / workday</div></div>' +
      '<div class="proj-card"><div class="proj-card-label">Workdays Left</div><div class="proj-card-value">' + wdLeft + '</div><div class="proj-card-sub">this month</div></div>' +
    '</div>' +
    '<div class="progress-wrap">' +
      '<div class="progress-label-row"><span>Month Progress</span><span>' + pct + '%</span></div>' +
      '<div class="progress-bar-bg"><div class="progress-bar-fill" style="width:' + pct + '%"></div></div>' +
    '</div>';

  // Bar chart — max bar height is smaller on mobile so values + labels fit inside the card
  var BAR_MAX_PX = window.innerWidth <= 768 ? 76 : 100;
  var effectiveJobs = history.map(function(m) {
    return m.isCurrent ? (proj.projectedJobs || m.jobs) : m.jobs;
  });
  var maxJobs = Math.max.apply(null, effectiveJobs) || 1;
  var bars = history.map(function(m, idx) {
    var displayJobs = effectiveJobs[idx];
    var h = Math.max(3, Math.round(displayJobs / maxJobs * BAR_MAX_PX));
    var isCur = m.isCurrent ? ' is-current' : '';
    // Height is the only inline style now. The projected (is-current)
    // bar gets its "pencil sketch" treatment — dashed border + faint
    // hatch — from the `.bar.is-current` CSS in marketing-paper.css,
    // so the look can stay on-theme instead of a hardcoded stripe.
    var barStyle = 'height:' + h + 'px';
    var valClass = m.isCurrent ? 'bar-val bar-val--proj' : 'bar-val';
    var valHtml  = m.isCurrent
      ? displayJobs + '<div class="bar-proj-tag">PROJ</div>'
      : (m.jobs > 0 ? m.jobs : '');
    return '<div class="bar-col">' +
      '<div class="' + valClass + '">' + valHtml + '</div>' +
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
    // Jobs cell: single horizontal row — number | delta.
    //   - .mkt-jobs-num has a fixed min-width (tabular-nums), so every
    //     row's number right-aligns to the SAME x regardless of what
    //     appears next to it.
    //   - .mkt-jobs-delta wrapper is ALWAYS emitted (even empty) so its
    //     reserved horizontal slot keeps the column geometry identical
    //     on rows with vs without a % change.
    //   - Projected (current-month) row gets a modifier class that
    //     italicizes the number in graphite + paints a sunflower-yellow
    //     highlighter behind it. The highlighter alone communicates
    //     "estimate" — no separate PROJ badge needed (the badge took
    //     extra horizontal space that pushed the projected row's number
    //     out of the column's vertical alignment with all other rows).
    var numClass = m.isCurrent ? 'mkt-jobs-num mkt-jobs-num--proj' : 'mkt-jobs-num';
    var jobsCell =
      '<div class="mkt-jobs-cell">' +
        '<span class="' + numClass + '">' + displayJobs + '</span>' +
        '<span class="mkt-jobs-delta">' + deltaJobs + '</span>' +
      '</div>';
    return '<tr' + rowClass + '>' +
      '<td>' + esc(m.fullLabel) + '</td>' +
      '<td>' + jobsCell + '</td>' +
      '<td>' + fmt(m.revenue) + '</td>' +
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
    '<div class="mkt-table-card"><div class="mkt-table-scroll"><table class="mkt-table">' +
      '<thead><tr><th>Month</th><th># Jobs</th><th>Revenue</th>' + qboHeaderCols + '</tr></thead>' +
      '<tbody>' + tableRows + '</tbody>' +
      // Footer total: plain text in the td. Both body rows and this
      // cell right-align to the same edge (the td's right padding), so
      // the numbers line up column-wise without any grid wrapper — the
      // new stacked body layout also right-aligns to the td edge.
      '<tfoot><tr><td>12-Month Total</td>' +
        '<td>' + totalHistJobs + '</td>' +
        '<td>' + fmt(totalHistRev) + '</td><td>' + footSpend + '</td><td>' + footCost + '</td></tr></tfoot>' +
    '</table></div></div>';

  document.getElementById('marketingContent').innerHTML = qboBanner + projHTML + chartHTML + tableHTML;
}
