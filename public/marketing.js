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

/* ── "Teletype Auditor" loading sequence ────────────────────────
   Replaces the plain "Loading marketing data..." line with a narrative
   terminal-style print of simulated sync logs, a faint randomizing
   number-matrix in the background, and a high-precision progress
   counter — reframing the wait as "valuable work being performed"
   instead of a generic spinner. Returns a control object:
     .destroy()  — tear down all timers (used on error paths)
     .finalize(cb) — print success line, fade out, fire `cb` when
                     it's safe to mount the real dashboard. */
function startTeletypeLoader(container) {
  if (_ttLoader) _ttLoader.destroy();

  var lines = [
    '> INITIATING SECURE SYNC...',
    '> Authenticating QuickBooks API... [OK]',
    '> Fetching Housecall Pro invoices... [FETCHING 4,209 NODES]',
    '> Reconciling cross-platform timestamps...',
    '> Aggregating marketing ROI metrics...',
    '> Calculating fractional attribution...'
  ];

  container.innerHTML =
    '<div class="tt-loader" id="ttLoader">' +
      '<div class="tt-matrix" aria-hidden="true"></div>' +
      '<div class="tt-console">' +
        '<div class="tt-console-lines" id="ttLines"></div>' +
        '<div class="tt-progress">' +
          '<div class="tt-progress-track"><div class="tt-progress-fill" id="ttFill"></div></div>' +
          '<div class="tt-progress-pct" id="ttPct">0.000%</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  var rootEl   = container.querySelector('#ttLoader');
  var matrixEl = container.querySelector('.tt-matrix');
  var linesEl  = container.querySelector('#ttLines');
  var fillEl   = container.querySelector('#ttFill');
  var pctEl    = container.querySelector('#ttPct');

  // ── Background data matrix: columns of rapidly-cycling numbers ──
  // Layout: 8 columns on desktop flanking the console, 3 on mobile.
  // Opacity held extremely low (0.05) so the matrix reads as atmosphere,
  // never competes with the foreground console text.
  function randNum() {
    var kind = Math.floor(Math.random() * 4);
    if (kind === 0) return (Math.random() * 10000).toFixed(2);
    if (kind === 1) return (Math.random() * 100).toFixed(3);
    if (kind === 2) return (Math.random() * 10).toFixed(4);
    return Math.floor(Math.random() * 100000).toString().padStart(5, '0');
  }
  var isMobile = window.innerWidth <= 768;
  var NCOLS = isMobile ? 3 : 8;
  var NROWS = isMobile ? 12 : 16;
  var mHtml = '';
  for (var c = 0; c < NCOLS; c++) {
    mHtml += '<div class="tt-matrix-col">';
    for (var r = 0; r < NROWS; r++) {
      mHtml += '<div class="tt-matrix-num">' + randNum() + '</div>';
    }
    mHtml += '</div>';
  }
  matrixEl.innerHTML = mHtml;
  var matrixCells = matrixEl.querySelectorAll('.tt-matrix-num');
  // Randomize ~35% of cells every 80ms — creates a subtle "crunching"
  // flicker across the grid without seizure-inducing chaos.
  var matrixInterval = setInterval(function() {
    for (var i = 0; i < matrixCells.length; i++) {
      if (Math.random() < 0.35) matrixCells[i].textContent = randNum();
    }
  }, 80);

  // ── High-precision progress counter ─────────────────────────────
  // `pctTarget` is bumped up as each log line completes; `pctValue`
  // eases toward the target so the decimal counter ticks rapidly with
  // natural acceleration / deceleration between stages.
  var pctValue  = 0;
  var pctTarget = 0;
  var pctLocked = false;
  var pctInterval = setInterval(function() {
    if (pctLocked) return;
    if (pctValue < pctTarget) {
      var gap   = pctTarget - pctValue;
      var delta = gap * 0.09 + 0.04;
      pctValue  = Math.min(pctTarget, pctValue + delta);
      pctEl.textContent    = pctValue.toFixed(3) + '%';
      fillEl.style.width   = pctValue + '%';
    }
  }, 32);

  // ── Typewriter: print each line char-by-char with blinking cursor ─
  var lineIdx        = 0;
  var charIdx        = 0;
  var currentLineEl  = null;
  var typingTimeout  = null;
  var destroyed      = false;

  function startLine() {
    if (destroyed) return;
    if (lineIdx >= lines.length) {
      // All scripted lines typed — keep an idle cursor blinking while
      // we wait for the real fetch to resolve.
      appendCursorLine();
      return;
    }
    currentLineEl = document.createElement('div');
    currentLineEl.className = 'tt-line tt-line--active';
    currentLineEl.innerHTML = '<span class="tt-line-text"></span><span class="tt-cursor">\u2588</span>';
    linesEl.appendChild(currentLineEl);
    charIdx = 0;
    typeNext();
  }
  function appendCursorLine() {
    currentLineEl = document.createElement('div');
    currentLineEl.className = 'tt-line tt-line--active';
    currentLineEl.innerHTML = '<span class="tt-line-text">&gt; </span><span class="tt-cursor">\u2588</span>';
    linesEl.appendChild(currentLineEl);
  }
  function typeNext() {
    if (destroyed) return;
    var line = lines[lineIdx];
    if (charIdx < line.length) {
      var textSpan = currentLineEl.querySelector('.tt-line-text');
      textSpan.textContent = line.substring(0, charIdx + 1);
      charIdx++;
      // Ellipses get a longer pause to feel like "thinking"; normal
      // characters fire every 12–28ms for dot-matrix printer cadence.
      var prev  = line[charIdx - 1];
      var delay = prev === '.' ? 70 : (12 + Math.random() * 16);
      typingTimeout = setTimeout(typeNext, delay);
    } else {
      // Line complete — freeze the text, drop the cursor, bump progress.
      currentLineEl.classList.remove('tt-line--active');
      currentLineEl.classList.add('tt-line--done');
      var cur = currentLineEl.querySelector('.tt-cursor');
      if (cur) cur.remove();
      lineIdx++;
      pctTarget = Math.min(96, (lineIdx / lines.length) * 94 + Math.random() * 3);
      typingTimeout = setTimeout(startLine, 140 + Math.random() * 140);
    }
  }
  startLine();

  return {
    destroy: function() {
      destroyed = true;
      clearInterval(matrixInterval);
      clearInterval(pctInterval);
      if (typingTimeout) clearTimeout(typingTimeout);
    },
    finalize: function(onComplete) {
      if (destroyed) { if (onComplete) onComplete(); return; }
      destroyed = true;
      if (typingTimeout) clearTimeout(typingTimeout);
      clearInterval(matrixInterval);

      // Drop any active cursor from the last scripted line
      if (currentLineEl) {
        var cur = currentLineEl.querySelector('.tt-cursor');
        if (cur) cur.remove();
        currentLineEl.classList.remove('tt-line--active');
        currentLineEl.classList.add('tt-line--done');
      }

      // Rush progress to 100 over ~280ms
      pctLocked = true;
      clearInterval(pctInterval);
      var fStart = performance.now();
      var fFrom  = pctValue;
      function pRush(now) {
        var t = Math.min(1, (now - fStart) / 280);
        var v = fFrom + (100 - fFrom) * (1 - Math.pow(1 - t, 3));
        pctEl.textContent  = v.toFixed(3) + '%';
        fillEl.style.width = v + '%';
        if (t < 1) requestAnimationFrame(pRush);
      }
      requestAnimationFrame(pRush);

      // Print the final success line
      var successLine = document.createElement('div');
      successLine.className = 'tt-line tt-line--success';
      successLine.textContent = '> COMPILATION SUCCESSFUL. RENDERING LEDGER.';
      linesEl.appendChild(successLine);

      // Brief pause so the user registers the success message, then
      // fade teletype + matrix out over 300ms and mount real content.
      setTimeout(function() {
        rootEl.classList.add('tt-fading');
        setTimeout(function() {
          if (onComplete) onComplete();
        }, 320);
      }, 380);
    }
  };
}

async function fetchMarketing() {
  var container = document.getElementById('marketingContent');
  _ttLoader = startTeletypeLoader(container);
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
