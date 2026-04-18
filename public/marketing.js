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
function startLedgerLoader(container) {
  if (_ttLoader) _ttLoader.destroy();

  // ── 10 loader concepts — each an SVG + class package ────────
  // All SVGs use a 140x140 viewBox (except sun dial which centers
  // on 0,0 for easier rotation). CSS in marketing-paper.css drives
  // every animation — no JS timers here beyond the dismiss logic.
  var cells = [
    { n:  1, name: 'Continuous Origami Fold',        svg: lgSvg_1() },
    { n:  2, name: 'Topographical Ripple',           svg: lgSvg_2() },
    { n:  3, name: 'Ink Bleed Capillary Action',     svg: lgSvg_3() },
    { n:  4, name: 'Shifting Sand Dunes',            svg: lgSvg_4() },
    { n:  5, name: 'Sequential Leaf Vein Pathing',   svg: lgSvg_5() },
    { n:  6, name: 'Organic Wood Ring Expansion',    svg: lgSvg_6() },
    { n:  7, name: 'Terra Cotta Curing Bar',         svg: lgSvg_7() },
    { n:  8, name: 'Sun Dial Shadow Sweep',          svg: lgSvg_8() },
    { n:  9, name: 'Minimalist Botanical Drawing',   svg: lgSvg_9() },
    { n: 10, name: 'Lunar Phase Transition',         svg: lgSvg_10() }
  ];

  var gridHtml = cells.map(function(c) {
    return '<div class="lg-cell lg-cell--' + c.n + '">' +
      '<div class="lg-head">' +
        '<span class="lg-num">' + c.n + '</span>' +
        '<span class="lg-name">' + esc(c.name) + '</span>' +
      '</div>' +
      '<div class="lg-stage">' + c.svg + '</div>' +
    '</div>';
  }).join('');

  container.innerHTML =
    '<div class="ledger-loader ledger-loader--gallery" id="ttLoader">' +
      '<div class="lg-intro">' +
        '<div class="lg-intro-title">Loading animation — pick a favorite</div>' +
        '<div class="lg-intro-sub">Each cell plays its animation continuously. Tell me the number you like best and I\u2019ll wire just that one up as the real loader (removing the other nine).</div>' +
        '<button type="button" class="lg-continue" id="lgContinue" onclick="_dismissLoaderGallery()">Continue to dashboard \u2192</button>' +
      '</div>' +
      '<div class="lg-grid">' + gridHtml + '</div>' +
    '</div>';

  var rootEl      = container.querySelector('#ttLoader');
  var continueBtn = rootEl.querySelector('#lgContinue');
  var destroyed   = false;
  var pendingCb   = null;   // onComplete from finalize(), triggered on dismiss

  // Global dismiss shim — the inline onclick on #lgContinue lives
  // in HTML without module scope, so we expose the dismiss function
  // on window. Closes over `rootEl` / `pendingCb` from this init.
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
      // Data is ready — show the Continue button so the user can
      // leave the gallery when they're done evaluating.
      pendingCb = onComplete;
      if (continueBtn) continueBtn.classList.add('is-ready');
    }
  };
}

/* ──────────────────────────────────────────────────────────────
   SVG builders for each of the 10 loader concepts. Kept as small
   helper functions so the main startLedgerLoader body stays legible.
   ────────────────────────────────────────────────────────────── */

// 1 — Continuous Origami Fold: a polygon whose `points` attribute
// is animated via SMIL, simulating a square folding + unfolding.
// A drop-shadow filter deepens when the fold is tighter.
function lgSvg_1() {
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    '<defs>' +
      '<filter id="lg1-shadow" x="-30%" y="-30%" width="160%" height="160%">' +
        '<feGaussianBlur stdDeviation="3"/>' +
        '<feOffset dx="0" dy="3"/>' +
        '<feComponentTransfer><feFuncA type="linear" slope="0.35"/></feComponentTransfer>' +
        '<feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>' +
      '</filter>' +
      '<filter id="lg1-noise">' +
        '<feTurbulence baseFrequency="0.9" numOctaves="2" seed="3" stitchTiles="stitch"/>' +
        '<feColorMatrix values="0 0 0 0 0.2  0 0 0 0 0.17  0 0 0 0 0.12  0 0 0 0.12 0"/>' +
        '<feComposite in2="SourceGraphic" operator="in"/>' +
      '</filter>' +
    '</defs>' +
    '<polygon fill="#F4F1EA" filter="url(#lg1-shadow)" ' +
             'points="20,20 120,20 120,120 20,120">' +
      '<animate attributeName="points" dur="4.5s" repeatCount="indefinite" ' +
               'calcMode="spline" keyTimes="0;0.3;0.55;0.8;1" ' +
               'keySplines="0.3 0 0.2 1;0.3 0 0.2 1;0.3 0 0.2 1;0.3 0 0.2 1" ' +
               'values="20,20 120,20 120,120 20,120;' +
                       '20,25 70,20 70,120 20,115;' +
                       '25,30 120,45 120,115 25,110;' +
                       '22,20 120,28 118,120 22,120;' +
                       '20,20 120,20 120,120 20,120"/>' +
    '</polygon>' +
    '<rect width="140" height="140" fill="transparent" filter="url(#lg1-noise)" opacity="0.7"/>' +
  '</svg>';
}

// 2 — Topographical Ripple: 3 organic (bezier, not-quite-circular)
// concentric paths. CSS handles stroke draw-in + a slow breathing
// scale centered on (70, 70).
function lgSvg_2() {
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    '<g class="lg2-breath">' +
      '<path class="lg2-p lg2-p1" d="M70,22 C98,26 115,50 110,72 C104,96 86,114 70,116 C50,114 32,96 28,72 C24,50 42,24 70,22 Z"/>' +
      '<path class="lg2-p lg2-p2" d="M70,38 C90,42 100,58 98,72 C95,90 82,102 70,104 C56,102 44,90 42,72 C40,58 52,38 70,38 Z"/>' +
      '<path class="lg2-p lg2-p3" d="M70,54 C83,56 90,64 88,72 C86,82 78,90 70,90 C62,90 54,82 52,72 C50,64 57,54 70,54 Z"/>' +
    '</g>' +
  '</svg>';
}

// 3 — Ink Bleed Capillary: a single dark circle whose radius
// expands non-linearly (pause + accelerate, like ink absorbing).
// A gooey SVG filter (gaussian blur + color-matrix threshold)
// gives the expansion organic, non-vector edges.
function lgSvg_3() {
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    '<defs>' +
      '<filter id="lg3-goo">' +
        '<feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur"/>' +
        '<feColorMatrix in="blur" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="goo"/>' +
        '<feBlend in="SourceGraphic" in2="goo"/>' +
      '</filter>' +
    '</defs>' +
    '<g filter="url(#lg3-goo)">' +
      '<circle cx="70" cy="70" r="6" fill="#5C4033">' +
        '<animate attributeName="r" dur="3.2s" repeatCount="indefinite" ' +
                 'calcMode="spline" keyTimes="0;0.3;0.5;0.7;1" ' +
                 'keySplines="0.3 0 0.4 1;0.6 0 0.6 1;0.6 0 0.5 1;0.4 0 0.3 1" ' +
                 'values="6;20;40;50;6"/>' +
        '<animate attributeName="opacity" dur="3.2s" repeatCount="indefinite" ' +
                 'keyTimes="0;0.3;0.55;0.85;1" values="1;1;0.8;0.2;0"/>' +
      '</circle>' +
      '<circle cx="62" cy="65" r="4" fill="#5C4033" opacity="0.9">' +
        '<animate attributeName="r" dur="3.2s" begin="-0.3s" repeatCount="indefinite" ' +
                 'values="4;16;32;40;4"/>' +
        '<animate attributeName="opacity" dur="3.2s" begin="-0.3s" repeatCount="indefinite" ' +
                 'values="0.9;0.9;0.6;0.15;0"/>' +
      '</circle>' +
    '</g>' +
  '</svg>';
}

// 4 — Shifting Sand Dunes: two bottom paths whose `d` attribute is
// SMIL-animated through sine-wave key frames, offset in time so the
// back dune trails the front dune.
function lgSvg_4() {
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    '<defs>' +
      '<filter id="lg4-grain">' +
        '<feTurbulence baseFrequency="1.8" numOctaves="2" seed="5"/>' +
        '<feColorMatrix values="0 0 0 0 0.2  0 0 0 0 0.15  0 0 0 0 0.08  0 0 0 0.15 0"/>' +
        '<feComposite in2="SourceGraphic" operator="in"/>' +
      '</filter>' +
    '</defs>' +
    '<path fill="#C19A6B" opacity="0.95">' +
      '<animate attributeName="d" dur="9s" repeatCount="indefinite" ' +
               'values="M0,72 Q35,55 70,72 T140,72 L140,140 L0,140 Z;' +
                       'M0,72 Q35,85 70,72 T140,72 L140,140 L0,140 Z;' +
                       'M0,72 Q35,55 70,72 T140,72 L140,140 L0,140 Z"/>' +
    '</path>' +
    '<path fill="#D4B895">' +
      '<animate attributeName="d" dur="9s" begin="-3s" repeatCount="indefinite" ' +
               'values="M0,92 Q30,77 70,92 T140,92 L140,140 L0,140 Z;' +
                       'M0,92 Q30,107 70,92 T140,92 L140,140 L0,140 Z;' +
                       'M0,92 Q30,77 70,92 T140,92 L140,140 L0,140 Z"/>' +
    '</path>' +
    '<rect width="140" height="140" fill="transparent" filter="url(#lg4-grain)" opacity="0.8"/>' +
  '</svg>';
}

// 5 — Sequential Leaf Vein Pathing: stem draws first, then each
// branching vein in sequence. Whole group fades out at end, loops.
function lgSvg_5() {
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    '<g class="lg5-group">' +
      '<path class="lg5-stem"     d="M70,22 Q72,70 70,118"/>' +
      '<path class="lg5-v lg5-v1" d="M70,38 Q86,44 96,54"/>' +
      '<path class="lg5-v lg5-v2" d="M70,48 Q54,54 44,64"/>' +
      '<path class="lg5-v lg5-v3" d="M70,64 Q88,70 100,80"/>' +
      '<path class="lg5-v lg5-v4" d="M70,74 Q54,80 40,86"/>' +
      '<path class="lg5-v lg5-v5" d="M70,90 Q84,96 94,104"/>' +
    '</g>' +
  '</svg>';
}

// 6 — Organic Wood Rings: five slightly-irregular rings. Each
// scales outward from center while fading, staggered 0.45s apart.
function lgSvg_6() {
  // A reusable slightly-wonky ring path (radius ~18 centered at 0,0).
  // We translate the whole group to (70, 70) so scale works around center.
  var ring = 'M-18,-2 C-18,-14 -4,-18 0,-18 C16,-18 18,-4 18,0 ' +
             'C18,14 4,18 0,18 C-16,18 -18,4 -18,-2 Z';
  var rings = '';
  for (var i = 1; i <= 5; i++) {
    rings += '<path class="lg6-ring lg6-ring--' + i + '" d="' + ring + '"/>';
  }
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    '<g transform="translate(70 70)">' + rings + '</g>' +
  '</svg>';
}

// 7 — Terra Cotta Curing Bar: plain DOM — rounded container + inner
// fill div. CSS animates width 0→100% while background transitions
// from wet-clay to baked-terracotta.
function lgSvg_7() {
  return '<div class="lg7-wrap"><div class="lg7-fill"></div></div>';
}

// 8 — Sun Dial Shadow Sweep: static center dot + rotating shadow
// triangle whose length oscillates via SMIL keyframes. viewBox is
// centered at 0,0 for easier rotation math.
function lgSvg_8() {
  return '<svg class="lg-svg" viewBox="-60 -60 120 120">' +
    '<g class="lg8-rot">' +
      '<polygon fill="rgba(92, 84, 72, 0.18)">' +
        '<animate attributeName="points" dur="6s" repeatCount="indefinite" ' +
                 'values="-2,0 2,0 0,-48;' +
                         '-3,0 3,0 0,-55;' +
                         '-2,0 2,0 0,-40;' +
                         '-3,0 3,0 0,-55;' +
                         '-2,0 2,0 0,-48"/>' +
      '</polygon>' +
      '<animateTransform attributeName="transform" type="rotate" ' +
                        'from="0 0 0" to="360 0 0" dur="6s" repeatCount="indefinite"/>' +
    '</g>' +
    '<circle cx="0" cy="0" r="3" fill="#5C5448"/>' +
  '</svg>';
}

// 9 — Minimalist Botanical Drawing: single continuous path of an
// abstract monstera-ish leaf. CSS draws it over ~1.8s, holds ~0.3s,
// erases via negative dashoffset, loops.
function lgSvg_9() {
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    '<path class="lg9-path" d="M70,120 ' +
      'C70,100 50,88 32,74 ' +
      'C40,54 58,50 64,40 ' +
      'C68,30 72,30 76,40 ' +
      'C82,50 100,54 108,74 ' +
      'C90,88 70,100 70,120"/>' +
    '<line class="lg9-vein" x1="70" y1="36" x2="70" y2="120"/>' +
  '</svg>';
}

// 10 — Lunar Phase Transition: off-white moon base + a dark shadow
// circle masked to the moon's bounds, translating horizontally to
// sweep the visible shape through crescent → half → full phases.
function lgSvg_10() {
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    '<defs>' +
      '<mask id="lg10-mask">' +
        '<circle cx="70" cy="70" r="40" fill="white"/>' +
      '</mask>' +
      '<filter id="lg10-grain">' +
        '<feTurbulence baseFrequency="0.9" numOctaves="2" seed="7"/>' +
        '<feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.06 0"/>' +
        '<feComposite in2="SourceGraphic" operator="in"/>' +
      '</filter>' +
    '</defs>' +
    '<circle cx="70" cy="70" r="40" fill="#FDFBF7"/>' +
    '<rect width="140" height="140" fill="transparent" filter="url(#lg10-grain)" opacity="0.5"/>' +
    '<g mask="url(#lg10-mask)">' +
      '<circle cx="70" cy="70" r="40" fill="#3A4042">' +
        '<animate attributeName="cx" dur="8s" repeatCount="indefinite" ' +
                 'calcMode="spline" keyTimes="0;0.5;1" ' +
                 'keySplines="0.42 0 0.58 1;0.42 0 0.58 1" ' +
                 'values="-20;160;-20"/>' +
      '</circle>' +
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
