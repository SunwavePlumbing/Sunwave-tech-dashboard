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

/* ── "Modern Ledger" loading state ──────────────────────────────
   Replaces the monospace teletype with an editorial sans-serif
   presentation: a blurred placeholder ledger in the background,
   a centered "Reconciling Marketing Ledger…" breathing tagline,
   and an infinite batch-processing tally (records scanned) that
   ticks continuously instead of chasing an arbitrary 100%.
     .destroy()    — tear down all timers (used on error paths)
     .finalize(cb) — unblur + fade out, fire `cb` when safe to mount */
function startLedgerLoader(container) {
  if (_ttLoader) _ttLoader.destroy();

  // Placeholder skeleton of the real dashboard — three stat cards, a
  // short bar chart, and table rows. Heavily blurred + translucent so
  // it reads as "the paper that's about to come into focus," never as
  // real data. Bars are rendered with brand-orange tint so the eye
  // still registers "marketing dashboard shape" through the blur.
  function skelRow() {
    return '<div class="ll-skel-row">' +
      '<div class="ll-skel-cell ll-skel-cell--wide"></div>' +
      '<div class="ll-skel-cell ll-skel-cell--med"></div>' +
      '<div class="ll-skel-cell ll-skel-cell--sm"></div>' +
    '</div>';
  }
  var rows = '';
  for (var i = 0; i < 6; i++) rows += skelRow();

  var barHeights = [40, 72, 58, 85, 48, 76, 62, 55, 88, 66, 50, 78];
  var bars = barHeights.map(function(h) {
    return '<div class="ll-skel-bar" style="height:' + h + '%"></div>';
  }).join('');

  container.innerHTML =
    '<div class="ledger-loader" id="ttLoader">' +
      '<div class="ll-skeleton" aria-hidden="true">' +
        '<div class="ll-skel-stats">' +
          '<div class="ll-skel-card"><div class="ll-skel-line ll-skel-line--sm"></div><div class="ll-skel-line ll-skel-line--lg"></div></div>' +
          '<div class="ll-skel-card"><div class="ll-skel-line ll-skel-line--sm"></div><div class="ll-skel-line ll-skel-line--lg"></div></div>' +
          '<div class="ll-skel-card"><div class="ll-skel-line ll-skel-line--sm"></div><div class="ll-skel-line ll-skel-line--lg"></div></div>' +
        '</div>' +
        '<div class="ll-skel-chart">' + bars + '</div>' +
        '<div class="ll-skel-table">' + rows + '</div>' +
      '</div>' +
      '<div class="ll-overlay">' +
        '<div class="ll-title">Reconciling Marketing Ledger\u2026</div>' +
        '<div class="ll-tally">' +
          '<span class="ll-tally-num" id="llTallyNum">0</span> ' +
          '<span class="ll-tally-label" id="llTallyLabel">records scanned</span>' +
        '</div>' +
      '</div>' +
    '</div>';

  var rootEl  = container.querySelector('#ttLoader');
  var tallyEl = container.querySelector('#llTallyNum');
  var labelEl = container.querySelector('#llTallyLabel');

  // ── Infinite tally: continuously ticking up ─────────────────────
  // The rate varies sinusoidally (~130–220/sec) so the counter feels
  // alive and non-linear, but never approaches a ceiling. There's no
  // arbitrary "100%" finish line to stall against.
  var startTs   = performance.now();
  var destroyed = false;
  var rafId     = null;
  function tickTally(ts) {
    if (destroyed) return;
    var elapsed = ts - startTs;
    var rate    = 170 + Math.sin(elapsed / 850) * 50;  // ~120–220 rec/sec
    var value   = Math.floor(elapsed / 1000 * rate);
    if (tallyEl) tallyEl.textContent = value.toLocaleString();
    rafId = requestAnimationFrame(tickTally);
  }
  rafId = requestAnimationFrame(tickTally);

  // ── Label rotation: swap the "records scanned" phrase every ~2s
  // so the running tally feels like different stages of work, not a
  // single repetitive counter. Fade-out/in via CSS opacity transition.
  var labels = [
    'records scanned',
    'invoices cross-checked',
    'ledger lines reconciled',
    'accounts aggregated',
    'entries balanced'
  ];
  var labelIdx = 0;
  var labelTimer = setInterval(function() {
    if (!labelEl || destroyed) return;
    labelIdx = (labelIdx + 1) % labels.length;
    labelEl.classList.add('is-fading');
    setTimeout(function() {
      if (destroyed || !labelEl) return;
      labelEl.textContent = labels[labelIdx];
      labelEl.classList.remove('is-fading');
    }, 180);
  }, 2000);

  return {
    destroy: function() {
      destroyed = true;
      if (rafId) cancelAnimationFrame(rafId);
      clearInterval(labelTimer);
    },
    finalize: function(onComplete) {
      if (destroyed) { if (onComplete) onComplete(); return; }
      destroyed = true;
      if (rafId) cancelAnimationFrame(rafId);
      clearInterval(labelTimer);

      // Tagline fades, then the whole loader unblurs + dissolves.
      // Mirrors a camera snapping into focus — matches the "aha" of
      // the data resolving. The fake skeleton intentionally fades too
      // so the real dashboard underneath can mount cleanly.
      rootEl.classList.add('ll-focusing');
      setTimeout(function() {
        rootEl.classList.add('ll-done');
        setTimeout(function() {
          if (onComplete) onComplete();
        }, 180);
      }, 420);
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
    var barStyle = m.isCurrent
      ? 'height:' + h + 'px;opacity:0.6;background:repeating-linear-gradient(135deg,#FF6B35 0,#FF6B35 4px,#ffb07a 4px,#ffb07a 8px)'
      : 'height:' + h + 'px';
    var valHtml = m.isCurrent
      ? displayJobs + '<div style="font-size:7px;color:#FF9500;font-weight:700;line-height:1;margin-top:1px">PROJ</div>'
      : (m.jobs > 0 ? m.jobs : '');
    return '<div class="bar-col">' +
      '<div class="bar-val">' + valHtml + '</div>' +
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
    var projTag = m.isCurrent
      ? ' <span style="font-size:10px;color:#FF9500;font-weight:600">PROJ</span>'
      : '';
    // Jobs cell: three slots (number / delta / PROJ) each in a fixed
    // grid column so the number always lands at the same x position,
    // regardless of whether the row has a delta or PROJ badge.
    var jobsCell =
      '<div class="mkt-jobs-grid">' +
        '<span class="mkt-jobs-num">' + displayJobs + '</span>' +
        '<span class="mkt-jobs-delta-slot">' + deltaJobs + '</span>' +
        '<span class="mkt-jobs-proj-slot">' + projTag + '</span>' +
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
      '<tfoot><tr><td>12-Month Total</td><td>' + totalHistJobs + '</td><td>' + fmt(totalHistRev) + '</td><td>' + footSpend + '</td><td>' + footCost + '</td></tr></tfoot>' +
    '</table></div></div>';

  document.getElementById('marketingContent').innerHTML = qboBanner + projHTML + chartHTML + tableHTML;
}
