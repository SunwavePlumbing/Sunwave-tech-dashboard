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

/* ── Marketing loader — EVALUATION GALLERY ──────────────────────
   Temporary showcase of 10 loader concepts. Each cell plays its
   animation continuously + is numbered so the user can pick one.

   When the /api/marketing fetch finishes, finalize() stashes the
   onComplete callback instead of auto-dismissing, and a small
   "Continue to dashboard →" button appears so the user can jump
   past the gallery when ready. This prevents the gallery from
   disappearing on fast API responses before the user has had a
   chance to examine it.

   After the user picks a favorite, the 9 losers + this gallery
   wrapper will be replaced with just the winning animation. */
/* ── Marketing loader — EVALUATION GALLERY (reduced to 5) ───────
   Narrowed to the user's favorites:
     1. Isometric Bar Chart Ripple   (smoother retract on collapse)
     2. Slide-Rule Timeline          (rolling profit readout, no pause)
     3. Blueprint Calendar Tracker   (monthly calendar + live cost+rev tallies)
     4. Expanding Ledger Node        (smoother flow, profit ramps to $70K)
     5. Dial & Notch Tracker         (sweeping needle + rolling margin %)

   Each cell plays continuously so the user can evaluate. When the
   /api/marketing fetch finishes, finalize() queues the callback and
   unlocks the "Continue to dashboard →" button; clicking it dismisses
   the gallery and mounts the real dashboard. */
function startLedgerLoader(container) {
  if (_ttLoader) _ttLoader.destroy();

  // Single-animation loader (Topographical Ripple, chosen from the
  // prior evaluation gallery). The grid layout still works with one
  // cell; we just drop the "pick a favorite" chrome and let the
  // single animation fill the stage.
  container.innerHTML =
    '<div class="ledger-loader ledger-loader--solo" id="ttLoader">' +
      '<div class="lg-stage lg-stage--solo">' + lgSvg_4() + '</div>' +
      '<button type="button" class="lg-continue" id="lgContinue" onclick="_dismissLoaderGallery()">Continue to dashboard \u2192</button>' +
    '</div>';

  var rootEl      = container.querySelector('#ttLoader');
  var continueBtn = rootEl.querySelector('#lgContinue');
  var destroyed   = false;
  var pendingCb   = null;

  window._dismissLoaderGallery = function() {
    if (destroyed) return;
    destroyed = true;
    rootEl.classList.add('ll-done');
    setTimeout(function() {
      if (pendingCb) { var cb = pendingCb; pendingCb = null; cb(); }
    }, 320);
  };

  return {
    destroy: function() { destroyed = true; },
    finalize: function(onComplete) {
      if (destroyed) { if (onComplete) onComplete(); return; }
      pendingCb = onComplete;
      if (continueBtn) continueBtn.classList.add('is-ready');
    }
  };
}

/* ──────────────────────────────────────────────────────────────
   SVG builders — 5 variants, shared palette
     • Paper:      #FAF9F6 (card bg)
     • Charcoal:   #2C2A28  (structure / revenue)
     • Terracotta: #D17036  (expense)
     • Green:      #3CA04A / #5DBF69 (profit)
     • Graphite:   #7A7571  (faint guides)
   All animations loop continuously; see marketing-paper.css for
   keyframes.
   ────────────────────────────────────────────────────────────── */

/* Helper: vertical rolling ticker ("odometer" feel).
   Returns an SVG <g> with a clipPath window + a stack of text values
   inside a translate-animated group. Each value appears in sequence
   as the parent group scrolls up; CSS drives the translateY. */
function rollingTicker(opts) {
  // opts: { id, x, y, w, h, values[], fill, size, weight, anchor, className, delay }
  var lineH = opts.h;
  var texts = opts.values.map(function(v, i) {
    // Baseline y stacked one lineH apart so translate(-lineH) reveals next
    var ty = opts.y + 1 + i * lineH;
    return '<text x="' + opts.x + '" y="' + ty + '" fill="' + opts.fill + '" ' +
           'font-size="' + opts.size + '" font-family="ui-monospace, monospace" ' +
           'font-weight="' + (opts.weight || 700) + '" ' +
           'text-anchor="' + (opts.anchor || 'middle') + '" ' +
           'style="font-variant-numeric: tabular-nums">' + esc(v) + '</text>';
  }).join('');
  // Expose CSS custom property --roll so keyframes can read the total translate
  var total = (opts.values.length - 1) * lineH;
  var style = '--roll-total:' + (-total) + 'px' + (opts.delay ? ';animation-delay:' + opts.delay + 's' : '');
  return '<defs>' +
           '<clipPath id="' + opts.id + '">' +
             '<rect x="' + (opts.x - opts.w / 2) + '" y="' + (opts.y - opts.h + 1.5) + '" ' +
                   'width="' + opts.w + '" height="' + opts.h + '"/>' +
           '</clipPath>' +
         '</defs>' +
         '<g clip-path="url(#' + opts.id + ')">' +
           '<g class="' + opts.className + '" style="' + style + '">' + texts + '</g>' +
         '</g>';
}

/* ══════════════════════════════════════════════════════════════════
   Topographical Ripple loader — the single chosen animation.
   Four concentric irregular contours draw outward from the center,
   largest-to-smallest. Only after all four rings have fully drawn
   does the central "Transforming Plumbing" label + peak pulse
   reveal itself. Cycle: 12s, slow + meditative.
   Class prefix lg4 — CSS scoped in marketing-paper.css.
   Paths use pathLength="100" so a normalized dasharray=100 keyframe
   drives the draw regardless of real path length.
   ══════════════════════════════════════════════════════════════════ */
function lgSvg_4() {
  // Rings ordered inner → outer in the array. Keyframes (CSS) run
  // each ring in a NON-overlapping slice of the cycle: outer draws
  // fully, then next, then next, then innermost — so ring N+1 never
  // starts drawing while ring N is still drawing. That means we don't
  // need per-ring animation-delay anymore; each ring's unique keyframe
  // handles its draw window directly.
  var rings = [
    'M70 50 C86 50, 96 60, 96 72 C96 86, 86 96, 70 96 C54 96, 44 86, 44 72 C44 60, 54 50, 70 50 Z',
    'M70 38 C94 38, 106 56, 106 72 C106 90, 92 108, 70 108 C48 108, 34 90, 34 72 C34 56, 46 38, 70 38 Z',
    'M70 26 C100 26, 116 50, 116 72 C116 96, 100 120, 70 120 C40 120, 24 96, 24 72 C24 50, 40 26, 70 26 Z',
    'M70 14 C108 14, 128 44, 128 72 C128 102, 108 130, 70 130 C32 130, 12 102, 12 72 C12 44, 32 14, 70 14 Z'
  ];
  // Softer off-white ink for text + rings — sits clearly on the paper
  // bg but reads as a warm, quiet gray rather than a hard charcoal.
  var INK = '#A89F95';
  var paths = rings.map(function(d, i) {
    return '<path class="lg4-ring lg4-ring--' + i + '" d="' + d + '" pathLength="100" ' +
           'fill="none" stroke="' + INK + '" stroke-width="0.9" stroke-linecap="round" ' +
           'stroke-dasharray="100" stroke-dashoffset="100"/>';
  }).join('');
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    // Top title — same off-white ink as the rings. Longer phrase
    // ("FINDING THE WHY IN MARKETING") needs a smaller font-size
    // and slightly tighter tracking so it still fits the canvas.
    '<text x="70" y="10" fill="' + INK + '" font-size="3.6" font-family="ui-monospace, monospace" ' +
          'text-anchor="middle" letter-spacing="0.14em" font-weight="700">FINDING THE WHY IN MARKETING</text>' +
    paths +
    // Center label — two compact lines, centered in the innermost
    // ring. Font-size dropped from 5.8 → 4.3 so "TRANSFORMING" no
    // longer crowds the ring edges; lines pulled closer together
    // for a tighter stack. Same off-white ink as the rings.
    '<g class="lg4-label">' +
      '<text x="70" y="69" fill="' + INK + '" font-size="4.3" ' +
            'font-family="ui-monospace, monospace" font-weight="800" text-anchor="middle" ' +
            'letter-spacing="0.05em">TRANSFORMING</text>' +
      '<text x="70" y="75.5" fill="' + INK + '" font-size="4.3" ' +
            'font-family="ui-monospace, monospace" font-weight="800" text-anchor="middle" ' +
            'letter-spacing="0.05em">PLUMBING</text>' +
      // Orange drafting rule beneath the label — keeps the warm
      // accent, repositioned lower to match the tighter label stack.
      // pathLength=100 so the draw animation reads cleanly.
      '<line class="lg4-accent" x1="62" y1="81" x2="78" y2="81" pathLength="100" ' +
            'stroke="#E88140" stroke-width="1.4" stroke-linecap="round" ' +
            'stroke-dasharray="100" stroke-dashoffset="100"/>' +
    '</g>' +
  '</svg>';
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
