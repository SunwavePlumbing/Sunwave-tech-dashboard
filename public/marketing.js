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

/* ── "Kinetic Ledger" loading state ─────────────────────────────
   Tactile paper-ledger aesthetic — every effect is physical, not
   digital. The hero tagline absorbs ink letter-by-letter (L→R wave
   of weight + blur settle, like fresh ink drying). The dots bleed
   outward in concentric rings like a fountain pen resting on paper.
   Behind the tagline, three low-opacity graphite columns of raw
   fragments, formulas, and refined ledger entries stutter-scroll —
   with occasional red-pencil strike-throughs and Oxford-blue circle
   annotations, telling a story of the system "checking and correcting"
   its own work. The tally ticks with tabular-nums; every 500-line
   milestone fires a sunflower-yellow marker stroke painted with
   mix-blend-mode: multiply behind the number so paper texture and
   glyph both show through. The scrolling-scribe log keeps the last
   three instructions visible above the current one, each progressively
   fainter + blurrier — a visual audit trail of completed work.
     .destroy()    — tear down all timers (used on error paths)
     .finalize(cb) — unblur + fade out, fire `cb` when safe to mount */
function startLedgerLoader(container) {
  if (_ttLoader) _ttLoader.destroy();

  var isMobile = window.innerWidth <= 768;

  // ── Stream source content ──────────────────────────────────────
  // Raw marketing fragments (left stream): utm params, JSON blobs,
  // ad IDs — the "unprocessed" side of the ingest pipeline.
  var rawFragments = [
    'utm_source=google_ads', 'click_id=mk_9f2a3c21',
    '{"spend":428.51,"imp":12840}', 'gclid=CjwKCAjw_9f2',
    'HTTP/2 200 · auth_ok', 'campaign=retarget_winter',
    'referrer=fb.com/ads', 'ad_set_id=AS-4412-B',
    '{"ctr":0.048,"cpc":1.82}', 'utm_medium=cpc',
    'x-rate-limit: 118/200', 'conv_value=$642.00',
    'tracking_id=mk_tr_9a71bf', 'fbclid=IwAR3xq',
    '{"roi":3.24,"roas":4.18}', 'utm_campaign=spring_promo',
    'impression_id=imp_7721', '{"spend":188.04,"conv":6}',
    'HTTP/2 429 · retry=3', 'adwords_id=AW-882941',
    'source=organic_search', 'campaign_id=CMP-2026-0412',
    '{"cpm":14.20,"reach":82104}', 'utm_term=plumber+near+me',
    'ref=nextdoor', 'pixel_id=pix_0xff41',
    '{"spend":612.88,"imp":19204}', 'click_id=mk_88fc91',
    'utm_source=yelp', '{"leads":14,"cpl":41.92}',
    'HTTP/2 204 · no-content', 'tracking=angi_lead_gen',
    'gclid=CjwKBh93Mxl', '{"spend":974.22,"conv":22}'
  ];
  // Formulas + accounting identities (middle stream, desktop only).
  // Uses mathematical glyphs to feel like margin scribbles — the
  // "mental math" layer behind the reconciliation.
  var formulaFragments = [
    'ΣROAS = Σrev ÷ Σspend', 'CAC = spend ÷ new_cust',
    'CPL = spend ÷ leads', 'LTV × 3 > CAC',
    'attr_model: last_click', 'lookback = 28d',
    'μ(ticket) = $1,842', 'σ² = 184,221',
    'GP% = (rev − COGS) ÷ rev', 'NOI = GP − OpEx',
    'Δrev = $142,804 MoM', 'conv_lag = 3.4d median',
    'χ² = 12.7, p < 0.01', '∫(spend)dt ≈ $48.2k',
    '∂ROAS/∂spend → 0⁺', 'E[LTV|ch=paid] = $3,184',
    'err_bound = ±$0.04', 'batch_sz = 200 rows'
  ];
  // Refined ledger entries (right stream): formatted accounting
  // rows — the "processed" side. Date | Ledger ID | Balance.
  function genLedger(n) {
    var out = [];
    var today = new Date();
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

  // Build a stream column — duplicate content so the infinite scroll
  // loop is seamless (translating -50% lands on an identical phrase).
  // `seed` offsets the struck/circled pattern so each column has
  // corrections in different spots (avoids a visible vertical stripe
  // of marks across all three columns).
  function buildStream(items, cls, seed) {
    seed = seed || 0;
    var doubled = items.concat(items);
    var lines = doubled.map(function(t, i) {
      var extra = '';
      // ~1 in 9 lines: red-pencil strike-through
      if ((i + seed) % 9 === 0) extra = ' ll-stream-line--struck';
      // ~1 in 11 lines (offset): Oxford-blue circle annotation
      else if ((i + seed + 4) % 11 === 0) extra = ' ll-stream-line--circled';
      return '<div class="ll-stream-line' + extra + '">' + esc(t) + '</div>';
    }).join('');
    return '<div class="ll-stream ' + cls + '" aria-hidden="true">' +
             '<div class="ll-stream-track">' + lines + '</div>' +
           '</div>';
  }

  // Desktop: three columns (raw | formulas | refined). Mobile: a
  // single narrower raw stream in the center (extra columns hidden
  // for visual clarity + performance).
  var streamsHtml;
  if (isMobile) {
    var mobileRaw = rawFragments.slice(0, Math.ceil(rawFragments.length * 0.4));
    streamsHtml = buildStream(mobileRaw, 'll-stream--center', 0);
  } else {
    streamsHtml = buildStream(rawFragments,     'll-stream--left',   0) +
                  buildStream(formulaFragments, 'll-stream--middle', 3) +
                  buildStream(ledgerEntries,    'll-stream--right',  5);
  }

  // Title: split every letter into its own span so the ink-soak
  // animation can stagger per-character (creating an L→R wave of
  // weight + blur settling, like wet ink drying across the word).
  var titleText = 'Reconciling Marketing Ledger';
  var titleHtml = titleText.split('').map(function(ch, i) {
    var safe = ch === ' ' ? '&nbsp;' : esc(ch);
    var delay = (i * 45) + 'ms'; // ~45ms stagger per character
    return '<span class="ll-letter" style="animation-delay:' + delay + '">' + safe + '</span>';
  }).join('');

  container.innerHTML =
    '<div class="ledger-loader" id="ttLoader">' +
      '<div class="ll-streams" aria-hidden="true">' + streamsHtml + '</div>' +
      '<div class="ll-vignette" aria-hidden="true"></div>' +
      '<div class="ll-overlay">' +
        '<div class="ll-title">' +
          '<span class="ll-title-text">' + titleHtml + '</span>' +
          '<span class="ll-dots" aria-hidden="true">' +
            '<span class="ll-dot"></span>' +
            '<span class="ll-dot"></span>' +
            '<span class="ll-dot"></span>' +
          '</span>' +
        '</div>' +
        '<div class="ll-tally">' +
          '<span class="ll-tally-num" id="llTallyNum">0</span>' +
          '<span class="ll-tally-unit">ledger entries</span>' +
        '</div>' +
        '<div class="ll-log" id="llLog"></div>' +
      '</div>' +
    '</div>';

  var rootEl  = container.querySelector('#ttLoader');
  var tallyEl = container.querySelector('#llTallyNum');
  var logEl   = container.querySelector('#llLog');

  // ── Infinite tally: continuously ticking up ─────────────────────
  // Sinusoidal rate (~120–220/sec) so the counter feels organic, not
  // linear. Detects 500-unit crossings to paint a yellow marker stroke,
  // and 5,000-unit crossings to fire a haptic pulse on mobile.
  var startTs       = performance.now();
  var destroyed     = false;
  var rafId         = null;
  var lastValue     = 0;
  var lastMilestone = 0;   // tracks last 500-mark we painted
  var lastHaptic    = 0;   // tracks last 5,000-mark we vibrated on
  var hapticSupported = isMobile && typeof navigator !== 'undefined'
                        && typeof navigator.vibrate === 'function';

  function flashMilestone() {
    if (!tallyEl) return;
    tallyEl.classList.remove('is-milestone');
    // Force reflow so re-adding the class restarts the animation
    void tallyEl.offsetWidth;
    tallyEl.classList.add('is-milestone');
  }

  function tickTally(ts) {
    if (destroyed) return;
    var elapsed = ts - startTs;
    var rate    = 170 + Math.sin(elapsed / 850) * 50;  // ~120–220/sec
    var value   = Math.floor(elapsed / 1000 * rate);
    if (value !== lastValue && tallyEl) {
      tallyEl.textContent = value.toLocaleString();
      // 500-unit milestone highlighter stroke (per spec: every 500)
      var fiveHundred = Math.floor(value / 500);
      if (fiveHundred > lastMilestone) {
        lastMilestone = fiveHundred;
        flashMilestone();
      }
      // 5,000-unit haptic pulse (mobile only, Web Vibration API)
      var fiveK = Math.floor(value / 5000);
      if (fiveK > lastHaptic && hapticSupported) {
        lastHaptic = fiveK;
        try { navigator.vibrate(12); } catch (_) {}
      }
      lastValue = value;
    }
    rafId = requestAnimationFrame(tickTally);
  }
  rafId = requestAnimationFrame(tickTally);

  // ── Scrolling Scribe log: fading audit trail ────────────────────
  // New instruction appears at the BOTTOM (flex column-reverse) with
  // an ink-soak enter (blur → 0, fade → 1, translate up a few px).
  // Previous entries remain above it, each one aged one step fainter
  // + blurrier. After 4 entries are visible, the oldest fades out
  // into the paper texture above. Creates a visual history of
  // complex work already completed.
  var phrases = [
    'Verifying attribution windows…',
    'Calculating ROAS by campaign…',
    'Normalizing spend currency…',
    'Cross-checking invoices with HCP…',
    'Reconciling duplicate click IDs…',
    'Rolling up ad-set performance…',
    'Tagging organic vs paid leads…',
    'Balancing GL-8041 → GL-8042…',
    'Flushing stale pixel events…',
    'Merging UTM fingerprints…',
    'Scanning for ghost conversions…',
    'Indexing attribution by channel…'
  ];
  var phraseIdx = 0;
  // Newest-first array; DOM uses column-reverse so logStack[0] sits
  // visually at the bottom of the stack and older entries rise above.
  var logStack = [];

  function pushLog(text) {
    if (destroyed || !logEl) return;
    var el = document.createElement('div');
    el.className = 'll-log-entry';
    el.textContent = text;
    // Insert at firstChild; column-reverse places firstChild at the
    // visual bottom, so this IS the "newest at the bottom" position.
    logEl.insertBefore(el, logEl.firstChild);
    logStack.unshift(el);
    // Age every entry based on its position in the stack
    logStack.forEach(function(node, idx) {
      node.classList.remove('ll-log-entry--current',
                            'll-log-entry--1',
                            'll-log-entry--2',
                            'll-log-entry--3');
      if      (idx === 0) node.classList.add('ll-log-entry--current');
      else if (idx === 1) node.classList.add('ll-log-entry--1');
      else if (idx === 2) node.classList.add('ll-log-entry--2');
      else if (idx === 3) node.classList.add('ll-log-entry--3');
    });
    // Retire anything past 4 entries — fade into paper, then remove
    while (logStack.length > 4) {
      var stale = logStack.pop();
      stale.classList.add('is-leaving');
      (function(node) {
        setTimeout(function() {
          if (node && node.parentNode) node.parentNode.removeChild(node);
        }, 500);
      })(stale);
    }
  }
  // Seed the first entry immediately so the log area isn't empty
  pushLog(phrases[phraseIdx]);

  var logTimer = setInterval(function() {
    if (destroyed) return;
    phraseIdx = (phraseIdx + 1) % phrases.length;
    pushLog(phrases[phraseIdx]);
  }, 2200);

  return {
    destroy: function() {
      destroyed = true;
      if (rafId) cancelAnimationFrame(rafId);
      clearInterval(logTimer);
    },
    finalize: function(onComplete) {
      if (destroyed) { if (onComplete) onComplete(); return; }
      destroyed = true;
      if (rafId) cancelAnimationFrame(rafId);
      clearInterval(logTimer);

      // Streams fade + text snaps to focus, then the whole loader
      // cross-fades out so the real dashboard underneath can mount.
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
    var projTag = m.isCurrent
      ? '<span class="mkt-jobs-proj">PROJ</span>'
      : '';
    // Jobs cell: number on top (always right-aligned to the td's right
    // edge — so every row's number lands at the same x automatically),
    // delta + PROJ stacked BELOW in a smaller meta line. Prior layout
    // used a horizontal 3-column grid with fixed ch widths, which broke
    // on narrow viewports where the fixed columns ate all the cell's
    // width and the number column compressed to ~0px.
    var metaContent = deltaJobs + projTag;
    var jobsCell =
      '<div class="mkt-jobs-cell">' +
        '<div class="mkt-jobs-num">' + displayJobs + '</div>' +
        (metaContent ? '<div class="mkt-jobs-meta">' + metaContent + '</div>' : '') +
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
