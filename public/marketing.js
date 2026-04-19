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

  var cells = [
    { n: 1, name: 'Isometric Bar Chart Ripple', svg: lgSvg_1() },
    { n: 2, name: 'Slide-Rule Timeline',        svg: lgSvg_2() },
    { n: 3, name: 'Blueprint Calendar Tracker', svg: lgSvg_3() },
    { n: 4, name: 'Expanding Ledger Node',      svg: lgSvg_4() },
    { n: 5, name: 'Dial & Notch Tracker',       svg: lgSvg_5() }
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
        '<div class="lg-intro-sub">Each cell plays its animation continuously. Tell me which number you like and I\u2019ll wire it up as the real loader.</div>' +
        '<button type="button" class="lg-continue" id="lgContinue" onclick="_dismissLoaderGallery()">Continue to dashboard \u2192</button>' +
      '</div>' +
      '<div class="lg-grid">' + gridHtml + '</div>' +
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

/* 1 — Isometric Bar Chart Ripple
   4×3 isometric grid of terracotta bars. Diagonal ripple sweeps
   corner-to-corner via per-bar animation-delay. SMOOTHER COLLAPSE
   tweak: CSS keyframes use per-step timing-functions so the peak
   is elastic but the retract is a clean symmetric ease — no bounce. */
function lgSvg_1() {
  var COLS = 4, ROWS = 3, CELL = 20, STEP = 0.08;
  var bars = '';
  for (var r = 0; r < ROWS; r++) {
    for (var c = 0; c < COLS; c++) {
      var x = 20 + c * CELL + r * 6;
      var y = 100 - r * 10;
      var h = 22 + (((c + r*2) % 5) * 8);
      var delay = (c + r) * STEP;
      var x1 = x, y1 = y;
      var x2 = x + 14, y2 = y - 4;
      bars +=
        '<g class="lg1-bar" style="animation-delay:' + delay + 's;transform-origin:' + x1 + 'px ' + y1 + 'px">' +
          '<polygon points="' +
            x1 + ',' + y1 + ' ' + x2 + ',' + y2 + ' ' +
            x2 + ',' + (y2 - h) + ' ' + x1 + ',' + (y1 - h) +
          '" fill="#E88140" stroke="#2C2A28" stroke-width="0.4"/>' +
          '<polygon points="' +
            x1 + ',' + (y1 - h) + ' ' + x2 + ',' + (y2 - h) + ' ' +
            (x2 + 4) + ',' + (y2 - h - 3) + ' ' + (x1 + 4) + ',' + (y1 - h - 3) +
          '" fill="#F3A268" stroke="#2C2A28" stroke-width="0.4"/>' +
          '<polygon points="' +
            x2 + ',' + y2 + ' ' + (x2 + 4) + ',' + (y2 - 3) + ' ' +
            (x2 + 4) + ',' + (y2 - h - 3) + ' ' + x2 + ',' + (y2 - h) +
          '" fill="#B85F2A" stroke="#2C2A28" stroke-width="0.4"/>' +
        '</g>';
    }
  }
  return '<svg class="lg-svg" viewBox="0 0 140 140">' + bars + '</svg>';
}

/* 2 — Slide-Rule Timeline
   Charcoal indicator sweeps the ruler at constant velocity. Every
   booked slot fires an expense dip + revenue spike + green wash.
   TWEAK: the profit readout is now a vertical rolling ticker that
   climbs from $0 to $17,420 in lockstep with the indicator; the
   loop is fully continuous (no hold at the end — indicator retracts
   smoothly during the last 15% so it lines up for the next sweep). */
function lgSvg_2() {
  var baseline = 88;
  var notches = 12;
  var dx = 108 / (notches - 1);
  var start = 16;
  var booked = [1, 3, 4, 6, 8, 9, 11];
  var spikeHeights = { 1: 22, 3: 30, 4: 18, 6: 34, 8: 26, 9: 20, 11: 32 };
  var dipHeights   = { 1:  6, 3:  8, 4:  5, 6: 10, 8:  7, 9:  5, 11:  9 };
  // Static notches on the ruler
  var tickMarks = '';
  for (var i = 0; i < notches; i++) {
    var xN = start + i * dx;
    tickMarks += '<line x1="' + xN + '" y1="' + (baseline - 3) + '" x2="' + xN + '" y2="' + (baseline + 3) + '" ' +
                 'stroke="#7A7571" stroke-width="0.5"/>';
  }
  var events = '';
  booked.forEach(function(i, idx) {
    var xB = start + i * dx;
    var delay = idx * 0.24;
    var spike = spikeHeights[i];
    var dip = dipHeights[i];
    events +=
      '<rect class="lg2-wash" x="' + (xB - 3.5) + '" y="' + (baseline - spike) + '" ' +
            'width="7" height="' + spike + '" fill="#3CA04A" opacity="0.22" rx="1" ' +
            'style="animation-delay:' + delay + 's;transform-origin:' + xB + 'px ' + baseline + 'px"/>' +
      '<line class="lg2-dip" x1="' + xB + '" y1="' + baseline + '" x2="' + xB + '" y2="' + (baseline + dip) + '" ' +
            'stroke="#D17036" stroke-width="1.6" stroke-linecap="round" ' +
            'style="animation-delay:' + delay + 's"/>' +
      '<line class="lg2-spike" x1="' + xB + '" y1="' + baseline + '" x2="' + xB + '" y2="' + (baseline - spike) + '" ' +
            'stroke="#2C2A28" stroke-width="1.6" stroke-linecap="round" ' +
            'style="animation-delay:' + delay + 's"/>';
  });
  // Rolling profit ticker — climbs $0 → $17,420 across the sweep
  var ticker = rollingTicker({
    id: 'lg2-clip', x: 70, y: 33, w: 52, h: 12,
    values: ['$0', '$1,240', '$3,720', '$6,480', '$9,340', '$12,200', '$14,860', '$17,420'],
    fill: '#2C2A28', size: 8, anchor: 'middle', className: 'lg2-roll'
  });
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    '<line x1="' + start + '" y1="' + baseline + '" x2="' + (start + (notches - 1) * dx) + '" y2="' + baseline + '" ' +
          'stroke="#2C2A28" stroke-width="0.8"/>' +
    tickMarks +
    '<g class="lg2-readout">' +
      '<rect x="44" y="22" width="52" height="16" rx="2" fill="#FAF0D5" stroke="#5C5448" stroke-width="0.5"/>' +
    '</g>' +
    ticker +
    // Caption under readout
    '<text x="70" y="46" fill="#7A7571" font-size="4" font-family="ui-monospace, monospace" ' +
          'text-anchor="middle" letter-spacing="0.08em">PROFIT</text>' +
    events +
    '<line class="lg2-indicator" x1="' + start + '" y1="' + (baseline - 14) + '" ' +
          'x2="' + start + '" y2="' + (baseline + 14) + '" ' +
          'stroke="#2C2A28" stroke-width="1.5" stroke-linecap="round"/>' +
  '</svg>';
}

/* 3 — Blueprint Calendar Tracker
   A proper monthly calendar: 7 columns (days of week) × 5 rows.
   Day-of-week header row on top, day numbers inside each cell.
   Selected appointment days fill with a diagonal charcoal crosshatch
   (drafting-wall style) in booking order. Live counters for Cost
   (terracotta) and Revenue (charcoal) both roll upward as bookings
   accumulate — spec: both tick up together. */
function lgSvg_3() {
  var COLS = 7, ROWS = 5, CELLW = 16, CELLH = 14;
  var originX = 14, originY = 40;
  var headerY = 34;
  var dows = ['S','M','T','W','T','F','S'];
  // Day-of-week header
  var header = dows.map(function(d, i) {
    return '<text x="' + (originX + i * CELLW + CELLW / 2) + '" y="' + headerY + '" ' +
           'fill="#7A7571" font-size="4.5" font-family="ui-monospace, monospace" ' +
           'font-weight="700" text-anchor="middle" letter-spacing="0.08em">' + d + '</text>';
  }).join('');
  // Calendar cells + day numbers. Month starts on Wed (offset = 3), 30 days.
  var offset = 3;
  var totalDays = 30;
  var grid = '';
  var dayLabels = '';
  for (var r = 0; r < ROWS; r++) {
    for (var c = 0; c < COLS; c++) {
      var slot = r * COLS + c;
      var day = slot - offset + 1;
      var x = originX + c * CELLW;
      var y = originY + r * CELLH;
      // Cell outline
      grid += '<rect x="' + x + '" y="' + y + '" width="' + CELLW + '" height="' + CELLH + '" ' +
              'fill="#FAF0D5" stroke="#C4BAA0" stroke-width="0.4"/>';
      if (day >= 1 && day <= totalDays) {
        dayLabels += '<text x="' + (x + 2) + '" y="' + (y + 5.5) + '" fill="#5C5448" ' +
                     'font-size="4" font-family="ui-monospace, monospace">' + day + '</text>';
      } else {
        // Gray out cell (empty)
        grid += '<rect x="' + x + '" y="' + y + '" width="' + CELLW + '" height="' + CELLH + '" ' +
                'fill="#E8E0CF" opacity="0.6"/>';
      }
    }
  }
  // Booking order (calendar slot indices for days getting hatched). 8 bookings.
  var bookings = [5, 8, 11, 14, 16, 18, 22, 25, 28, 31];
  var hatches = '';
  bookings.forEach(function(slot, i) {
    var r = Math.floor(slot / COLS);
    var c = slot % COLS;
    var x = originX + c * CELLW;
    var y = originY + r * CELLH;
    var delay = i * 0.36;
    // Diagonal crosshatch lines inside cell
    var lines = '';
    for (var k = -2; k <= 4; k++) {
      var x1 = x + k * 4;
      var y1 = y;
      var x2 = x + k * 4 + CELLH;
      var y2 = y + CELLH;
      var xa = Math.max(x, x1);
      var ya = y + Math.max(0, x - x1);
      var xb = Math.min(x + CELLW, x2);
      var yb = y + CELLH - Math.max(0, x2 - (x + CELLW));
      lines += '<line x1="' + xa + '" y1="' + ya + '" x2="' + xb + '" y2="' + yb + '" ' +
               'stroke="#2C2A28" stroke-width="0.6" stroke-linecap="round"/>';
    }
    hatches +=
      '<g class="lg3-hatch" style="animation-delay:' + delay + 's">' +
        '<clipPath id="lg3-clip-' + slot + '"><rect x="' + x + '" y="' + y + '" width="' + CELLW + '" height="' + CELLH + '"/></clipPath>' +
        '<g clip-path="url(#lg3-clip-' + slot + ')">' + lines + '</g>' +
      '</g>';
  });
  // Two rolling counters — cost and revenue, both rising together
  var costValues = ['$0', '$280', '$540', '$820', '$1,180', '$1,420', '$1,760', '$2,180'];
  var revValues  = ['$0', '$1,200', '$2,400', '$3,600', '$4,800', '$6,100', '$7,300', '$8,420'];
  var costTicker = rollingTicker({
    id: 'lg3-cost-clip', x: 34, y: 20, w: 36, h: 10,
    values: costValues, fill: '#B85F2A', size: 6.5, anchor: 'middle', className: 'lg3-roll'
  });
  var revTicker = rollingTicker({
    id: 'lg3-rev-clip', x: 102, y: 20, w: 36, h: 10,
    values: revValues, fill: '#2C2A28', size: 6.5, anchor: 'middle', className: 'lg3-roll'
  });
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    // Counter labels
    '<text x="34" y="12" fill="#7A7571" font-size="3.8" font-family="ui-monospace, monospace" ' +
          'text-anchor="middle" letter-spacing="0.08em">COST</text>' +
    '<text x="102" y="12" fill="#7A7571" font-size="3.8" font-family="ui-monospace, monospace" ' +
          'text-anchor="middle" letter-spacing="0.08em">REVENUE</text>' +
    costTicker +
    revTicker +
    // Calendar body
    header +
    grid +
    dayLabels +
    hatches +
  '</svg>';
}

/* 4 — Expanding Ledger Node
   6 satellite nodes connected to a central PROFIT hub. Each node
   inflates smoothly, revealing a micro-donut (terracotta expense
   chased by green profit). Pulse dots (SMIL) fire hub→node. The
   central profit ticker rolls continuously from $0 up to $70,000.
   TWEAKS: smoother continuous flow (no hold at peak); profit roll
   is monotonic the whole way through. */
function lgSvg_4() {
  var hub = { x: 70, y: 70 };
  var nodes = [
    { x: 30, y: 30 }, { x: 110, y: 30 },
    { x: 22, y: 70 }, { x: 118, y: 70 },
    { x: 30, y: 110 }, { x: 110, y: 110 }
  ];
  var connects = nodes.map(function(n) {
    return '<line x1="' + hub.x + '" y1="' + hub.y + '" x2="' + n.x + '" y2="' + n.y + '" ' +
           'stroke="#C4BAA0" stroke-width="0.4" stroke-dasharray="2 2"/>';
  }).join('');
  var pulses = nodes.map(function(n, i) {
    var delay = i * 0.45 + 0.3;
    return '<circle class="lg4-pulse lg4-pulse--' + i + '" cx="' + hub.x + '" cy="' + hub.y + '" ' +
           'r="1.8" fill="#3CA04A" opacity="0">' +
             '<animate attributeName="cx" dur="6s" begin="' + delay + 's" repeatCount="indefinite" ' +
                      'values="' + hub.x + ';' + n.x + ';' + n.x + '" keyTimes="0;0.12;1"/>' +
             '<animate attributeName="cy" dur="6s" begin="' + delay + 's" repeatCount="indefinite" ' +
                      'values="' + hub.y + ';' + n.y + ';' + n.y + '" keyTimes="0;0.12;1"/>' +
             '<animate attributeName="opacity" dur="6s" begin="' + delay + 's" repeatCount="indefinite" ' +
                      'values="0;1;1;0" keyTimes="0;0.04;0.12;0.14"/>' +
           '</circle>';
  }).join('');
  var svgNodes = nodes.map(function(n, i) {
    var delay = i * 0.45;
    var r = 10;
    return '<g class="lg4-node" style="animation-delay:' + delay + 's;transform-origin:' + n.x + 'px ' + n.y + 'px">' +
             '<circle cx="' + n.x + '" cy="' + n.y + '" r="' + r + '" fill="#FAF9F6" stroke="#2C2A28" stroke-width="0.6"/>' +
             '<circle class="lg4-expense" cx="' + n.x + '" cy="' + n.y + '" r="7" ' +
                     'fill="none" stroke="#D17036" stroke-width="3" ' +
                     'stroke-dasharray="8 36" stroke-dashoffset="11" ' +
                     'transform="rotate(-90 ' + n.x + ' ' + n.y + ')" ' +
                     'style="animation-delay:' + delay + 's"/>' +
             '<circle class="lg4-profit" cx="' + n.x + '" cy="' + n.y + '" r="7" ' +
                     'fill="none" stroke="#3CA04A" stroke-width="3" ' +
                     'stroke-dasharray="36 8" stroke-dashoffset="-8" ' +
                     'transform="rotate(-90 ' + n.x + ' ' + n.y + ')" ' +
                     'style="animation-delay:' + (delay + 0.14) + 's"/>' +
           '</g>';
  }).join('');
  // Rolling profit — ramps to $70,000 across the full cycle
  var profitValues = ['$0', '$8,400', '$18,200', '$28,600', '$39,400', '$50,200', '$60,800', '$70,000'];
  var ticker = rollingTicker({
    id: 'lg4-clip', x: 70, y: 74, w: 24, h: 9,
    values: profitValues, fill: '#2C2A28', size: 6, anchor: 'middle', className: 'lg4-roll'
  });
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    connects +
    svgNodes +
    pulses +
    // Central hub
    '<circle cx="' + hub.x + '" cy="' + hub.y + '" r="14" fill="#FAF9F6" stroke="#2C2A28" stroke-width="0.8"/>' +
    '<text x="70" y="66" fill="#7A7571" font-size="3.8" font-family="ui-monospace, monospace" ' +
          'text-anchor="middle" letter-spacing="0.08em">PROFIT</text>' +
    ticker +
  '</svg>';
}

/* 5 — Dial & Notch Tracker
   Circular dial with 24 tick marks, terracotta inner breathing ring,
   green revenue arc sweeping the perimeter, and now a SWEEPING
   NEEDLE that tracks the revenue arc's progress. The margin
   percentage rolls 0% → 38% (tick-up), syncing with the arc.
   Subtle outer-glow pulse when the margin locks in. */
function lgSvg_5() {
  var cx = 70, cy = 72, rOuter = 44, rRing = 36, rInner = 26;
  var circRing = 2 * Math.PI * rRing;
  var ticks = '';
  for (var i = 0; i < 24; i++) {
    var angle = (i / 24) * Math.PI * 2 - Math.PI / 2;
    var x1 = cx + Math.cos(angle) * (rOuter - 4);
    var y1 = cy + Math.sin(angle) * (rOuter - 4);
    var x2 = cx + Math.cos(angle) * rOuter;
    var y2 = cy + Math.sin(angle) * rOuter;
    var delay = i * 0.07;
    ticks += '<line class="lg5-tick" x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" ' +
                  'x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" ' +
                  'stroke="#2C2A28" stroke-width="1" stroke-linecap="round" ' +
                  'style="animation-delay:' + delay.toFixed(2) + 's"/>';
  }
  // Rolling margin ticker — 0% → 38%
  var marginValues = ['0%', '6%', '12%', '18%', '24%', '30%', '34%', '38%'];
  var ticker = rollingTicker({
    id: 'lg5-clip', x: cx, y: cy + 8, w: 22, h: 12,
    values: marginValues, fill: '#2C2A28', size: 10, anchor: 'middle', className: 'lg5-roll'
  });
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    '<defs>' +
      '<filter id="lg5-glow" x="-50%" y="-50%" width="200%" height="200%">' +
        '<feGaussianBlur stdDeviation="2"/>' +
      '</filter>' +
    '</defs>' +
    // Faint dial face
    '<circle cx="' + cx + '" cy="' + cy + '" r="' + rOuter + '" fill="#FAF0D5" stroke="#7A7571" stroke-width="0.4"/>' +
    // Glow ring (hidden until margin locks)
    '<circle class="lg5-glow" cx="' + cx + '" cy="' + cy + '" r="' + rOuter + '" ' +
            'fill="none" stroke="#3CA04A" stroke-width="2" opacity="0" filter="url(#lg5-glow)"/>' +
    ticks +
    // Terracotta inner breathing ring
    '<circle class="lg5-expense" cx="' + cx + '" cy="' + cy + '" r="' + rInner + '" ' +
            'fill="none" stroke="#D17036" stroke-width="2" opacity="0.55"/>' +
    // Green revenue arc
    '<circle class="lg5-revenue" cx="' + cx + '" cy="' + cy + '" r="' + rRing + '" ' +
            'fill="none" stroke="#3CA04A" stroke-width="3" stroke-linecap="round" ' +
            'stroke-dasharray="' + circRing.toFixed(2) + '" stroke-dashoffset="' + circRing.toFixed(2) + '" ' +
            'transform="rotate(-90 ' + cx + ' ' + cy + ')"/>' +
    // Sweeping needle — rotates around center from -90° (12 o'clock) to +270° (full rev)
    '<g class="lg5-needle" style="transform-origin:' + cx + 'px ' + cy + 'px">' +
      '<line x1="' + cx + '" y1="' + cy + '" x2="' + cx + '" y2="' + (cy - rRing - 2) + '" ' +
            'stroke="#2C2A28" stroke-width="1.2" stroke-linecap="round"/>' +
      '<circle cx="' + cx + '" cy="' + (cy - rRing - 2) + '" r="1.6" fill="#2C2A28"/>' +
    '</g>' +
    // Pivot cap
    '<circle cx="' + cx + '" cy="' + cy + '" r="2.2" fill="#2C2A28"/>' +
    // Center label
    '<text x="' + cx + '" y="' + (cy - 3) + '" fill="#7A7571" font-size="4" ' +
          'font-family="ui-monospace, monospace" text-anchor="middle" letter-spacing="0.08em">MARGIN</text>' +
    ticker +
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
