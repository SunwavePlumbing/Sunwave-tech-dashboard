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
    { n:  1, name: 'Golden Spiral Ledger',        svg: lgSvg_1()  },
    { n:  2, name: 'Orbital Ledger',              svg: lgSvg_2()  },
    { n:  3, name: 'Sine Wave Cash Flow',         svg: lgSvg_3()  },
    { n:  4, name: 'Voronoi Money Partition',     svg: lgSvg_4()  },
    { n:  5, name: 'Unit Circle Trigonometry',    svg: lgSvg_5()  },
    { n:  6, name: 'Pascal\u2019s Triangle Cascade', svg: lgSvg_6() },
    { n:  7, name: 'Hex Honeycomb Fill',          svg: lgSvg_7()  },
    { n:  8, name: 'Vector Addition Chain',       svg: lgSvg_8()  },
    { n:  9, name: 'Linear Regression Fit',       svg: lgSvg_9()  },
    { n: 10, name: 'Polar Rose Bloom',            svg: lgSvg_10() }
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

/* ══════════════════════════════════════════════════════════════════
   10 geometric / mathematical / money loading animations
   Every variant: clearly geometric, tied to a recognizable math
   concept, features a running $ total, and loops seamlessly with
   continuous easing (no jerky stops, no long pauses).
   Class prefix lgN — CSS scoped per-variant in marketing-paper.css.
   ══════════════════════════════════════════════════════════════════ */

/* 1 — Golden Spiral Ledger
   A logarithmic spiral r = a·e^(bθ) with b = ln(φ)/(π/2) draws itself
   via stroke-dashoffset. Fibonacci $ labels (1,1,2,3,5,8,13,21 K$)
   fade in at stations along the curve. Running total rolls at center.
   The spiral, once drawn, fades gracefully before looping. */
function lgSvg_1() {
  var cx = 70, cy = 72;
  var PHI = 1.61803398875;
  var b = Math.log(PHI) / (Math.PI / 2);
  var a = 0.45;
  // Sample points along θ from -π to 3π (two full turns)
  var pts = [];
  for (var i = 0; i <= 160; i++) {
    var theta = -Math.PI + (i / 160) * (4 * Math.PI);
    var r = a * Math.exp(b * theta);
    var x = cx + r * Math.cos(theta);
    var y = cy + r * Math.sin(theta);
    pts.push(x.toFixed(2) + ',' + y.toFixed(2));
  }
  var pathD = 'M' + pts.join(' L');
  // Fibonacci station markers along spiral (picked θ values for even spacing)
  var stations = [
    { theta: -0.3,  fib: '$1K',  i: 0 },
    { theta:  0.9,  fib: '$2K',  i: 1 },
    { theta:  2.1,  fib: '$3K',  i: 2 },
    { theta:  3.3,  fib: '$5K',  i: 3 },
    { theta:  4.5,  fib: '$8K',  i: 4 },
    { theta:  5.7,  fib: '$13K', i: 5 },
    { theta:  6.9,  fib: '$21K', i: 6 }
  ];
  var labels = stations.map(function(s) {
    var r = a * Math.exp(b * s.theta);
    var x = cx + r * Math.cos(s.theta);
    var y = cy + r * Math.sin(s.theta);
    return '<g class="lg1-label lg1-label--' + s.i + '" style="transform-origin:' + x + 'px ' + y + 'px">' +
             '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="1.6" fill="#D9A520"/>' +
             '<text x="' + x.toFixed(1) + '" y="' + (y - 3).toFixed(1) + '" fill="#2C2A28" ' +
                   'font-size="5" font-family="ui-monospace, monospace" font-weight="700" ' +
                   'text-anchor="middle" style="font-variant-numeric: tabular-nums">' + s.fib + '</text>' +
           '</g>';
  }).join('');
  // Running total rolling ticker at center
  var ticker = rollingTicker({
    id: 'lg1-clip', x: cx, y: cy + 3, w: 30, h: 10,
    values: ['$0', '$1K', '$3K', '$6K', '$11K', '$19K', '$32K', '$53K'],
    fill: '#D9A520', size: 8, anchor: 'middle', className: 'lg1-roll'
  });
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    // Faint grid
    '<g stroke="#E3DFD3" stroke-width="0.3" opacity="0.6">' +
      '<line x1="0" y1="72" x2="140" y2="72"/>' +
      '<line x1="70" y1="0" x2="70" y2="140"/>' +
    '</g>' +
    // Spiral path (drawn via stroke-dashoffset)
    '<path class="lg1-spiral" d="' + pathD + '" fill="none" stroke="#2C2A28" ' +
          'stroke-width="1.2" stroke-linecap="round"/>' +
    labels +
    ticker +
    // PHI symbol — watermark
    '<text x="70" y="16" fill="#7A7571" font-size="7" font-family="ui-monospace, monospace" ' +
          'font-weight="700" text-anchor="middle" letter-spacing="0.1em">\u03C6 = 1.618</text>' +
  '</svg>';
}

/* 2 — Orbital Ledger
   3 concentric orbits rotate at Keplerian rates (inner fastest). Each
   orbit carries evenly-spaced coins (small circles with a $ mark).
   Central $ total rolls up continuously. The eternal rotations never
   stop — the loader is always in motion. */
function lgSvg_2() {
  var cx = 70, cy = 72;
  function ring(radius, count, coinColor, durSec, className, startOffset) {
    var coins = '';
    for (var i = 0; i < count; i++) {
      var angle = (i / count) * Math.PI * 2 + (startOffset || 0);
      var x = cx + radius * Math.cos(angle);
      var y = cy + radius * Math.sin(angle);
      coins += '<g>' +
                 '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3.2" ' +
                         'fill="' + coinColor + '" stroke="#2C2A28" stroke-width="0.5"/>' +
                 '<text x="' + x.toFixed(1) + '" y="' + (y + 1.5).toFixed(1) + '" fill="#2C2A28" ' +
                       'font-size="3.5" font-family="ui-monospace, monospace" font-weight="700" ' +
                       'text-anchor="middle">$</text>' +
               '</g>';
    }
    return '<g class="' + className + '" style="transform-origin:' + cx + 'px ' + cy + 'px">' +
             // Orbit trail (static)
             '<circle cx="' + cx + '" cy="' + cy + '" r="' + radius + '" fill="none" ' +
                     'stroke="#D6CFBD" stroke-width="0.4" stroke-dasharray="1.5 2"/>' +
             coins +
           '</g>';
  }
  var ticker = rollingTicker({
    id: 'lg2-clip', x: cx, y: cy + 3, w: 22, h: 8,
    values: ['$0', '$420', '$1,180', '$2,340', '$3,920', '$5,840', '$8,100', '$10,640'],
    fill: '#2C2A28', size: 7, anchor: 'middle', className: 'lg2-roll'
  });
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    ring(52, 8, '#E8D9B8', 22, 'lg2-orbit lg2-orbit--3', 0) +
    ring(36, 6, '#F3C670', 14, 'lg2-orbit lg2-orbit--2', 0.4) +
    ring(22, 4, '#D9A520', 8,  'lg2-orbit lg2-orbit--1', 0.8) +
    // Central accumulator plate
    '<circle cx="' + cx + '" cy="' + cy + '" r="12" fill="#FAF0D5" ' +
            'stroke="#2C2A28" stroke-width="0.8"/>' +
    '<text x="' + cx + '" y="' + (cy - 3) + '" fill="#7A7571" font-size="3.5" ' +
          'font-family="ui-monospace, monospace" text-anchor="middle" letter-spacing="0.1em">TOTAL</text>' +
    ticker +
  '</svg>';
}

/* 3 — Sine Wave Cash Flow
   A continuous sine curve translates leftward at constant velocity.
   Green credit markers rise at peaks; coral debit markers drop at
   troughs. A running integral area fills softly under the curve.
   Profit $ ticker rolls continuously with the phase. */
function lgSvg_3() {
  var baseline = 82;
  var amplitude = 22;
  var period = 40;
  // Generate long sine path covering 4 periods so translation is seamless
  var pts = [];
  for (var i = 0; i <= 320; i++) {
    var x = -20 + i * 0.8;
    var y = baseline - amplitude * Math.sin((x / period) * Math.PI * 2);
    pts.push(x.toFixed(2) + ',' + y.toFixed(2));
  }
  var linePath = 'M' + pts.join(' L');
  // Fill path (closed area under curve)
  var fillPath = linePath + ' L236,140 L-20,140 Z';
  // Peak/trough markers along visible range
  var markers = '';
  for (var p = 0; p < 6; p++) {
    var mx = 10 + p * 22;
    var isPeak = p % 2 === 0;
    var markY = baseline - amplitude * Math.sin((mx / period) * Math.PI * 2);
    var mkCol = isPeak ? '#3CA04A' : '#FF5B5B';
    var mkDelay = p * 0.55;
    markers +=
      '<circle class="lg3-mark" cx="' + mx + '" cy="' + markY.toFixed(1) + '" r="2.2" ' +
             'fill="' + mkCol + '" stroke="#2C2A28" stroke-width="0.4" ' +
             'style="animation-delay:' + mkDelay + 's"/>';
  }
  var ticker = rollingTicker({
    id: 'lg3-clip', x: 70, y: 24, w: 40, h: 10,
    values: ['$0', '$1,240', '$2,680', '$4,180', '$5,920', '$7,840', '$9,920', '$12,480'],
    fill: '#2C2A28', size: 8, anchor: 'middle', className: 'lg3-roll'
  });
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    // Axes
    '<line x1="0" y1="' + baseline + '" x2="140" y2="' + baseline + '" stroke="#7A7571" ' +
          'stroke-width="0.5" stroke-dasharray="2 2"/>' +
    // Scrolling wave group (CSS translate)
    '<g class="lg3-scroll">' +
      '<path d="' + fillPath + '" fill="#FFD700" opacity="0.18"/>' +
      '<path d="' + linePath + '" fill="none" stroke="#2C2A28" stroke-width="1.5" ' +
            'stroke-linecap="round" stroke-linejoin="round"/>' +
    '</g>' +
    markers +
    // Label
    '<text x="70" y="16" fill="#7A7571" font-size="4" font-family="ui-monospace, monospace" ' +
          'text-anchor="middle" letter-spacing="0.1em">y = A\u00B7sin(\u03C9t)</text>' +
    ticker +
  '</svg>';
}

/* 4 — Voronoi Money Partition
   8 tessellating cells of hand-tuned Voronoi-like polygons. Each
   cell fades in with a radial gradient from its seed point; the seed
   dots pulse continuously so the geometry always feels alive.
   Each cell carries a $ value; total rolls up. */
function lgSvg_4() {
  // Pre-computed 8 cells covering a 140×140 canvas. Polygons derived
  // from seeds + hand-tuned so the tessellation reads as Voronoi.
  var cells = [
    { seed: { x: 30, y: 26 }, poly: '0,0 68,0 58,40 22,48 0,30', val: '$2.4K', idx: 0 },
    { seed: { x: 100, y: 25 }, poly: '68,0 140,0 140,38 104,46 58,40', val: '$3.1K', idx: 1 },
    { seed: { x: 18, y: 72 }, poly: '0,30 22,48 34,78 0,86', val: '$1.8K', idx: 2 },
    { seed: { x: 62, y: 64 }, poly: '22,48 58,40 104,46 88,76 46,82 34,78', val: '$4.2K', idx: 3 },
    { seed: { x: 116, y: 70 }, poly: '104,46 140,38 140,92 88,76', val: '$2.9K', idx: 4 },
    { seed: { x: 24, y: 112 }, poly: '0,86 34,78 46,110 12,140 0,140', val: '$1.5K', idx: 5 },
    { seed: { x: 72, y: 110 }, poly: '46,82 88,76 94,116 60,140 12,140 46,110', val: '$3.7K', idx: 6 },
    { seed: { x: 116, y: 114 }, poly: '88,76 140,92 140,140 60,140 94,116', val: '$2.2K', idx: 7 }
  ];
  // Gradient defs — one radial gradient per cell, keyed by seed
  var gradDefs = cells.map(function(c) {
    var col = ['#FFD700','#F3C670','#D9A520','#E88140','#F3A268','#3CA04A','#5DBF69','#4A7CB8'][c.idx];
    return '<radialGradient id="lg4-g' + c.idx + '" cx="' + c.seed.x + '" cy="' + c.seed.y + '" ' +
           'r="60" gradientUnits="userSpaceOnUse">' +
             '<stop offset="0" stop-color="' + col + '" stop-opacity="0.7"/>' +
             '<stop offset="0.75" stop-color="' + col + '" stop-opacity="0.25"/>' +
             '<stop offset="1" stop-color="' + col + '" stop-opacity="0.15"/>' +
           '</radialGradient>';
  }).join('');
  var polys = cells.map(function(c) {
    return '<g class="lg4-cell lg4-cell--' + c.idx + '" style="animation-delay:' + (c.idx * 0.28) + 's">' +
             '<polygon points="' + c.poly + '" fill="url(#lg4-g' + c.idx + ')" ' +
                      'stroke="#2C2A28" stroke-width="0.5"/>' +
             '<circle cx="' + c.seed.x + '" cy="' + c.seed.y + '" r="1.6" fill="#2C2A28"/>' +
             '<text x="' + c.seed.x + '" y="' + (c.seed.y + 8) + '" fill="#1A1918" ' +
                   'font-size="5" font-family="ui-monospace, monospace" font-weight="700" ' +
                   'text-anchor="middle" style="font-variant-numeric: tabular-nums">' + c.val + '</text>' +
           '</g>';
  }).join('');
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    '<defs>' + gradDefs + '</defs>' +
    polys +
  '</svg>';
}

/* 5 — Unit Circle Trigonometry
   A unit circle at center. A rotating radius sweeps continuously
   (CSS rotate on a transform group). The tip traces the perimeter.
   Two bars (REV = sin, EXP = cos) oscillate in lockstep with the
   rotation via matching keyframe curves. Running profit rolls. */
function lgSvg_5() {
  var cx = 46, cy = 72, R = 28;
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    // Unit circle face
    '<circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="#FAF0D5" ' +
            'stroke="#7A7571" stroke-width="0.5"/>' +
    // Axes through center
    '<line x1="' + (cx - R - 4) + '" y1="' + cy + '" x2="' + (cx + R + 4) + '" y2="' + cy + '" ' +
          'stroke="#7A7571" stroke-width="0.4"/>' +
    '<line x1="' + cx + '" y1="' + (cy - R - 4) + '" x2="' + cx + '" y2="' + (cy + R + 4) + '" ' +
          'stroke="#7A7571" stroke-width="0.4"/>' +
    // Rotating radius + tip dot (rotates around center)
    '<g class="lg5-rotator" style="transform-origin:' + cx + 'px ' + cy + 'px">' +
      '<line x1="' + cx + '" y1="' + cy + '" x2="' + (cx + R) + '" y2="' + cy + '" ' +
            'stroke="#2C2A28" stroke-width="1.2" stroke-linecap="round"/>' +
      '<circle cx="' + (cx + R) + '" cy="' + cy + '" r="2.4" fill="#D9A520" ' +
              'stroke="#2C2A28" stroke-width="0.4"/>' +
    '</g>' +
    // Center pivot
    '<circle cx="' + cx + '" cy="' + cy + '" r="1.8" fill="#2C2A28"/>' +
    // θ label
    '<text x="' + cx + '" y="' + (cy + R + 12) + '" fill="#7A7571" font-size="4.5" ' +
          'font-family="ui-monospace, monospace" text-anchor="middle">\u03B8 \u2192 2\u03C0</text>' +
    // Revenue bar (sin) — vertical bar on the right
    '<g transform="translate(92, 108)">' +
      '<rect x="0" y="-60" width="14" height="60" fill="#E8E0CF" stroke="#7A7571" stroke-width="0.4"/>' +
      '<rect class="lg5-rev" x="0" y="-60" width="14" height="60" fill="#3CA04A" ' +
            'style="transform-origin:7px 0"/>' +
      '<text x="7" y="10" fill="#1E8749" font-size="4.5" font-family="ui-monospace, monospace" ' +
            'font-weight="700" text-anchor="middle">REV</text>' +
    '</g>' +
    // Expense bar (cos) — vertical bar on the far right
    '<g transform="translate(114, 108)">' +
      '<rect x="0" y="-60" width="14" height="60" fill="#E8E0CF" stroke="#7A7571" stroke-width="0.4"/>' +
      '<rect class="lg5-exp" x="0" y="-60" width="14" height="60" fill="#FF5B5B" ' +
            'style="transform-origin:7px 0"/>' +
      '<text x="7" y="10" fill="#B83E3E" font-size="4.5" font-family="ui-monospace, monospace" ' +
            'font-weight="700" text-anchor="middle">EXP</text>' +
    '</g>' +
    // Top corner label with running profit
    '<text x="100" y="16" fill="#7A7571" font-size="4.5" font-family="ui-monospace, monospace" ' +
          'text-anchor="middle" letter-spacing="0.08em">PROFIT</text>' +
    rollingTicker({
      id: 'lg5-clip', x: 100, y: 26, w: 36, h: 10,
      values: ['$0', '$1.2K', '$2.8K', '$4.6K', '$6.1K', '$7.8K', '$9.4K', '$11.2K'],
      fill: '#2C2A28', size: 8, anchor: 'middle', className: 'lg5-roll'
    }) +
  '</svg>';
}

/* 6 — Pascal's Triangle Cascade
   6 rows of Pascal's triangle. Each node is a small circle with its
   binomial coefficient. Nodes cascade in top-down with gentle spring
   ease; parent-child lines draw with stroke-dashoffset. Bottom row
   sum (2^5 = 32) → $32K label. Whole cascade loops continuously. */
function lgSvg_6() {
  var rows = [
    [1],
    [1, 1],
    [1, 2, 1],
    [1, 3, 3, 1],
    [1, 4, 6, 4, 1],
    [1, 5, 10, 10, 5, 1]
  ];
  var cx = 70;
  var startY = 22, rowH = 16;
  var nodeSpacing = 14;
  // Compute node positions
  var nodes = [];
  rows.forEach(function(row, r) {
    var rowWidth = (row.length - 1) * nodeSpacing;
    var startX = cx - rowWidth / 2;
    row.forEach(function(val, c) {
      nodes.push({ r: r, c: c, x: startX + c * nodeSpacing, y: startY + r * rowH, v: val });
    });
  });
  // Connection lines (parent → child). Child at (r+1, c) has parents (r, c-1) and (r, c).
  var lines = '';
  for (var r = 0; r < rows.length - 1; r++) {
    for (var c = 0; c < rows[r].length; c++) {
      var parent = nodes.filter(function(n) { return n.r === r && n.c === c; })[0];
      // Left child
      var lc = nodes.filter(function(n) { return n.r === r + 1 && n.c === c; })[0];
      var rc = nodes.filter(function(n) { return n.r === r + 1 && n.c === c + 1; })[0];
      var delay = (r + 1) * 0.35;
      [lc, rc].forEach(function(child, idx) {
        if (!child) return;
        lines += '<line class="lg6-edge" x1="' + parent.x + '" y1="' + parent.y + '" ' +
                                          'x2="' + child.x + '" y2="' + child.y + '" ' +
                       'stroke="#7A7571" stroke-width="0.4" ' +
                       'style="animation-delay:' + delay + 's"/>';
      });
    }
  }
  // Nodes: circles + values
  var nodeEls = nodes.map(function(n, i) {
    var delay = n.r * 0.35 + n.c * 0.04;
    return '<g class="lg6-node" style="transform-origin:' + n.x + 'px ' + n.y + 'px;animation-delay:' + delay + 's">' +
             '<circle cx="' + n.x + '" cy="' + n.y + '" r="5" fill="#FAF0D5" ' +
                     'stroke="#2C2A28" stroke-width="0.6"/>' +
             '<text x="' + n.x + '" y="' + (n.y + 1.8) + '" fill="#2C2A28" font-size="5.5" ' +
                   'font-family="ui-monospace, monospace" font-weight="700" text-anchor="middle" ' +
                   'style="font-variant-numeric: tabular-nums">' + n.v + '</text>' +
           '</g>';
  }).join('');
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    lines +
    nodeEls +
    // Binomial formula label
    '<text x="70" y="16" fill="#7A7571" font-size="4.5" font-family="ui-monospace, monospace" ' +
          'text-anchor="middle" letter-spacing="0.08em">C(n, k)</text>' +
    // Row-5 sum callout
    '<text class="lg6-sum" x="70" y="128" fill="#3CA04A" font-size="9" ' +
          'font-family="ui-monospace, monospace" font-weight="800" text-anchor="middle" ' +
          'style="font-variant-numeric: tabular-nums">\u03A3 = $32K</text>' +
  '</svg>';
}

/* 7 — Hex Honeycomb Fill
   Central hex + 6 ring-1 + 12 ring-2 = 19-hex honeycomb. Radial
   ripple from center outward fills cells with $ denominations. After
   full, outer cells drain first; cycle restarts with inner. Continuous. */
function lgSvg_7() {
  var cx = 70, cy = 72;
  var R = 7;                     // hex "radius" (center to vertex)
  var a = R * Math.sqrt(3) / 2;  // apothem
  var dy = 1.5 * R;              // vertical neighbor offset
  // Hex positions (pointy-top): (col, row) to (x, y)
  // Ring 0: center. Ring 1: 6 hexes. Ring 2: 12 hexes.
  function hexPath(hcx, hcy) {
    var pts = [];
    for (var k = 0; k < 6; k++) {
      var ang = (Math.PI / 3) * k - Math.PI / 2;   // pointy-top
      pts.push((hcx + R * Math.cos(ang)).toFixed(2) + ',' + (hcy + R * Math.sin(ang)).toFixed(2));
    }
    return pts.join(' ');
  }
  // Position generators via axial coordinates (q, r) — pointy-top formula
  function axialToXY(q, r) {
    return {
      x: cx + a * 2 * q + a * r,
      y: cy + dy * r
    };
  }
  var positions = [];
  // Ring 0
  positions.push({ q: 0, r: 0, ring: 0 });
  // Ring 1 (6 hexes)
  var ring1 = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
  ring1.forEach(function(p) { positions.push({ q: p[0], r: p[1], ring: 1 }); });
  // Ring 2 (12 hexes)
  var ring2 = [
    [2,0],[2,-1],[2,-2],[1,-2],[0,-2],[-1,-1],
    [-2,0],[-2,1],[-2,2],[-1,2],[0,2],[1,1]
  ];
  ring2.forEach(function(p) { positions.push({ q: p[0], r: p[1], ring: 2 }); });
  var denoms = ['$500','$100','$50','$100','$200','$50','$100','$200','$100','$50','$200','$100','$500','$200','$100','$50','$100','$500','$100'];
  var hexes = positions.map(function(p, i) {
    var xy = axialToXY(p.q, p.r);
    var delay = p.ring * 0.28 + (i % 6) * 0.06;
    return '<g class="lg7-hex lg7-hex--ring' + p.ring + '" style="' +
           'transform-origin:' + xy.x.toFixed(2) + 'px ' + xy.y.toFixed(2) + 'px;' +
           'animation-delay:' + delay.toFixed(2) + 's">' +
             '<polygon points="' + hexPath(xy.x, xy.y) + '" fill="#FAF0D5" ' +
                      'stroke="#2C2A28" stroke-width="0.5"/>' +
             '<text x="' + xy.x.toFixed(2) + '" y="' + (xy.y + 1.8).toFixed(2) + '" ' +
                   'fill="#1A1918" font-size="3.2" font-family="ui-monospace, monospace" ' +
                   'font-weight="700" text-anchor="middle" ' +
                   'style="font-variant-numeric: tabular-nums">' + denoms[i] + '</text>' +
           '</g>';
  }).join('');
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    hexes +
    // Running tally
    '<text x="70" y="14" fill="#7A7571" font-size="4" font-family="ui-monospace, monospace" ' +
          'text-anchor="middle" letter-spacing="0.1em">SUM</text>' +
    rollingTicker({
      id: 'lg7-clip', x: 70, y: 128, w: 44, h: 10,
      values: ['$0', '$500', '$1.1K', '$1.8K', '$2.6K', '$3.5K', '$4.1K', '$4.6K'],
      fill: '#2C2A28', size: 8, anchor: 'middle', className: 'lg7-roll'
    }) +
  '</svg>';
}

/* 8 — Vector Addition Chain
   Three vectors (Revenue, −COGS, −Overhead) chain tip-to-tail on a
   faint grid. Each draws itself via stroke-dashoffset. The dashed
   resultant (Profit) bridges origin → final tip. Running $ labels
   accompany each arrow. Whole sequence loops with a retract. */
function lgSvg_8() {
  var O = { x: 22, y: 108 };
  var V1 = { x: 82, y: 52 };    // after Revenue
  var V2 = { x: 62, y: 78 };    // after -COGS
  var V3 = { x: 104, y: 92 };   // after -Overhead = final profit tip
  function arrow(from, to, cls, color, dashLen) {
    // Arrow head: compute unit vector
    var dx = to.x - from.x, dy = to.y - from.y;
    var len = Math.sqrt(dx*dx + dy*dy);
    var ux = dx/len, uy = dy/len;
    var hx = to.x - ux * 6, hy = to.y - uy * 6;
    var px = -uy * 2.5, py = ux * 2.5;
    var head = (hx + px).toFixed(1) + ',' + (hy + py).toFixed(1) + ' ' +
               to.x.toFixed(1) + ',' + to.y.toFixed(1) + ' ' +
               (hx - px).toFixed(1) + ',' + (hy - py).toFixed(1);
    return '<g class="' + cls + '">' +
             '<line x1="' + from.x + '" y1="' + from.y + '" x2="' + to.x + '" y2="' + to.y + '" ' +
                   'stroke="' + color + '" stroke-width="1.8" stroke-linecap="round" ' +
                   'stroke-dasharray="' + dashLen + '" stroke-dashoffset="' + dashLen + '"/>' +
             '<polyline class="' + cls + '-head" points="' + head + '" ' +
                      'fill="none" stroke="' + color + '" stroke-width="1.6" ' +
                      'stroke-linecap="round" stroke-linejoin="round"/>' +
           '</g>';
  }
  // Grid
  var grid = '';
  for (var gx = 0; gx <= 140; gx += 14) {
    grid += '<line x1="' + gx + '" y1="0" x2="' + gx + '" y2="140" stroke="#E3DFD3" stroke-width="0.3"/>';
  }
  for (var gy = 0; gy <= 140; gy += 14) {
    grid += '<line x1="0" y1="' + gy + '" x2="140" y2="' + gy + '" stroke="#E3DFD3" stroke-width="0.3"/>';
  }
  // Dashed resultant (Profit)
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    grid +
    // Origin marker
    '<circle cx="' + O.x + '" cy="' + O.y + '" r="2" fill="#2C2A28"/>' +
    '<text x="' + (O.x - 6) + '" y="' + (O.y + 4) + '" fill="#7A7571" font-size="4.5" ' +
          'font-family="ui-monospace, monospace" text-anchor="end">O</text>' +
    // Vector 1: Revenue (charcoal)
    arrow(O, V1, 'lg8-v1', '#2C2A28', 100) +
    '<text class="lg8-l1" x="' + ((O.x + V1.x) / 2 + 4) + '" y="' + ((O.y + V1.y) / 2 - 4) + '" ' +
          'fill="#2C2A28" font-size="5" font-family="ui-monospace, monospace" font-weight="700" ' +
          'style="font-variant-numeric: tabular-nums">+$273K</text>' +
    // Vector 2: -COGS (coral)
    arrow(V1, V2, 'lg8-v2', '#FF5B5B', 50) +
    '<text class="lg8-l2" x="' + ((V1.x + V2.x) / 2 + 6) + '" y="' + ((V1.y + V2.y) / 2) + '" ' +
          'fill="#B83E3E" font-size="5" font-family="ui-monospace, monospace" font-weight="700" ' +
          'style="font-variant-numeric: tabular-nums">\u2212$144K</text>' +
    // Vector 3: -Overhead (orange)
    arrow(V2, V3, 'lg8-v3', '#FF8A1F', 60) +
    '<text class="lg8-l3" x="' + ((V2.x + V3.x) / 2) + '" y="' + ((V2.y + V3.y) / 2 + 7) + '" ' +
          'fill="#C76810" font-size="5" font-family="ui-monospace, monospace" font-weight="700" ' +
          'style="font-variant-numeric: tabular-nums">\u2212$88K</text>' +
    // Resultant (green dashed)
    (function() {
      var dx = V3.x - O.x, dy = V3.y - O.y;
      var len = Math.sqrt(dx*dx + dy*dy);
      var ux = dx/len, uy = dy/len;
      var hx = V3.x - ux * 6, hy = V3.y - uy * 6;
      var px = -uy * 2.5, py = ux * 2.5;
      var head = (hx + px).toFixed(1) + ',' + (hy + py).toFixed(1) + ' ' +
                 V3.x.toFixed(1) + ',' + V3.y.toFixed(1) + ' ' +
                 (hx - px).toFixed(1) + ',' + (hy - py).toFixed(1);
      return '<g class="lg8-res">' +
               '<line x1="' + O.x + '" y1="' + O.y + '" x2="' + V3.x + '" y2="' + V3.y + '" ' +
                     'stroke="#3CA04A" stroke-width="1.6" stroke-linecap="round" ' +
                     'stroke-dasharray="3 2.5"/>' +
               '<polyline points="' + head + '" fill="none" stroke="#3CA04A" ' +
                        'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
               '<text x="' + (V3.x + 4) + '" y="' + (V3.y - 4) + '" fill="#1E8749" ' +
                     'font-size="6" font-family="ui-monospace, monospace" font-weight="800" ' +
                     'style="font-variant-numeric: tabular-nums">=$41K</text>' +
             '</g>';
    })() +
  '</svg>';
}

/* 9 — Linear Regression Fit
   Scatter plot of 8 points (noisy-linear trend). Points drop in
   sequentially with gravity ease. A best-fit line draws through with
   stroke-dashoffset after each point lands. Running slope/margin
   ticker updates. Loop: fade points, restart. Continuous. */
function lgSvg_9() {
  // Pre-computed points (noisy linear, slope ≈ -0.52 in SVG coords)
  var points = [
    { x: 20,  y: 102 },
    { x: 34,  y: 96 },
    { x: 48,  y: 84 },
    { x: 60,  y: 82 },
    { x: 74,  y: 70 },
    { x: 86,  y: 66 },
    { x: 100, y: 54 },
    { x: 114, y: 48 }
  ];
  // Best fit: linear regression y = mx + b
  var n = points.length;
  var sx = 0, sy = 0, sxy = 0, sxx = 0;
  points.forEach(function(p) { sx += p.x; sy += p.y; sxy += p.x * p.y; sxx += p.x * p.x; });
  var m = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  var bInt = (sy - m * sx) / n;
  var x0 = 20, x1 = 114;
  var y0 = m * x0 + bInt;
  var y1 = m * x1 + bInt;
  // Point dots
  var dots = points.map(function(p, i) {
    return '<circle class="lg9-dot lg9-dot--' + i + '" cx="' + p.x + '" cy="' + p.y + '" r="2.6" ' +
                  'fill="#D9A520" stroke="#2C2A28" stroke-width="0.5" ' +
                  'style="animation-delay:' + (0.2 + i * 0.25) + 's"/>';
  }).join('');
  // Axes
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    // Axes
    '<g stroke="#7A7571" stroke-width="0.5" fill="none">' +
      '<line x1="14" y1="110" x2="120" y2="110"/>' +
      '<line x1="14" y1="110" x2="14" y2="30"/>' +
    '</g>' +
    // Tick marks
    '<g stroke="#D6CFBD" stroke-width="0.3">' +
      '<line x1="14" y1="42" x2="120" y2="42"/>' +
      '<line x1="14" y1="66" x2="120" y2="66"/>' +
      '<line x1="14" y1="90" x2="120" y2="90"/>' +
    '</g>' +
    dots +
    // Best-fit line (animated draw last)
    '<line class="lg9-fit" x1="' + x0 + '" y1="' + y0.toFixed(1) + '" ' +
                          'x2="' + x1 + '" y2="' + y1.toFixed(1) + '" ' +
          'stroke="#3CA04A" stroke-width="1.6" stroke-linecap="round"/>' +
    // Equation label
    '<text x="70" y="14" fill="#7A7571" font-size="4.5" font-family="ui-monospace, monospace" ' +
          'text-anchor="middle" letter-spacing="0.08em">y = mx + b</text>' +
    rollingTicker({
      id: 'lg9-clip', x: 110, y: 26, w: 40, h: 8,
      values: ['margin', '8%', '14%', '19%', '24%', '28%', '32%', '36%'],
      fill: '#2C2A28', size: 7, anchor: 'middle', className: 'lg9-roll'
    }) +
  '</svg>';
}

/* 10 — Polar Rose Bloom
   Polar curve r = a·cos(kθ) drawn via stroke-dashoffset. k=5 yields
   a 5-petal rose. Each petal fills with its own category color as
   the curve crosses it. Sum rolls up at center. Glow briefly at
   completion, fade, redraw — seamless continuous bloom. */
function lgSvg_10() {
  var cx = 70, cy = 72;
  var A = 42;
  var k = 5;
  // Sample points: θ from 0 to π (full 5-petal rose)
  var pts = [];
  for (var i = 0; i <= 240; i++) {
    var theta = (i / 240) * Math.PI;
    var r = A * Math.cos(k * theta);
    if (r < 0) r = 0;   // clip to zero to prevent overlapping negative-petal artifacts
    var x = cx + r * Math.cos(theta);
    var y = cy + r * Math.sin(theta);
    pts.push(x.toFixed(2) + ',' + y.toFixed(2));
  }
  var pathD = 'M' + pts.join(' L') + ' Z';
  // Petal colors + labels (5 categories)
  var petalColors = ['#FF5B5B', '#FF8A1F', '#D9A520', '#3CA04A', '#4A7CB8'];
  var petalLabels = ['$42K','$31K','$24K','$18K','$12K'];
  // Petal center points (θ = (2k+1)·π/(2k) for k=0..4)... for cos(5θ): peaks at θ=0, π/5, 2π/5, 3π/5, 4π/5
  var petalMarkers = '';
  for (var p = 0; p < 5; p++) {
    var ptheta = (p / 5) * Math.PI + Math.PI / 10;
    var pr = A * 0.65;
    var px = cx + pr * Math.cos(ptheta);
    var py = cy + pr * Math.sin(ptheta);
    petalMarkers +=
      '<text class="lg10-lbl lg10-lbl--' + p + '" x="' + px.toFixed(1) + '" y="' + py.toFixed(1) + '" ' +
            'fill="#1A1918" font-size="4.5" font-family="ui-monospace, monospace" font-weight="700" ' +
            'text-anchor="middle" style="font-variant-numeric: tabular-nums;animation-delay:' + (p * 0.6).toFixed(2) + 's">' +
        petalLabels[p] +
      '</text>';
  }
  // Gradient fills per petal via clipPath — easier: layer 5 filled rose shapes each
  // clipped to their angular wedge. Here we'll use stroke-only rose + a fill overlay.
  var ticker = rollingTicker({
    id: 'lg10-clip', x: cx, y: cy + 3, w: 28, h: 9,
    values: ['$0', '$12K', '$30K', '$54K', '$85K', '$127K'],
    fill: '#2C2A28', size: 7, anchor: 'middle', className: 'lg10-roll'
  });
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    '<defs>' +
      '<radialGradient id="lg10-glow" cx="' + cx + '" cy="' + cy + '" r="60" gradientUnits="userSpaceOnUse">' +
        '<stop offset="0" stop-color="#FFD700" stop-opacity="0.4"/>' +
        '<stop offset="1" stop-color="#FFD700" stop-opacity="0"/>' +
      '</radialGradient>' +
    '</defs>' +
    // Fill with petal-tinted gradient (subtle)
    '<path d="' + pathD + '" fill="url(#lg10-glow)" opacity="0.85"/>' +
    // Stroked rose curve (animated draw)
    '<path class="lg10-rose" d="' + pathD + '" fill="none" stroke="#2C2A28" ' +
          'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>' +
    // Petal tips — colored dots at the max of each petal
    (function() {
      var dots = '';
      for (var p = 0; p < 5; p++) {
        var ptheta = (p / 5) * Math.PI + Math.PI / 10;
        var px = cx + A * Math.cos(ptheta);
        var py = cy + A * Math.sin(ptheta);
        dots += '<circle class="lg10-tip lg10-tip--' + p + '" cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" ' +
                         'r="3" fill="' + petalColors[p] + '" stroke="#2C2A28" stroke-width="0.4" ' +
                         'style="animation-delay:' + (p * 0.6).toFixed(2) + 's"/>';
      }
      return dots;
    })() +
    petalMarkers +
    // Formula label
    '<text x="70" y="14" fill="#7A7571" font-size="4.5" font-family="ui-monospace, monospace" ' +
          'text-anchor="middle" letter-spacing="0.08em">r = a\u00B7cos(k\u03B8)</text>' +
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
