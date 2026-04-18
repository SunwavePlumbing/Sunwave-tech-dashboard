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

/* ── "Kinetic Drafting Table" loading state ─────────────────────
   Layered paper-drafting composition. Four pieces orchestrated:

     Layer 1 — Background: two vertical data-stream columns (raw
               marketing fragments on the left, refined ledger lines
               on the right) scrolling in graphite at ~6% opacity
               with a radial-gradient mask so they fade toward the
               edges. Implies "technical reconciliation happening".

     Layer 2 — Centerpiece: SVG geometric figure (4 concentric
               rings + crosshair + rotating diagonal spokes + 4
               cardinal registration dots). Rings alternate
               graphite and Oxford Blue ink, each drawn in via
               stroke-dashoffset. Slow breathing scale + spoke
               rotation persist through the load.

     Layer 3 — Typography: "Reconciling Marketing Ledger" with a
               per-letter L→R ink-soak wave (variable font-weight
               300 → 700 + blur settle). Sunflower-yellow multiply-
               blend highlighter behind "Marketing Ledger". Three
               pen-drip dots after.

     Layer 4 — Tally: "N / target accounts aggregated" in graphite,
               tabular-nums. Every 1,000 counts triggers a 0.3s
               yellow highlighter flash behind the number; every
               5,000 counts fires a haptic pulse on mobile.

     Finalize — The whole loader momentarily blooms via filter:
                blur(8px) contrast(1.2), then settles back to blur(0)
                while fading opacity → 0 over 1.5s. Reads as "the
                dashboard dries and settles" on the paper surface.

     .destroy()    — tear down timers (used on error paths)
     .finalize(cb) — run the blur-dry exit + fire `cb` when mounted */
function startLedgerLoader(container) {
  if (_ttLoader) _ttLoader.destroy();

  var isMobile = window.innerWidth <= 768;

  // Plausible account-count ceiling (random 28–40k per run) so the
  // "current / total" ratio visibly sits in the 5–25% band during
  // typical load windows at the ~170/sec climb rate.
  var totalTarget = 28000 + Math.floor(Math.random() * 12000);
  var totalStr    = totalTarget.toLocaleString();

  // ── Background stream content ─────────────────────────────────
  // Raw marketing fragments (left column): UTM params, click IDs,
  // JSON blobs, API status codes, formulas — the unprocessed side.
  var rawFragments = [
    'utm_source=google_ads',       'click_id=mk_9f2a3c21',
    '{"spend":428.51,"imp":12840}','gclid=CjwKCAjw_9f2',
    'HTTP/2 200 · auth_ok',        'campaign=retarget_winter',
    'referrer=fb.com/ads',         'ad_set_id=AS-4412-B',
    '{"ctr":0.048,"cpc":1.82}',    'utm_medium=cpc',
    'ΣROAS = Σrev ÷ Σspend',       'x-rate-limit: 118/200',
    'tracking_id=mk_tr_9a71bf',    'fbclid=IwAR3xq',
    '{"roi":3.24,"roas":4.18}',    'CAC = spend ÷ new_cust',
    'impression_id=imp_7721',      '{"spend":188.04,"conv":6}',
    'HTTP/2 429 · retry=3',        'adwords_id=AW-882941',
    'source=organic_search',       'CPL = spend ÷ leads',
    '{"cpm":14.20,"reach":82104}', 'utm_term=plumber+near+me',
    'pixel_id=pix_0xff41',         '{"spend":612.88,"imp":19204}',
    'attr_model: last_click',      'lookback = 28d',
    '{"leads":14,"cpl":41.92}',    'HTTP/2 204 · no-content'
  ];
  // Refined ledger entries (right column): formatted date | id | amt.
  function genLedger(n) {
    var out = [], today = new Date();
    for (var i = 0; i < n; i++) {
      var d = new Date(today);
      d.setDate(d.getDate() - (i % 30));
      var mm = String(d.getMonth() + 1).padStart(2, '0');
      var dd = String(d.getDate()).padStart(2, '0');
      var id = 'L-' + (8800 + i);
      var amt = (Math.random() * 1800 + 60).toFixed(2);
      var formatted = '$' + Number(amt).toLocaleString(undefined, {
        minimumFractionDigits: 2, maximumFractionDigits: 2
      });
      out.push(d.getFullYear() + '-' + mm + '-' + dd + '  #' + id + '  ' + formatted);
    }
    return out;
  }
  var ledgerEntries = genLedger(isMobile ? 18 : 30);

  // Stream builder — duplicates content so the -50% translate loop
  // is seamless (landing on an identical phrase each cycle).
  function buildStream(items, cls) {
    var doubled = items.concat(items);
    var lines = doubled.map(function(t) {
      return '<div class="ll-stream-line">' + esc(t) + '</div>';
    }).join('');
    return '<div class="ll-stream ' + cls + '" aria-hidden="true">' +
             '<div class="ll-stream-track">' + lines + '</div>' +
           '</div>';
  }
  // Desktop: both columns. Mobile: one narrower center column only
  // (the right column's monospace ledger entries would be unreadable
  // in the ~90px available, and two columns on a phone read as clutter).
  var streamsHtml;
  if (isMobile) {
    var mobileRaw = rawFragments.slice(0, Math.ceil(rawFragments.length * 0.5));
    streamsHtml = buildStream(mobileRaw, 'll-stream--center');
  } else {
    streamsHtml = buildStream(rawFragments,  'll-stream--left') +
                  buildStream(ledgerEntries, 'll-stream--right');
  }

  // ── SVG geometric figure ───────────────────────────────────────
  // Same viewBox (0 0 220 220), same 4-ring + crosshair + spokes
  // structure as before. Colors now alternate per ring: rings 1 & 3
  // graphite (#7A7571), rings 2 & 4 Oxford Blue (#002147). The CSS
  // handles stroke color via modifier classes (see ll-draft-ring--Nk
  // / --Nb in marketing-paper.css).
  var svgHtml =
    '<svg class="ll-draft" viewBox="0 0 220 220" aria-hidden="true" focusable="false">' +
      '<g class="ll-draft-figure">' +
        '<circle class="ll-draft-ring ll-draft-ring--1 ll-draft-ring--k" cx="110" cy="110" r="95"/>' +
        '<circle class="ll-draft-ring ll-draft-ring--2 ll-draft-ring--b" cx="110" cy="110" r="70"/>' +
        '<circle class="ll-draft-ring ll-draft-ring--3 ll-draft-ring--k" cx="110" cy="110" r="45"/>' +
        '<circle class="ll-draft-ring ll-draft-ring--4 ll-draft-ring--b" cx="110" cy="110" r="22"/>' +
        '<line class="ll-draft-line ll-draft-line--h ll-draft-line--k" x1="15"  y1="110" x2="205" y2="110"/>' +
        '<line class="ll-draft-line ll-draft-line--v ll-draft-line--k" x1="110" y1="15"  x2="110" y2="205"/>' +
        '<g class="ll-draft-spokes">' +
          '<line class="ll-draft-line ll-draft-line--d1 ll-draft-line--b" x1="45"  y1="45"  x2="175" y2="175"/>' +
          '<line class="ll-draft-line ll-draft-line--d2 ll-draft-line--b" x1="175" y1="45"  x2="45"  y2="175"/>' +
        '</g>' +
        '<circle class="ll-draft-tick" cx="110" cy="15"  r="2"/>' +
        '<circle class="ll-draft-tick" cx="205" cy="110" r="2"/>' +
        '<circle class="ll-draft-tick" cx="110" cy="205" r="2"/>' +
        '<circle class="ll-draft-tick" cx="15"  cy="110" r="2"/>' +
      '</g>' +
    '</svg>';

  // ── Per-letter title split ─────────────────────────────────────
  // Splits "Reconciling" + " " + "Marketing Ledger" into individual
  // .ll-letter spans, each with a staggered animation-delay. The
  // llInkFlow keyframes (CSS) cycle each letter's font-weight +
  // filter: blur so the wave of "fresh ink settling" sweeps L→R.
  // Letter index is continuous across both phrases so the wave
  // doesn't "restart" at the highlight boundary.
  function splitLetters(text, startIdx, perMs) {
    return text.split('').map(function(ch, j) {
      var safe  = ch === ' ' ? '&nbsp;' : esc(ch);
      var delay = ((startIdx + j) * perMs) + 'ms';
      return '<span class="ll-letter" style="animation-delay:' + delay + '">' + safe + '</span>';
    }).join('');
  }
  var pre  = 'Reconciling ';
  var post = 'Marketing Ledger';
  var PER  = 40;   // ms per character — L→R wave speed
  var preHtml  = splitLetters(pre,  0,          PER);
  var postHtml = splitLetters(post, pre.length, PER);

  container.innerHTML =
    '<div class="ledger-loader ledger-loader--draft" id="ttLoader">' +
      '<div class="ll-streams" aria-hidden="true">' + streamsHtml + '</div>' +
      '<div class="ll-vignette" aria-hidden="true"></div>' +
      '<div class="ll-overlay">' +
        svgHtml +
        '<div class="ll-title">' +
          '<span class="ll-title-phrase">' + preHtml + '</span>' +
          '<span class="ll-highlight">' + postHtml + '</span>' +
          '<span class="ll-dots" aria-hidden="true">' +
            '<span class="ll-dot"></span>' +
            '<span class="ll-dot"></span>' +
            '<span class="ll-dot"></span>' +
          '</span>' +
        '</div>' +
        '<div class="ll-tally">' +
          '<span class="ll-tally-num" id="llTallyNum">0</span>' +
          '<span class="ll-tally-sep">/</span>' +
          '<span class="ll-tally-total">' + totalStr + '</span>' +
          '<span class="ll-tally-unit">accounts aggregated</span>' +
        '</div>' +
      '</div>' +
    '</div>';

  var rootEl  = container.querySelector('#ttLoader');
  var tallyEl = container.querySelector('#llTallyNum');

  // ── Tally with cross-fade + milestones + haptics ──────────────
  // Cadence: update DOM at most every 220ms so the 150ms opacity
  // transition on .ll-tally-num has headroom to complete its
  // "cross-fade on each tick". Rate climbs sinusoidally (~120–220/s)
  // so the counter feels organic rather than perfectly linear.
  // Milestones:
  //   • 1,000-unit crossing → briefly add .is-milestone (CSS paints
  //     a sunflower-yellow highlight behind the number + 300ms fade)
  //   • 5,000-unit crossing → navigator.vibrate(12) on mobile
  var startTs       = performance.now();
  var lastPaintedTs = 0;
  var destroyed     = false;
  var rafId         = null;
  var lastValue     = 0;
  var lastThousand  = 0;
  var lastFiveK     = 0;
  var UPDATE_MS     = 220;
  var hapticOK = isMobile && typeof navigator !== 'undefined'
                 && typeof navigator.vibrate === 'function';

  function flashMilestone() {
    if (!tallyEl) return;
    tallyEl.classList.remove('is-milestone');
    // Force reflow so re-adding the class restarts the CSS animation
    void tallyEl.offsetWidth;
    tallyEl.classList.add('is-milestone');
  }

  function tickTally(ts) {
    if (destroyed) return;
    var elapsed = ts - startTs;
    var rate    = 170 + Math.sin(elapsed / 850) * 50;   // ~120–220/sec
    var value   = Math.min(totalTarget - 1, Math.floor(elapsed / 1000 * rate));
    if (ts - lastPaintedTs >= UPDATE_MS && value !== lastValue && tallyEl) {
      lastPaintedTs = ts;
      tallyEl.classList.add('is-ticking');
      tallyEl.textContent = value.toLocaleString();
      requestAnimationFrame(function() {
        if (!destroyed && tallyEl) tallyEl.classList.remove('is-ticking');
      });
      // 1,000-count highlighter flash
      var k1 = Math.floor(value / 1000);
      if (k1 > lastThousand) { lastThousand = k1; flashMilestone(); }
      // 5,000-count haptic pulse
      var k5 = Math.floor(value / 5000);
      if (k5 > lastFiveK && hapticOK) {
        lastFiveK = k5;
        try { navigator.vibrate(12); } catch (_) {}
      }
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

      // Blur-dry exit: CSS animation llDrying (1.5s) applies
      // filter: blur(8px) contrast(1.2) at the peak, then settles
      // back to blur(0) while opacity fades → 0. The dashboard
      // mounts beneath on a staggered mkt-mount-in animation, so
      // the visual handoff is "ink blooms, then dries into crisp
      // final layout".
      rootEl.classList.add('ll-drying');
      // Fire onComplete a touch before the full 1500ms so the real
      // dashboard appears under the dissipating blur rather than
      // after a black gap. 1100ms puts the mount at ~73% through
      // the dry-out, which lines up with the blur returning to ~2px.
      setTimeout(function() {
        if (onComplete) onComplete();
      }, 1100);
      // Ensure the node is fully invisible + out of layout for cleanup
      setTimeout(function() {
        if (rootEl) rootEl.classList.add('ll-done');
      }, 1500);
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
