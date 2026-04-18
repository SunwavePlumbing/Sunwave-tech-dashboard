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

  // ── 13 loader concepts — each an SVG / DOM + class package ──
  // Variants 1–3 are the kept favorites (pencil circle, isometric
  // ripple, terracotta curing bar). Variants 4–13 are new isometric
  // variations on the same foundation: every one of them layers
  // "system doing heavy 3D processing" on top of the bar-ripple
  // primitive with a specific thematic twist (math / paper / money
  // / scheduling).
  // Most motion lives in marketing-paper.css; SMIL is used only for
  // attributes CSS can't reach (`points`, `d`, `cx`, etc.).
  var cells = [
    { n:  1, name: 'Drafting Pencil Circle Trace (kept)', svg: lgSvg_1()  },
    { n:  2, name: 'Isometric Bar Chart Ripple (kept)',   svg: lgSvg_2()  },
    { n:  3, name: 'Terra Cotta Curing Bar (kept)',       svg: lgSvg_3()  },
    { n:  4, name: 'Isometric Extrusion & Segment',        svg: lgSvg_4()  },
    { n:  5, name: 'Slide-Rule Timeline',                  svg: lgSvg_5()  },
    { n:  6, name: 'Blueprint Area Tracker',               svg: lgSvg_6()  },
    { n:  7, name: 'Expanding Ledger Node',                svg: lgSvg_7()  },
    { n:  8, name: 'Receipt Roll Matrix',                  svg: lgSvg_8()  },
    { n:  9, name: 'Shifting Topography',                  svg: lgSvg_9()  },
    { n: 10, name: 'Dial & Notch Tracker',                 svg: lgSvg_10() },
    { n: 11, name: 'Balance-Scale Blocks',                 svg: lgSvg_11() },
    { n: 12, name: 'Connected Flow-Chart',                 svg: lgSvg_12() },
    { n: 13, name: 'Waterfall Stack',                      svg: lgSvg_13() }
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
   SVG builders for each of the 17 loader concepts. Kept as small
   helper functions so the main startLedgerLoader body stays legible.
   Palette hewn to the site theme: Dark Charcoal (#2C2A28), Graphite
   (#7A7571), Oxford Blue (#002147), Sunflower Yellow (#FFD700),
   plus warm paper tones and the terracotta / crane-shadow accents
   called out in the individual specs.
   ────────────────────────────────────────────────────────────── */

/* 1 — Drafting Pencil Circle Trace
   A perfect circle drawn by stroke-dashoffset with asymmetric easing
   (fast start, slow finish) + a small yellow dimension line that
   fades in after the pencil reaches the top. A soft blur filter on
   the pencil stroke simulates graphite dust settling into paper. */
function lgSvg_1() {
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    '<defs>' +
      '<filter id="lg1-dust" x="-20%" y="-20%" width="140%" height="140%">' +
        '<feGaussianBlur stdDeviation="0.35"/>' +
      '</filter>' +
    '</defs>' +
    // Faint paper grid underlay
    '<g stroke="#E3DFD3" stroke-width="0.4" opacity="0.8">' +
      '<line x1="0" y1="70" x2="140" y2="70"/>' +
      '<line x1="70" y1="0" x2="70" y2="140"/>' +
    '</g>' +
    // The pencil-drawn circle (stroke-dashoffset animation in CSS)
    '<circle class="lg1-circle" cx="70" cy="70" r="42" ' +
            'fill="none" stroke="#2C2A28" stroke-width="1.4" ' +
            'stroke-linecap="round" filter="url(#lg1-dust)"/>' +
    // Yellow technical dimension line with small perpendicular ticks
    // on each end. Positioned diagonally from the circle's right edge.
    '<g class="lg1-dim">' +
      '<line x1="114" y1="46" x2="126" y2="30" stroke="#FFD700" stroke-width="1" stroke-linecap="round"/>' +
      '<line x1="112" y1="48" x2="116" y2="44" stroke="#FFD700" stroke-width="1" stroke-linecap="round"/>' +
      '<line x1="124" y1="32" x2="128" y2="28" stroke="#FFD700" stroke-width="1" stroke-linecap="round"/>' +
      '<text x="130" y="28" fill="#9A8900" font-size="6" font-family="ui-monospace, monospace">R42</text>' +
    '</g>' +
  '</svg>';
}

/* 2 — Isometric Bar Chart Ripple (KEPT — now variant #2)
   4×3 grid of isometric bars. Each bar scaleY-animates 0→1 with an
   elastic cubic-bezier that overshoots then wobbles into place. The
   diagonal delay (delay = (col + row) * step) produces a ripple that
   sweeps corner-to-corner. This is the foundation all the variants
   below riff on. */
function lgSvg_2() {
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
        '<g class="lg2-bar" style="animation-delay:' + delay + 's;transform-origin:' + x1 + 'px ' + y1 + 'px">' +
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

/* 3 — Terra Cotta Curing Bar (KEPT — now variant #3)
   Plain DOM — rounded container + inner fill div. CSS animates width
   0→100% while background transitions from wet-clay to baked-terracotta. */
function lgSvg_3() {
  return '<div class="lg3-wrap"><div class="lg3-fill"></div></div>';
}

/* ──────────────────────────────────────────────────────────────
   VARIANTS 4–13 — New "Calendar → Finance" gallery
   Palette is strict on purpose so the set reads as one family:
     • Paper:    #FAF9F6 (bg inherits the card)
     • Charcoal: #2C2A28 (structure / revenue)
     • Terracotta: #B85F2A / #D17036 / #E88140 (expense)
     • Green:    #3CA04A / #5DBF69 (profit)
     • Graphite: #7A7571 (guides, faint lines)
   Every variant loops seamlessly; easings are chosen to feel
   physical (gravity / spring / cushion) rather than mechanical.
   ────────────────────────────────────────────────────────────── */

/* 4 — Isometric Extrusion & Segment
   4×3 isometric calendar grid. Diagonal ripple sweeps front-left
   → back-right. Each day extrudes from flat square into a 3D block
   whose front face splits: short terracotta band (expense) bottom,
   taller green (profit) stacked on top. A yellow monospace revenue
   figure ticks up during rise, snapping to final at peak. */
function lgSvg_4() {
  var COLS = 4, ROWS = 3, CELLW = 18, CELLH = 12, STEP = 0.08;
  var topOff = 4;
  var bars = '';
  // Predetermined per-cell revenue & split (expense/profit pixels)
  var vals = [
    '$1,240', '$860', '$2,100', '$540',
    '$1,820', '$1,120', '$760', '$2,480',
    '$940', '$1,660', '$1,380', '$2,020'
  ];
  for (var r = 0; r < ROWS; r++) {
    for (var c = 0; c < COLS; c++) {
      var x = 18 + c * CELLW + r * 5;
      var y = 108 - r * CELLH;
      var h = 32 + ((c + r * 2) % 4) * 6;
      var expenseH = Math.round(h * 0.28);   // terracotta band
      var profitH  = h - expenseH;            // green block
      var delay = (c + r) * STEP;
      var x1 = x, y1 = y, x2 = x + CELLW - 4, y2 = y - topOff;
      var splitYFront = y - expenseH;
      var splitYBack  = y - topOff - expenseH;
      var idx = r * COLS + c;
      bars +=
        '<g class="lg4-cell" style="animation-delay:' + delay + 's;transform-origin:' + x1 + 'px ' + y1 + 'px">' +
          // Expense band (terracotta) — bottom of front face
          '<polygon points="' +
            x1 + ',' + y1 + ' ' + x2 + ',' + y2 + ' ' +
            x2 + ',' + splitYBack + ' ' + x1 + ',' + splitYFront +
          '" fill="#D17036" stroke="#2C2A28" stroke-width="0.4"/>' +
          // Profit block (green) — top of front face
          '<polygon points="' +
            x1 + ',' + splitYFront + ' ' + x2 + ',' + splitYBack + ' ' +
            x2 + ',' + (y2 - h) + ' ' + x1 + ',' + (y1 - h) +
          '" fill="#3CA04A" stroke="#2C2A28" stroke-width="0.4"/>' +
          // Top face (lighter green)
          '<polygon points="' +
            x1 + ',' + (y1 - h) + ' ' + x2 + ',' + (y2 - h) + ' ' +
            (x2 + 3) + ',' + (y2 - h - 2) + ' ' + (x1 + 3) + ',' + (y1 - h - 2) +
          '" fill="#5DBF69" stroke="#2C2A28" stroke-width="0.4"/>' +
          // Right side (darker — depth)
          '<polygon points="' +
            x2 + ',' + y2 + ' ' + (x2 + 3) + ',' + (y2 - 2) + ' ' +
            (x2 + 3) + ',' + (y2 - h - 2) + ' ' + x2 + ',' + (y2 - h) +
          '" fill="#1F5C28" stroke="#2C2A28" stroke-width="0.4"/>' +
        '</g>' +
        // Floating revenue label
        '<text class="lg4-tick" x="' + (x1 + 6) + '" y="' + (y1 - h - 4) + '" ' +
              'fill="#2C2A28" font-size="4.2" font-family="ui-monospace, monospace" ' +
              'font-weight="700" text-anchor="middle" style="animation-delay:' + delay + 's">' +
          esc(vals[idx]) +
        '</text>';
    }
  }
  return '<svg class="lg-svg" viewBox="0 0 140 140">' + bars + '</svg>';
}

/* 5 — Slide-Rule Timeline
   Horizontal technical timeline with evenly-spaced day notches.
   A charcoal indicator traverses left→right. At each booked day
   three elements fire in sync: a short terracotta dip below, a
   tall charcoal spike above (revenue), and between them a soft
   green wash (profit). A digit ticker rolls in the top corner. */
function lgSvg_5() {
  var baseline = 88;
  var notches = 12;
  var dx = 108 / (notches - 1);
  var start = 16;
  var booked = [1, 3, 4, 6, 8, 9, 11];   // indices that fire
  var spikeHeights = { 1: 22, 3: 30, 4: 18, 6: 34, 8: 26, 9: 20, 11: 32 };
  var dipHeights   = { 1:  6, 3:  8, 4:  5, 6: 10, 8:  7, 9:  5, 11:  9 };
  // Static notches on the ruler
  var tickMarks = '';
  for (var i = 0; i < notches; i++) {
    var xN = start + i * dx;
    tickMarks += '<line x1="' + xN + '" y1="' + (baseline - 3) + '" x2="' + xN + '" y2="' + (baseline + 3) + '" ' +
                 'stroke="#7A7571" stroke-width="0.5"/>';
  }
  // Animated elements per booked slot
  var events = '';
  booked.forEach(function(i, idx) {
    var xB = start + i * dx;
    var delay = idx * 0.24;
    var spike = spikeHeights[i];
    var dip = dipHeights[i];
    events +=
      // Green profit wash — appears between dip and spike
      '<rect class="lg5-wash" x="' + (xB - 3.5) + '" y="' + (baseline - spike) + '" ' +
            'width="7" height="' + spike + '" fill="#3CA04A" opacity="0.22" rx="1" ' +
            'style="animation-delay:' + delay + 's"/>' +
      // Expense dip (terracotta, short line below baseline)
      '<line class="lg5-dip" x1="' + xB + '" y1="' + baseline + '" x2="' + xB + '" y2="' + (baseline + dip) + '" ' +
            'stroke="#D17036" stroke-width="1.6" stroke-linecap="round" ' +
            'style="animation-delay:' + delay + 's"/>' +
      // Revenue spike (charcoal, tall line above baseline)
      '<line class="lg5-spike" x1="' + xB + '" y1="' + baseline + '" x2="' + xB + '" y2="' + (baseline - spike) + '" ' +
            'stroke="#2C2A28" stroke-width="1.6" stroke-linecap="round" ' +
            'style="animation-delay:' + delay + 's"/>';
  });
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    // Ruler baseline
    '<line x1="' + start + '" y1="' + baseline + '" x2="' + (start + (notches - 1) * dx) + '" y2="' + baseline + '" ' +
          'stroke="#2C2A28" stroke-width="0.8"/>' +
    tickMarks +
    // Running total "display" at top — like a mechanical calculator readout
    '<g class="lg5-readout">' +
      '<rect x="44" y="22" width="52" height="16" rx="2" fill="#FAF0D5" stroke="#5C5448" stroke-width="0.5"/>' +
      '<text class="lg5-readout-num" x="70" y="33" fill="#2C2A28" font-size="8" ' +
            'font-family="ui-monospace, monospace" font-weight="700" text-anchor="middle" ' +
            'style="font-variant-numeric: tabular-nums">$17,420</text>' +
    '</g>' +
    events +
    // Indicator (traverses the timeline)
    '<line class="lg5-indicator" x1="' + start + '" y1="' + (baseline - 14) + '" ' +
          'x2="' + start + '" y2="' + (baseline + 14) + '" ' +
          'stroke="#2C2A28" stroke-width="1.5" stroke-linecap="round"/>' +
  '</svg>';
}

/* 6 — Blueprint Area Tracker
   Top-down floor plan. 5×3 grid of rooms. Each cell fills with a
   diagonal charcoal crosshatch (stroke-dashoffset draw). Technical
   dimension lines on right + bottom "measure" Cost and Revenue.
   A clean ledger-sans label reads the running totals. */
function lgSvg_6() {
  var COLS = 5, ROWS = 3, CELLW = 18, CELLH = 18;
  var originX = 22, originY = 34;
  // Grid rectangles
  var grid = '';
  for (var r = 0; r < ROWS; r++) {
    for (var c = 0; c < COLS; c++) {
      var x = originX + c * CELLW;
      var y = originY + r * CELLH;
      grid += '<rect x="' + x + '" y="' + y + '" width="' + CELLW + '" height="' + CELLH + '" ' +
              'fill="none" stroke="#7A7571" stroke-width="0.4"/>';
    }
  }
  // Crosshatched fills (staggered stroke reveal)
  var hatches = '';
  var fillOrder = [0, 3, 7, 4, 10, 12, 1, 8, 13, 2];
  fillOrder.forEach(function(cellIdx, i) {
    var r = Math.floor(cellIdx / COLS);
    var c = cellIdx % COLS;
    var x = originX + c * CELLW;
    var y = originY + r * CELLH;
    var delay = i * 0.22;
    // Six diagonal lines per cell
    var lines = '';
    for (var k = -2; k <= 5; k++) {
      var x1 = x + k * 4;
      var y1 = y;
      var x2 = x + k * 4 + CELLH;
      var y2 = y + CELLH;
      // clip visually via drawing — the rect above will cover spill
      lines += '<line x1="' + Math.max(x, x1) + '" y1="' + (y1 + Math.max(0, x - x1)) + '" ' +
                     'x2="' + Math.min(x + CELLW, x2) + '" y2="' + (y2 - Math.max(0, x2 - (x + CELLW))) + '" ' +
                     'stroke="#2C2A28" stroke-width="0.6" stroke-linecap="round"/>';
    }
    hatches +=
      '<g class="lg6-hatch" style="animation-delay:' + delay + 's">' +
        '<clipPath id="lg6-clip-' + cellIdx + '"><rect x="' + x + '" y="' + y + '" width="' + CELLW + '" height="' + CELLH + '"/></clipPath>' +
        '<g clip-path="url(#lg6-clip-' + cellIdx + ')">' + lines + '</g>' +
      '</g>';
  });
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    grid +
    hatches +
    // Top dimension line with arrows — "Revenue"
    '<g stroke="#2C2A28" fill="#2C2A28" stroke-width="0.5">' +
      '<line x1="' + originX + '" y1="24" x2="' + (originX + COLS * CELLW) + '" y2="24"/>' +
      '<line x1="' + originX + '" y1="22" x2="' + originX + '" y2="26"/>' +
      '<line x1="' + (originX + COLS * CELLW) + '" y1="22" x2="' + (originX + COLS * CELLW) + '" y2="26"/>' +
    '</g>' +
    '<text x="70" y="20" fill="#2C2A28" font-size="5.5" font-family="ui-monospace, monospace" ' +
          'font-weight="700" text-anchor="middle">REVENUE</text>' +
    '<text class="lg6-revenue-num" x="70" y="30" fill="#2C2A28" font-size="5" ' +
          'font-family="ui-monospace, monospace" text-anchor="middle" ' +
          'style="font-variant-numeric: tabular-nums">$8,420</text>' +
    // Right dimension line — "Cost"
    '<g stroke="#D17036" fill="#D17036" stroke-width="0.5">' +
      '<line x1="120" y1="' + originY + '" x2="120" y2="' + (originY + ROWS * CELLH) + '"/>' +
      '<line x1="118" y1="' + originY + '" x2="122" y2="' + originY + '"/>' +
      '<line x1="118" y1="' + (originY + ROWS * CELLH) + '" x2="122" y2="' + (originY + ROWS * CELLH) + '"/>' +
    '</g>' +
    '<text x="128" y="' + (originY + ROWS * CELLH / 2 - 3) + '" fill="#B85F2A" font-size="5" ' +
          'font-family="ui-monospace, monospace" font-weight="700">COST</text>' +
    '<text class="lg6-cost-num" x="128" y="' + (originY + ROWS * CELLH / 2 + 4) + '" fill="#B85F2A" ' +
          'font-size="5" font-family="ui-monospace, monospace" ' +
          'style="font-variant-numeric: tabular-nums">$2,180</text>' +
  '</svg>';
}

/* 7 — Expanding Ledger Node
   Network of circular nodes connected by faint pencil lines.
   Each node inflates (ink-drop scale) revealing a micro-donut:
   terracotta slice (expense) sweeps first, then a larger green
   slice (profit). A pulse fires along the connecting line to a
   central hub, which displays a scaling "Total Profit" number. */
function lgSvg_7() {
  var hub = { x: 70, y: 70 };
  var nodes = [
    { x: 30, y: 30 }, { x: 110, y: 30 },
    { x: 22, y: 70 }, { x: 118, y: 70 },
    { x: 30, y: 110 }, { x: 110, y: 110 }
  ];
  // Connecting lines (hub → each node)
  var connects = nodes.map(function(n, i) {
    return '<line x1="' + hub.x + '" y1="' + hub.y + '" x2="' + n.x + '" y2="' + n.y + '" ' +
           'stroke="#C4BAA0" stroke-width="0.4" stroke-dasharray="2 2"/>';
  }).join('');
  // Animated pulse dots that travel hub→node
  var pulses = nodes.map(function(n, i) {
    var delay = i * 0.28 + 0.4;
    return '<circle class="lg7-pulse lg7-pulse--' + i + '" cx="' + hub.x + '" cy="' + hub.y + '" ' +
           'r="1.8" fill="#3CA04A" opacity="0" style="animation-delay:' + delay + 's">' +
             '<animate attributeName="cx" dur="4.5s" begin="' + delay + 's" repeatCount="indefinite" ' +
                      'values="' + hub.x + ';' + n.x + ';' + n.x + '" keyTimes="0;0.22;1"/>' +
             '<animate attributeName="cy" dur="4.5s" begin="' + delay + 's" repeatCount="indefinite" ' +
                      'values="' + hub.y + ';' + n.y + ';' + n.y + '" keyTimes="0;0.22;1"/>' +
           '</circle>';
  }).join('');
  // Nodes: outer ring + donut arcs. Donut is two stroked circles, each ~60deg & ~300deg segments,
  // animated via dash offset.
  var svgNodes = nodes.map(function(n, i) {
    var delay = i * 0.28;
    var r = 10;
    // For a circle of radius 8, circumference = 2π·8 ≈ 50.27
    // Expense slice ≈ 18%, profit ≈ 82%
    return '<g class="lg7-node" style="animation-delay:' + delay + 's;transform-origin:' + n.x + 'px ' + n.y + 'px">' +
             '<circle cx="' + n.x + '" cy="' + n.y + '" r="' + r + '" fill="#FAF9F6" stroke="#2C2A28" stroke-width="0.6"/>' +
             // Expense slice (terracotta)
             '<circle class="lg7-expense" cx="' + n.x + '" cy="' + n.y + '" r="7" ' +
                     'fill="none" stroke="#D17036" stroke-width="3" ' +
                     'stroke-dasharray="8 36" stroke-dashoffset="11" ' +
                     'transform="rotate(-90 ' + n.x + ' ' + n.y + ')" ' +
                     'style="animation-delay:' + delay + 's"/>' +
             // Profit slice (green, swept after expense)
             '<circle class="lg7-profit" cx="' + n.x + '" cy="' + n.y + '" r="7" ' +
                     'fill="none" stroke="#3CA04A" stroke-width="3" ' +
                     'stroke-dasharray="36 8" stroke-dashoffset="-8" ' +
                     'transform="rotate(-90 ' + n.x + ' ' + n.y + ')" ' +
                     'style="animation-delay:' + (delay + 0.12) + 's"/>' +
           '</g>';
  }).join('');
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    connects +
    svgNodes +
    pulses +
    // Central hub
    '<circle cx="' + hub.x + '" cy="' + hub.y + '" r="14" fill="#FAF9F6" stroke="#2C2A28" stroke-width="0.8"/>' +
    '<text x="70" y="66" fill="#7A7571" font-size="4" font-family="ui-monospace, monospace" ' +
          'text-anchor="middle">PROFIT</text>' +
    '<text class="lg7-hub-num" x="70" y="74" fill="#2C2A28" font-size="6" ' +
          'font-family="ui-monospace, monospace" font-weight="700" text-anchor="middle" ' +
          'style="font-variant-numeric: tabular-nums">$6,240</text>' +
  '</svg>';
}

/* 8 — Receipt Roll Matrix
   A heavy-stock receipt rolls upward. Appointment blocks stamp on
   (scale + ink blot). Next to each, three numbers fade in in sequence:
   Revenue, −Spend, =Profit. A running total at the bottom rolls its
   digits over to update the month's profit. */
function lgSvg_8() {
  var entries = [
    { rev: '$420', sp: '$96',  pr: '$324' },
    { rev: '$580', sp: '$140', pr: '$440' },
    { rev: '$310', sp: '$72',  pr: '$238' },
    { rev: '$680', sp: '$182', pr: '$498' }
  ];
  var itemH = 22;
  var topStart = 22;
  var lines = entries.map(function(e, i) {
    var y = topStart + i * itemH;
    var delay = i * 0.6;
    return '<g class="lg8-row" style="animation-delay:' + delay + 's">' +
             // Stamp block (appointment)
             '<rect class="lg8-stamp" x="14" y="' + y + '" width="14" height="14" ' +
                   'fill="#2C2A28" rx="1" ' +
                   'style="animation-delay:' + delay + 's;transform-origin:21px ' + (y + 7) + 'px"/>' +
             // Revenue
             '<text class="lg8-rev" x="34" y="' + (y + 6) + '" fill="#2C2A28" ' +
                   'font-size="5" font-family="ui-monospace, monospace" font-weight="700" ' +
                   'style="font-variant-numeric: tabular-nums;animation-delay:' + (delay + 0.15) + 's">' +
               'REV  ' + esc(e.rev) + '</text>' +
             // Spend
             '<text class="lg8-sp" x="34" y="' + (y + 11.5) + '" fill="#B85F2A" ' +
                   'font-size="5" font-family="ui-monospace, monospace" ' +
                   'style="font-variant-numeric: tabular-nums;animation-delay:' + (delay + 0.3) + 's">' +
               '\u2212' + '  ' + esc(e.sp) + '</text>' +
             // Profit
             '<text class="lg8-pr" x="34" y="' + (y + 17) + '" fill="#3CA04A" ' +
                   'font-size="5" font-family="ui-monospace, monospace" font-weight="700" ' +
                   'style="font-variant-numeric: tabular-nums;animation-delay:' + (delay + 0.45) + 's">' +
               '\u003D ' + esc(e.pr) + '</text>' +
           '</g>';
  }).join('');
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    // Receipt paper (slightly warmer panel)
    '<rect x="10" y="14" width="100" height="106" fill="#FAF0D5" stroke="#5C5448" stroke-width="0.5"/>' +
    // Perforated top edge
    '<g stroke="#5C5448" stroke-width="0.5" stroke-dasharray="2 2">' +
      '<line x1="10" y1="14" x2="110" y2="14"/>' +
    '</g>' +
    // Rolling scroll group — animated translateY
    '<g class="lg8-scroll">' + lines + '</g>' +
    // Running total band at bottom
    '<rect x="10" y="120" width="100" height="14" fill="#2C2A28"/>' +
    '<text x="16" y="130" fill="#FAF0D5" font-size="4.5" font-family="ui-monospace, monospace">TOTAL</text>' +
    '<text class="lg8-total" x="104" y="130" fill="#5DBF69" font-size="7" ' +
          'font-family="ui-monospace, monospace" font-weight="700" text-anchor="end" ' +
          'style="font-variant-numeric: tabular-nums">$1,500</text>' +
  '</svg>';
}

/* 9 — Shifting Topography
   4×3 isometric grid starts flat. A wave fills cells — instead of
   rising, they push DOWNWARD into indentations (cost). Green liquid
   then rises out of each pit, overflows, and stacks higher than the
   original plain — profit surpassing cost. Heavy physical easing. */
function lgSvg_9() {
  var COLS = 4, ROWS = 3, CELLW = 22, CELLH = 11, STEP = 0.12;
  var topOff = 4;
  var cells = '';
  var liquids = '';
  for (var r = 0; r < ROWS; r++) {
    for (var c = 0; c < COLS; c++) {
      var x = 22 + c * CELLW + r * 6;
      var y = 80 - r * CELLH;
      var delay = (c + r) * STEP;
      var x1 = x, y1 = y, x2 = x + CELLW - 4, y2 = y - topOff;
      // Indentation — cell pushes down 10px into cost pit
      cells +=
        '<g class="lg9-pit" style="animation-delay:' + delay + 's;transform-origin:' + x1 + 'px ' + y1 + 'px">' +
          // Front rim
          '<polygon points="' +
            x1 + ',' + y1 + ' ' + x2 + ',' + y2 + ' ' +
            x2 + ',' + (y2 - 2) + ' ' + x1 + ',' + (y1 - 2) +
          '" fill="#E8E0CF" stroke="#2C2A28" stroke-width="0.4"/>' +
          // Pit bottom (terracotta — cost)
          '<polygon points="' +
            x1 + ',' + (y1 + 8) + ' ' + x2 + ',' + (y2 + 8) + ' ' +
            x2 + ',' + (y2 + 10) + ' ' + x1 + ',' + (y1 + 10) +
          '" fill="#D17036" stroke="#2C2A28" stroke-width="0.4"/>' +
          // Side wall
          '<polygon points="' +
            x1 + ',' + y1 + ' ' + x1 + ',' + (y1 + 10) + ' ' +
            x2 + ',' + (y2 + 10) + ' ' + x2 + ',' + y2 +
          '" fill="#8A5A3A" stroke="#2C2A28" stroke-width="0.3" opacity="0.4"/>' +
        '</g>';
      // Green profit liquid rising up and overflowing
      liquids +=
        '<g class="lg9-liquid" style="animation-delay:' + (delay + 0.25) + 's;transform-origin:' + x1 + 'px ' + (y1 + 10) + 'px">' +
          '<polygon points="' +
            x1 + ',' + (y1 + 10) + ' ' + x2 + ',' + (y2 + 10) + ' ' +
            x2 + ',' + (y2 - 6) + ' ' + x1 + ',' + (y1 - 6) +
          '" fill="#3CA04A" stroke="#236E2E" stroke-width="0.4"/>' +
          // Glossy top
          '<polygon points="' +
            x1 + ',' + (y1 - 6) + ' ' + x2 + ',' + (y2 - 6) + ' ' +
            (x2 + 3) + ',' + (y2 - 8) + ' ' + (x1 + 3) + ',' + (y1 - 8) +
          '" fill="#5DBF69" stroke="#236E2E" stroke-width="0.4"/>' +
        '</g>';
    }
  }
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    cells +
    liquids +
    // Side panel tally
    '<text x="128" y="102" fill="#7A7571" font-size="4.5" font-family="ui-monospace, monospace" ' +
          'text-anchor="end">PROFIT</text>' +
    '<text class="lg9-tally" x="128" y="112" fill="#3CA04A" font-size="7" ' +
          'font-family="ui-monospace, monospace" font-weight="700" text-anchor="end" ' +
          'style="font-variant-numeric: tabular-nums">$9,840</text>' +
  '</svg>';
}

/* 10 — Dial & Notch Tracker
   A circular dial — tick marks around the perimeter draw themselves
   as booked slots fill. An inner terracotta ring pulses inward
   (expense), while a green ring sweeps the perimeter (revenue). A
   central profit-margin number blurs briefly during calculation
   then locks in. Dashes use stroke-dashoffset; eases are sinusoidal. */
function lgSvg_10() {
  var cx = 70, cy = 72, rOuter = 44, rRing = 36, rInner = 26;
  // Circumference of the ring for dash math
  var circRing = 2 * Math.PI * rRing;
  var dashLen = circRing / 24;
  // 24 tick marks around the outer edge
  var ticks = '';
  for (var i = 0; i < 24; i++) {
    var angle = (i / 24) * Math.PI * 2 - Math.PI / 2;
    var x1 = cx + Math.cos(angle) * (rOuter - 4);
    var y1 = cy + Math.sin(angle) * (rOuter - 4);
    var x2 = cx + Math.cos(angle) * rOuter;
    var y2 = cy + Math.sin(angle) * rOuter;
    var delay = i * 0.07;
    ticks += '<line class="lg10-tick" x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" ' +
                  'x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" ' +
                  'stroke="#2C2A28" stroke-width="1" stroke-linecap="round" ' +
                  'style="animation-delay:' + delay.toFixed(2) + 's"/>';
  }
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    // Faint face
    '<circle cx="' + cx + '" cy="' + cy + '" r="' + rOuter + '" fill="#FAF0D5" stroke="#7A7571" stroke-width="0.4"/>' +
    ticks +
    // Terracotta ring (pulsing inward)
    '<circle class="lg10-expense" cx="' + cx + '" cy="' + cy + '" r="' + rInner + '" ' +
            'fill="none" stroke="#D17036" stroke-width="2" opacity="0.55"/>' +
    // Green revenue arc — drawn with stroke-dashoffset around the perimeter
    '<circle class="lg10-revenue" cx="' + cx + '" cy="' + cy + '" r="' + rRing + '" ' +
            'fill="none" stroke="#3CA04A" stroke-width="3" stroke-linecap="round" ' +
            'stroke-dasharray="' + circRing.toFixed(2) + '" stroke-dashoffset="' + circRing.toFixed(2) + '" ' +
            'transform="rotate(-90 ' + cx + ' ' + cy + ')"/>' +
    // Center label
    '<text x="' + cx + '" y="' + (cy - 2) + '" fill="#7A7571" font-size="4.5" ' +
          'font-family="ui-monospace, monospace" text-anchor="middle">MARGIN</text>' +
    '<text class="lg10-margin" x="' + cx + '" y="' + (cy + 8) + '" fill="#2C2A28" font-size="10" ' +
          'font-family="ui-monospace, monospace" font-weight="700" text-anchor="middle" ' +
          'style="font-variant-numeric: tabular-nums">38%</text>' +
  '</svg>';
}

/* 11 — Balance-Scale Blocks
   Side-profile of a balance scale. Terracotta (expense) drops onto
   the left cup, tilting the beam down slightly. Milliseconds later a
   larger charcoal block (revenue) drops onto the right, pivoting
   the beam into a favorable tilt. The resulting angle translates
   into a profit-margin percentage that slides up from the pivot. */
function lgSvg_11() {
  var pivot = { x: 70, y: 76 };
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    // Pivot column + triangle base
    '<polygon points="' + (pivot.x - 14) + ',120 ' + (pivot.x + 14) + ',120 ' + pivot.x + ',' + (pivot.y + 6) + '" ' +
             'fill="#5C5448" stroke="#2C2A28" stroke-width="0.5"/>' +
    '<circle cx="' + pivot.x + '" cy="' + pivot.y + '" r="3" fill="#2C2A28"/>' +
    // Rotating beam + cups (rotates around pivot)
    '<g class="lg11-beam" style="transform-origin:' + pivot.x + 'px ' + pivot.y + 'px">' +
      // Beam
      '<line x1="' + (pivot.x - 46) + '" y1="' + pivot.y + '" x2="' + (pivot.x + 46) + '" y2="' + pivot.y + '" ' +
            'stroke="#2C2A28" stroke-width="2" stroke-linecap="round"/>' +
      // Left cup (holds expense block)
      '<line x1="' + (pivot.x - 46) + '" y1="' + pivot.y + '" x2="' + (pivot.x - 46) + '" y2="' + (pivot.y + 10) + '" ' +
            'stroke="#2C2A28" stroke-width="0.6"/>' +
      '<path d="M' + (pivot.x - 56) + ',' + (pivot.y + 10) + ' Q' + (pivot.x - 46) + ',' + (pivot.y + 16) + ' ' +
                      (pivot.x - 36) + ',' + (pivot.y + 10) + '" fill="none" stroke="#2C2A28" stroke-width="0.6"/>' +
      // Right cup (holds revenue block)
      '<line x1="' + (pivot.x + 46) + '" y1="' + pivot.y + '" x2="' + (pivot.x + 46) + '" y2="' + (pivot.y + 10) + '" ' +
            'stroke="#2C2A28" stroke-width="0.6"/>' +
      '<path d="M' + (pivot.x + 36) + ',' + (pivot.y + 10) + ' Q' + (pivot.x + 46) + ',' + (pivot.y + 16) + ' ' +
                      (pivot.x + 56) + ',' + (pivot.y + 10) + '" fill="none" stroke="#2C2A28" stroke-width="0.6"/>' +
      // Expense block (terracotta, small)
      '<rect class="lg11-expense" x="' + (pivot.x - 54) + '" y="' + (pivot.y + 3) + '" width="16" height="8" ' +
            'fill="#D17036" stroke="#2C2A28" stroke-width="0.5" rx="1" ' +
            'style="transform-origin:' + (pivot.x - 46) + 'px ' + (pivot.y + 7) + 'px"/>' +
      // Revenue block (charcoal, larger)
      '<rect class="lg11-revenue" x="' + (pivot.x + 34) + '" y="' + (pivot.y - 6) + '" width="24" height="16" ' +
            'fill="#2C2A28" stroke="#1A1918" stroke-width="0.5" rx="1" ' +
            'style="transform-origin:' + (pivot.x + 46) + 'px ' + (pivot.y + 10) + 'px"/>' +
    '</g>' +
    // Margin percentage sliding up from pivot
    '<text class="lg11-margin" x="' + pivot.x + '" y="104" fill="#3CA04A" font-size="10" ' +
          'font-family="ui-monospace, monospace" font-weight="700" text-anchor="middle" ' +
          'style="font-variant-numeric: tabular-nums">+42%</text>' +
    '<text x="' + pivot.x + '" y="113" fill="#7A7571" font-size="4.5" ' +
          'font-family="ui-monospace, monospace" text-anchor="middle">PROFIT MARGIN</text>' +
  '</svg>';
}

/* 12 — Connected Flow-Chart
   A horizontal masonry grid of 6 booked slots. A charcoal line
   draws through them (stroke-dashoffset). As the line crosses each
   block, the block splits into two colored halves — bottom terracotta
   (expense), top green (profit). A large bold profit total reveals
   at the end of the line. */
function lgSvg_12() {
  var blocks = [
    { x: 16, y: 56, w: 14, h: 24 },
    { x: 36, y: 48, w: 14, h: 32 },
    { x: 56, y: 58, w: 14, h: 22 },
    { x: 76, y: 42, w: 14, h: 38 },
    { x: 96, y: 52, w: 14, h: 28 }
  ];
  // Draw line path — zig-zags through centers of each block
  var pathD = 'M10,80 ';
  blocks.forEach(function(b) {
    pathD += 'L' + (b.x + b.w / 2) + ',' + (b.y + b.h / 2) + ' ';
  });
  pathD += 'L128,60';
  var rects = blocks.map(function(b, i) {
    var delay = 0.4 + i * 0.28;
    var splitY = b.y + b.h * 0.4;  // lower 40% = expense, upper 60% = profit
    return '<g class="lg12-block lg12-block--' + i + '" style="animation-delay:' + delay + 's">' +
             // Expense half (terracotta, below split)
             '<rect x="' + b.x + '" y="' + splitY + '" width="' + b.w + '" height="' + (b.y + b.h - splitY) + '" ' +
                   'fill="#D17036" stroke="#2C2A28" stroke-width="0.4"/>' +
             // Profit half (green, above split)
             '<rect x="' + b.x + '" y="' + b.y + '" width="' + b.w + '" height="' + (splitY - b.y) + '" ' +
                   'fill="#3CA04A" stroke="#2C2A28" stroke-width="0.4"/>' +
           '</g>';
  }).join('');
  // Shell rectangles (charcoal, covering the splits before the line hits)
  var shells = blocks.map(function(b, i) {
    var delay = 0.4 + i * 0.28;
    return '<rect class="lg12-shell lg12-shell--' + i + '" x="' + b.x + '" y="' + b.y + '" ' +
                 'width="' + b.w + '" height="' + b.h + '" ' +
                 'fill="#2C2A28" stroke="#1A1918" stroke-width="0.4" ' +
                 'style="animation-delay:' + delay + 's"/>';
  }).join('');
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    shells +
    rects +
    // Connecting line — drawn via stroke-dashoffset
    '<path class="lg12-line" d="' + pathD + '" fill="none" stroke="#2C2A28" ' +
          'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
    // Final profit total at end of line
    '<text class="lg12-total" x="128" y="38" fill="#3CA04A" font-size="11" ' +
          'font-family="ui-monospace, monospace" font-weight="800" text-anchor="end" ' +
          'style="font-variant-numeric: tabular-nums">$12,840</text>' +
    '<text x="128" y="46" fill="#7A7571" font-size="4.5" ' +
          'font-family="ui-monospace, monospace" text-anchor="end">TOTAL PROFIT</text>' +
  '</svg>';
}

/* 13 — Waterfall Stack
   4 flat shelves. A charcoal Revenue block slides onto each shelf
   from the left. An expense slice peels off + fades away. The
   remaining green Profit block persists; the cumulative green stack
   on the right grows, topped by a running ticker. */
function lgSvg_13() {
  var shelves = [
    { y: 30, rev: 620, exp: 140, pr: 480 },
    { y: 52, rev: 840, exp: 210, pr: 630 },
    { y: 74, rev: 460, exp: 120, pr: 340 },
    { y: 96, rev: 720, exp: 180, pr: 540 }
  ];
  var shelfStart = 16, shelfEnd = 88, shelfH = 12;
  var rightBarX = 108, rightBarW = 16;
  var rightBarBottom = 112;
  var totalProfit = shelves.reduce(function(s, sh) { return s + sh.pr; }, 0);
  // Right side cumulative bar — split into segments
  var cumulative = 0;
  var segments = '';
  shelves.forEach(function(sh, i) {
    cumulative += sh.pr;
    var segH = sh.pr / totalProfit * 72;
    var segY = rightBarBottom - (cumulative / totalProfit) * 72;
    var delay = 0.6 + i * 0.55;
    segments +=
      '<rect class="lg13-seg lg13-seg--' + i + '" x="' + rightBarX + '" y="' + segY + '" ' +
            'width="' + rightBarW + '" height="' + segH + '" ' +
            'fill="#3CA04A" stroke="#236E2E" stroke-width="0.4" ' +
            'style="animation-delay:' + delay + 's"/>';
  });
  var shelfGroups = shelves.map(function(sh, i) {
    var delay = i * 0.55;
    var shelfLen = shelfEnd - shelfStart;
    var expW = Math.round(sh.exp / sh.rev * shelfLen);
    var prW = shelfLen - expW;
    return '<g class="lg13-row" style="animation-delay:' + delay + 's">' +
             // Shelf base line
             '<line x1="' + shelfStart + '" y1="' + (sh.y + shelfH) + '" ' +
                   'x2="' + shelfEnd + '" y2="' + (sh.y + shelfH) + '" ' +
                   'stroke="#7A7571" stroke-width="0.4"/>' +
             // Sliding charcoal Revenue block
             '<g class="lg13-slide" style="animation-delay:' + delay + 's">' +
               // Expense slice (terracotta — peels off)
               '<rect class="lg13-expense lg13-expense--' + i + '" x="' + shelfStart + '" y="' + sh.y + '" ' +
                     'width="' + expW + '" height="' + shelfH + '" ' +
                     'fill="#D17036" stroke="#2C2A28" stroke-width="0.4" ' +
                     'style="transform-origin:' + (shelfStart + expW/2) + 'px ' + (sh.y + shelfH/2) + 'px;' +
                     'animation-delay:' + (delay + 0.3) + 's"/>' +
               // Profit block (green, remains)
               '<rect class="lg13-profit lg13-profit--' + i + '" x="' + (shelfStart + expW) + '" y="' + sh.y + '" ' +
                     'width="' + prW + '" height="' + shelfH + '" ' +
                     'fill="#3CA04A" stroke="#2C2A28" stroke-width="0.4" ' +
                     'style="animation-delay:' + (delay + 0.3) + 's"/>' +
               // Charcoal cover that retracts to reveal colored segments
               '<rect class="lg13-cover lg13-cover--' + i + '" x="' + shelfStart + '" y="' + sh.y + '" ' +
                     'width="' + shelfLen + '" height="' + shelfH + '" ' +
                     'fill="#2C2A28" stroke="#1A1918" stroke-width="0.4" ' +
                     'style="transform-origin:' + (shelfStart + shelfLen/2) + 'px ' + (sh.y + shelfH/2) + 'px;' +
                     'animation-delay:' + delay + 's"/>' +
             '</g>' +
           '</g>';
  }).join('');
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    shelfGroups +
    // Cumulative profit bar
    '<line x1="' + rightBarX + '" y1="' + rightBarBottom + '" x2="' + (rightBarX + rightBarW) + '" y2="' + rightBarBottom + '" ' +
          'stroke="#2C2A28" stroke-width="0.6"/>' +
    segments +
    // Ticker
    '<text class="lg13-ticker" x="' + (rightBarX + rightBarW / 2) + '" y="26" fill="#3CA04A" font-size="7" ' +
          'font-family="ui-monospace, monospace" font-weight="700" text-anchor="middle" ' +
          'style="font-variant-numeric: tabular-nums">$' + totalProfit.toLocaleString() + '</text>' +
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
