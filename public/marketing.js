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
    { n:  4, name: 'Tabular Engine',                       svg: lgSvg_4()  },
    { n:  5, name: 'Drafting Dimension',                   svg: lgSvg_5()  },
    { n:  6, name: 'Formula Extrusion',                    svg: lgSvg_6()  },
    { n:  7, name: 'Origami Pop-Up',                       svg: lgSvg_7()  },
    { n:  8, name: 'Vellum Layer Push',                    svg: lgSvg_8()  },
    { n:  9, name: 'Ledger Stack',                         svg: lgSvg_9()  },
    { n: 10, name: 'Variance Shift',                       svg: lgSvg_10() },
    { n: 11, name: 'Market Topography',                    svg: lgSvg_11() },
    { n: 12, name: 'Calendar Matrix',                      svg: lgSvg_12() },
    { n: 13, name: 'Time-Slot Cascade',                    svg: lgSvg_13() }
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

/* 4 — The Tabular Engine
   5×3 grid of charcoal isometric bars. Each bar flaunts a yellow
   tabular number on its top face that "odometers" through 3 states
   during the rise, snapping to its final value at peak. Diagonal
   wave sweeps front-left → back-right. Monospace digits lock the
   columns so the tickers read as calculation output. */
function lgSvg_4() {
  var COLS = 5, ROWS = 3, CELL = 16, STEP = 0.07;
  var bars = '';
  // Pre-generated "calculation outputs" per cell — final value shown
  // after the ticker settles. Mixed K / % / plain to feel financial.
  var finals = [
    '42K', '8.1', '220', '67%', '1.2K',
    '$94', '37', '152', '4.8',  '81%',
    '612', '$7', '29',  '90%', '3.5K'
  ];
  var intermediates = ['···', '...', '— —'];
  for (var r = 0; r < ROWS; r++) {
    for (var c = 0; c < COLS; c++) {
      var x = 16 + c * CELL + r * 5;
      var y = 108 - r * 8;
      var h = 28 + ((c + r) % 3) * 6;
      var delay = (c + r) * STEP;
      var x1 = x, y1 = y;
      var x2 = x + 11, y2 = y - 3;
      var idx = r * COLS + c;
      var finalVal = finals[idx];
      var midVal = intermediates[idx % 3];
      // Use SMIL on text via switching opacity on two <text> nodes
      bars +=
        '<g class="lg4-bar" style="animation-delay:' + delay + 's;transform-origin:' + x1 + 'px ' + y1 + 'px">' +
          // Front face (dark charcoal)
          '<polygon points="' +
            x1 + ',' + y1 + ' ' + x2 + ',' + y2 + ' ' +
            x2 + ',' + (y2 - h) + ' ' + x1 + ',' + (y1 - h) +
          '" fill="#2C2A28" stroke="#000" stroke-width="0.3"/>' +
          // Right side face
          '<polygon points="' +
            x2 + ',' + y2 + ' ' + (x2 + 3) + ',' + (y2 - 2) + ' ' +
            (x2 + 3) + ',' + (y2 - h - 2) + ' ' + x2 + ',' + (y2 - h) +
          '" fill="#1A1918" stroke="#000" stroke-width="0.3"/>' +
          // Top face — tinted slightly so the yellow digit pops
          '<polygon points="' +
            x1 + ',' + (y1 - h) + ' ' + x2 + ',' + (y2 - h) + ' ' +
            (x2 + 3) + ',' + (y2 - h - 2) + ' ' + (x1 + 3) + ',' + (y1 - h - 2) +
          '" fill="#3A3834" stroke="#000" stroke-width="0.3"/>' +
        '</g>' +
        // Number on top face — monospace yellow "odometer"
        '<g class="lg4-num" style="animation-delay:' + delay + 's">' +
          '<text class="lg4-num-mid" x="' + (x1 + 5.5) + '" y="' + (y1 - h + 0.5) + '" ' +
                'fill="#FFD700" font-size="3.5" font-family="ui-monospace, monospace" ' +
                'font-weight="700" text-anchor="middle" style="animation-delay:' + delay + 's">' +
            esc(midVal) +
          '</text>' +
          '<text class="lg4-num-final" x="' + (x1 + 5.5) + '" y="' + (y1 - h + 0.5) + '" ' +
                'fill="#FFD700" font-size="3.8" font-family="ui-monospace, monospace" ' +
                'font-weight="700" text-anchor="middle" style="animation-delay:' + delay + 's">' +
            esc(finalVal) +
          '</text>' +
        '</g>';
    }
  }
  return '<svg class="lg-svg" viewBox="0 0 140 140">' + bars + '</svg>';
}

/* 5 — The Drafting Dimension
   3 hero bars centered on a warm canvas, flanked by faint dashed
   pencil axis guides (X / Y / Z). As each bar rises, a dimension
   line with arrows stretches out from its side, bearing a fractional
   math readout that "locks in" to the final height. Precision ease. */
function lgSvg_5() {
  var bars = [
    { x: 36, h: 58, label: '5 ⅞"' },
    { x: 64, h: 74, label: '7 ¼"' },
    { x: 92, h: 46, label: '4 ⅜"' }
  ];
  var floor = 108, barW = 12;
  var svg = '';
  bars.forEach(function(b, i) {
    var delay = i * 0.18;
    var x1 = b.x, x2 = b.x + barW;
    var topY = floor - b.h;
    var topOff = 3;   // isometric top offset
    svg +=
      // Bar group (scales from base)
      '<g class="lg5-bar" style="animation-delay:' + delay + 's;transform-origin:' + x1 + 'px ' + floor + 'px">' +
        // Front face
        '<polygon points="' +
          x1 + ',' + floor + ' ' + x2 + ',' + (floor - topOff) + ' ' +
          x2 + ',' + (topY - topOff) + ' ' + x1 + ',' + topY +
        '" fill="#E88140" stroke="#2C2A28" stroke-width="0.5"/>' +
        // Top face
        '<polygon points="' +
          x1 + ',' + topY + ' ' + x2 + ',' + (topY - topOff) + ' ' +
          (x2 + 3) + ',' + (topY - topOff - 2) + ' ' + (x1 + 3) + ',' + (topY - 2) +
        '" fill="#F3A268" stroke="#2C2A28" stroke-width="0.5"/>' +
        // Right side
        '<polygon points="' +
          x2 + ',' + (floor - topOff) + ' ' + (x2 + 3) + ',' + (floor - topOff - 2) + ' ' +
          (x2 + 3) + ',' + (topY - topOff - 2) + ' ' + x2 + ',' + (topY - topOff) +
        '" fill="#B85F2A" stroke="#2C2A28" stroke-width="0.5"/>' +
      '</g>' +
      // Dimension line — extends from the top of the bar, yellow technical
      '<g class="lg5-dim" style="animation-delay:' + (delay + 0.55) + 's">' +
        '<line x1="' + (x2 + 4) + '" y1="' + topY + '" x2="' + (x2 + 16) + '" y2="' + topY + '" ' +
              'stroke="#B09000" stroke-width="0.5"/>' +
        '<line x1="' + (x2 + 15) + '" y1="' + (topY - 2) + '" x2="' + (x2 + 17) + '" y2="' + topY + '" ' +
              'stroke="#B09000" stroke-width="0.5"/>' +
        '<line x1="' + (x2 + 15) + '" y1="' + (topY + 2) + '" x2="' + (x2 + 17) + '" y2="' + topY + '" ' +
              'stroke="#B09000" stroke-width="0.5"/>' +
        '<text x="' + (x2 + 19) + '" y="' + (topY + 1.8) + '" fill="#6B5600" ' +
              'font-size="4.2" font-family="ui-monospace, monospace">' + esc(b.label) + '</text>' +
      '</g>';
  });
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    // Pencil axis guides (static, faint)
    '<g stroke="#B5A98E" stroke-width="0.4" stroke-dasharray="1.5 2" fill="none">' +
      '<line x1="20" y1="108" x2="124" y2="108"/>' +   // X baseline
      '<line x1="26" y1="16"  x2="26"  y2="114"/>' +    // Y
      '<line x1="20" y1="108" x2="14"  y2="120"/>' +    // Z (isometric diagonal)
    '</g>' +
    svg +
  '</svg>';
}

/* 6 — The Formula Extrusion
   Starts flat: an equation "7 × 8 + 4" rendered in charcoal ink.
   The digits + operators each extrude upward into an isometric
   block, ripple in a sine wave, glow kelly-green at peak, then
   compress back down into the final solved number "60". */
function lgSvg_6() {
  // Six glyph columns — chars become extruding blocks
  var glyphs = [
    { ch: '7', x: 18  },
    { ch: '×', x: 36  },
    { ch: '8', x: 54  },
    { ch: '+', x: 72  },
    { ch: '4', x: 90  },
    { ch: '=', x: 108 }
  ];
  var floor = 90, blockW = 12;
  var blocks = glyphs.map(function(g, i) {
    var delay = i * 0.07;
    var x1 = g.x, x2 = g.x + blockW;
    return '<g class="lg6-block" style="animation-delay:' + delay + 's;transform-origin:' + x1 + 'px ' + floor + 'px">' +
      // Front face (charcoal extrusion)
      '<polygon points="' +
        x1 + ',' + floor + ' ' + x2 + ',' + (floor - 3) + ' ' +
        x2 + ',' + (floor - 30) + ' ' + x1 + ',' + (floor - 27) +
      '" fill="#2C2A28" stroke="#000" stroke-width="0.4"/>' +
      // Top face
      '<polygon points="' +
        x1 + ',' + (floor - 27) + ' ' + x2 + ',' + (floor - 30) + ' ' +
        (x2 + 3) + ',' + (floor - 32) + ' ' + (x1 + 3) + ',' + (floor - 29) +
      '" fill="#3A3834" stroke="#000" stroke-width="0.4"/>' +
      // Right side
      '<polygon points="' +
        x2 + ',' + (floor - 3) + ' ' + (x2 + 3) + ',' + (floor - 5) + ' ' +
        (x2 + 3) + ',' + (floor - 32) + ' ' + x2 + ',' + (floor - 30) +
      '" fill="#1A1918" stroke="#000" stroke-width="0.4"/>' +
      // Glyph on front face
      '<text x="' + (x1 + 6) + '" y="' + (floor - 12) + '" fill="#FAF9F6" ' +
            'font-size="8" font-family="ui-monospace, monospace" font-weight="700" ' +
            'text-anchor="middle">' + esc(g.ch) + '</text>' +
    '</g>';
  }).join('');
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    // Flat equation that fades out as blocks extrude
    '<g class="lg6-flat">' +
      glyphs.map(function(g) {
        return '<text x="' + (g.x + 6) + '" y="' + (floor - 2) + '" fill="#2C2A28" ' +
               'font-size="10" font-family="ui-monospace, monospace" font-weight="700" ' +
               'text-anchor="middle">' + esc(g.ch) + '</text>';
      }).join('') +
    '</g>' +
    // Extruded blocks (grow up, then compress back to flat)
    blocks +
    // Final solved answer that reveals at the end
    '<text class="lg6-answer" x="70" y="118" fill="#2E7D32" ' +
          'font-size="14" font-family="ui-monospace, monospace" font-weight="800" ' +
          'text-anchor="middle">= 60</text>' +
  '</svg>';
}

/* 7 — The Origami Pop-Up
   4 isometric bars presented as hollow folded cardstock (no top lid,
   visible interior shadow). Bars fold out of the flat canvas with
   a stiff, rigid frame-by-frame snap (steps(4, end)). As they peak
   they cast sharp deep shadows onto the paper behind. */
function lgSvg_7() {
  var bars = [{ x: 32 }, { x: 58 }, { x: 84 }, { x: 110 }];
  var floor = 108, barW = 14, heights = [42, 58, 36, 50];
  var svg = '';
  bars.forEach(function(b, i) {
    var delay = i * 0.22;
    var h = heights[i];
    var x1 = b.x, x2 = b.x + barW;
    var topY = floor - h;
    var topOff = 3.5;
    svg +=
      '<g class="lg7-fold" style="animation-delay:' + delay + 's;transform-origin:' + x1 + 'px ' + floor + 'px">' +
        // Shadow cast behind (drops right and down as bar extends)
        '<polygon points="' +
          (x1 + 5) + ',' + (floor + 3) + ' ' +
          (x2 + 8) + ',' + (floor + 1) + ' ' +
          (x2 + 8) + ',' + (topY - 1) + ' ' +
          (x1 + 5) + ',' + (topY + 1) +
        '" fill="#2C2A28" opacity="0.18"/>' +
        // Hollow interior (visible from top since no lid) — darker
        '<polygon points="' +
          x1 + ',' + topY + ' ' + x2 + ',' + (topY - topOff) + ' ' +
          (x2 - 2) + ',' + (topY - topOff + 1.5) + ' ' + (x1 + 2) + ',' + (topY + 1.5) +
        '" fill="#2C2A28" opacity="0.55"/>' +
        // Front face (cardstock tan)
        '<polygon points="' +
          x1 + ',' + floor + ' ' + x2 + ',' + (floor - topOff) + ' ' +
          x2 + ',' + (topY - topOff) + ' ' + x1 + ',' + topY +
        '" fill="#E8D9B8" stroke="#5C5448" stroke-width="0.6"/>' +
        // Right side (darker cardstock fold)
        '<polygon points="' +
          x2 + ',' + (floor - topOff) + ' ' + (x2 + 3) + ',' + (floor - topOff - 2) + ' ' +
          (x2 + 3) + ',' + (topY - topOff - 2) + ' ' + x2 + ',' + (topY - topOff) +
        '" fill="#C4A878" stroke="#5C5448" stroke-width="0.6"/>' +
        // Top edge (the rim of the hollow top)
        '<polygon points="' +
          x1 + ',' + topY + ' ' + x2 + ',' + (topY - topOff) + ' ' +
          (x2 + 3) + ',' + (topY - topOff - 2) + ' ' + (x1 + 3) + ',' + (topY - 2) +
        '" fill="#FAF0D5" stroke="#5C5448" stroke-width="0.6"/>' +
      '</g>';
  });
  return '<svg class="lg-svg" viewBox="0 0 140 140">' + svg + '</svg>';
}

/* 8 — The Vellum Layer Push
   Isometric bars sit UNDER a frosted vellum sheet. Initially they
   read as blurred dark shapes. As the ripple hits, each bar pushes
   up hard enough that its top plane becomes briefly sharp + in-focus
   through the "vellum" (filter blur animates 4px → 0 → 4px). */
function lgSvg_8() {
  var COLS = 4, ROWS = 2, CELL = 22, STEP = 0.12;
  var bars = '';
  for (var r = 0; r < ROWS; r++) {
    for (var c = 0; c < COLS; c++) {
      var x = 22 + c * CELL + r * 6;
      var y = 104 - r * 10;
      var h = 30 + ((c + r * 3) % 4) * 8;
      var delay = (c + r) * STEP;
      var x1 = x, y1 = y;
      var x2 = x + 14, y2 = y - 4;
      bars +=
        '<g class="lg8-bar" style="animation-delay:' + delay + 's;transform-origin:' + x1 + 'px ' + y1 + 'px">' +
          '<polygon points="' +
            x1 + ',' + y1 + ' ' + x2 + ',' + y2 + ' ' +
            x2 + ',' + (y2 - h) + ' ' + x1 + ',' + (y1 - h) +
          '" fill="#5C5448" stroke="#2C2A28" stroke-width="0.3"/>' +
          '<polygon points="' +
            x1 + ',' + (y1 - h) + ' ' + x2 + ',' + (y2 - h) + ' ' +
            (x2 + 4) + ',' + (y2 - h - 3) + ' ' + (x1 + 4) + ',' + (y1 - h - 3) +
          '" fill="#7A7571" stroke="#2C2A28" stroke-width="0.3"/>' +
          '<polygon points="' +
            x2 + ',' + y2 + ' ' + (x2 + 4) + ',' + (y2 - 3) + ' ' +
            (x2 + 4) + ',' + (y2 - h - 3) + ' ' + x2 + ',' + (y2 - h) +
          '" fill="#3A3834" stroke="#2C2A28" stroke-width="0.3"/>' +
        '</g>';
    }
  }
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    '<defs>' +
      // Paper grain for the vellum sheet
      '<filter id="lg8-vellum">' +
        '<feTurbulence baseFrequency="2.2" numOctaves="2" seed="9" stitchTiles="stitch"/>' +
        '<feColorMatrix values="0 0 0 0 0.85  0 0 0 0 0.82  0 0 0 0 0.74  0 0 0 0.55 0"/>' +
      '</filter>' +
    '</defs>' +
    bars +
    // Vellum overlay — translucent warm paper with grain
    '<rect x="0" y="0" width="140" height="140" fill="rgba(250, 249, 246, 0.42)" ' +
          'pointer-events="none"/>' +
    '<rect x="0" y="0" width="140" height="140" fill="transparent" filter="url(#lg8-vellum)" ' +
          'opacity="0.6" pointer-events="none"/>' +
  '</svg>';
}

/* 9 — The Ledger Stack
   Bars built from 4 discrete "poker chip" ledger segments that fall
   from above with a staccato cascading ease, slamming into place.
   Once a full stack lands, a risograph kelly-green wash bleeds out
   from the base signalling booked revenue. */
function lgSvg_9() {
  var cols = [{ x: 30 }, { x: 60 }, { x: 90 }];
  var floor = 108, chipH = 8, chipW = 20;
  var segs = '';
  var washes = '';
  cols.forEach(function(col, ci) {
    var colDelay = ci * 0.35;
    for (var s = 0; s < 4; s++) {
      // chips fall top → bottom of their stack (first chip lands at floor)
      var y = floor - (s + 1) * chipH;
      var delay = colDelay + s * 0.09;
      var tint = ['#2C2A28', '#5C5448', '#8A7C64', '#E88140'][s];
      var topTint = ['#3A3834', '#6F6654', '#9B8B70', '#F3A268'][s];
      segs +=
        '<g class="lg9-chip" style="animation-delay:' + delay + 's;transform-origin:' + col.x + 'px ' + y + 'px">' +
          // Chip front
          '<polygon points="' +
            col.x + ',' + (y + chipH) + ' ' + (col.x + chipW) + ',' + (y + chipH - 2) + ' ' +
            (col.x + chipW) + ',' + (y - 2) + ' ' + col.x + ',' + y +
          '" fill="' + tint + '" stroke="#1A1918" stroke-width="0.4"/>' +
          // Chip top
          '<polygon points="' +
            col.x + ',' + y + ' ' + (col.x + chipW) + ',' + (y - 2) + ' ' +
            (col.x + chipW + 3) + ',' + (y - 4) + ' ' + (col.x + 3) + ',' + (y - 2) +
          '" fill="' + topTint + '" stroke="#1A1918" stroke-width="0.4"/>' +
          // Chip right side
          '<polygon points="' +
            (col.x + chipW) + ',' + (y + chipH - 2) + ' ' + (col.x + chipW + 3) + ',' + (y + chipH - 4) + ' ' +
            (col.x + chipW + 3) + ',' + (y - 4) + ' ' + (col.x + chipW) + ',' + (y - 2) +
          '" fill="#1A1918" stroke="#000" stroke-width="0.3"/>' +
        '</g>';
    }
    // Revenue wash — kelly-green radial bleed out from base
    washes +=
      '<ellipse class="lg9-wash" cx="' + (col.x + chipW / 2) + '" cy="' + (floor + 2) + '" ' +
               'rx="18" ry="6" fill="#2E7D32" opacity="0" ' +
               'style="animation-delay:' + (colDelay + 0.5) + 's"/>';
  });
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    // Baseline
    '<line x1="16" y1="108" x2="124" y2="108" stroke="#5C5448" stroke-width="0.6"/>' +
    washes +
    segs +
  '</svg>';
}

/* 10 — The Variance Shift
   Two thick side-by-side bars — the left drawn as a dashed pencil
   "projected" bar, the right as a solid charcoal "actual" bar. Both
   ripple up together; the solid bar shoots past the dashed one, and
   the exact overshoot region fills with a bright coral wash. */
function lgSvg_10() {
  var floor = 112, barW = 28;
  var projH = 58, actH = 78;          // actual exceeds projected by 20
  var p = { x: 40 }, a = { x: 80 };
  var topOff = 5;
  var pTop = floor - projH;
  var aTop = floor - actH;
  var overshootTop = aTop;
  var overshootBot = pTop;
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    // Baseline
    '<line x1="24" y1="112" x2="124" y2="112" stroke="#7A7571" stroke-width="0.6"/>' +
    // Labels
    '<text x="54" y="124" fill="#7A7571" font-size="5.5" font-family="ui-monospace, monospace" text-anchor="middle">PROJ</text>' +
    '<text x="94" y="124" fill="#2C2A28" font-size="5.5" font-family="ui-monospace, monospace" font-weight="700" text-anchor="middle">ACT</text>' +
    // Projected bar (dashed pencil outline)
    '<g class="lg10-proj" style="transform-origin:' + p.x + 'px ' + floor + 'px">' +
      '<polygon points="' +
        p.x + ',' + floor + ' ' + (p.x + barW) + ',' + (floor - topOff) + ' ' +
        (p.x + barW) + ',' + (pTop - topOff) + ' ' + p.x + ',' + pTop +
      '" fill="none" stroke="#7A7571" stroke-width="0.9" stroke-dasharray="3 2"/>' +
      '<polygon points="' +
        p.x + ',' + pTop + ' ' + (p.x + barW) + ',' + (pTop - topOff) + ' ' +
        (p.x + barW + 4) + ',' + (pTop - topOff - 3) + ' ' + (p.x + 4) + ',' + (pTop - 3) +
      '" fill="none" stroke="#7A7571" stroke-width="0.9" stroke-dasharray="3 2"/>' +
    '</g>' +
    // Actual bar — solid charcoal, overshoots past projected
    '<g class="lg10-act" style="transform-origin:' + a.x + 'px ' + floor + 'px">' +
      // Front face (charcoal — lower portion up to projected peak)
      '<polygon points="' +
        a.x + ',' + floor + ' ' + (a.x + barW) + ',' + (floor - topOff) + ' ' +
        (a.x + barW) + ',' + (pTop - topOff) + ' ' + a.x + ',' + pTop +
      '" fill="#2C2A28" stroke="#1A1918" stroke-width="0.4"/>' +
      // Coral overshoot region
      '<polygon class="lg10-coral" points="' +
        a.x + ',' + pTop + ' ' + (a.x + barW) + ',' + (pTop - topOff) + ' ' +
        (a.x + barW) + ',' + (aTop - topOff) + ' ' + a.x + ',' + aTop +
      '" fill="#FF6B5C" stroke="#B8483C" stroke-width="0.4"/>' +
      // Right side — full bar
      '<polygon points="' +
        (a.x + barW) + ',' + (floor - topOff) + ' ' + (a.x + barW + 4) + ',' + (floor - topOff - 3) + ' ' +
        (a.x + barW + 4) + ',' + (aTop - topOff - 3) + ' ' + (a.x + barW) + ',' + (aTop - topOff) +
      '" fill="#1A1918" stroke="#000" stroke-width="0.4"/>' +
      // Top face
      '<polygon points="' +
        a.x + ',' + aTop + ' ' + (a.x + barW) + ',' + (aTop - topOff) + ' ' +
        (a.x + barW + 4) + ',' + (aTop - topOff - 3) + ' ' + (a.x + 4) + ',' + (aTop - 3) +
      '" fill="#FF8A7D" stroke="#B8483C" stroke-width="0.4"/>' +
    '</g>' +
    // "+20" delta callout that appears after overshoot
    '<text class="lg10-delta" x="94" y="' + (overshootTop + (overshootBot - overshootTop) / 2 + 2) + '" ' +
          'fill="#FAF9F6" font-size="5" font-family="ui-monospace, monospace" ' +
          'font-weight="700" text-anchor="middle">+20</text>' +
  '</svg>';
}

/* 11 — The Market Topography
   A dense 12×6 field of thin isometric needles forming a topographic
   grid. A slow, heavy diagonal wave sweeps back-left → front-right
   across the whole field (duration ~6s — deliberately unhurried to
   sell "processing thousands of data points"). */
function lgSvg_11() {
  var COLS = 12, ROWS = 6, CELLW = 9, CELLH = 6, STEP = 0.035;
  var needles = '';
  for (var r = 0; r < ROWS; r++) {
    for (var c = 0; c < COLS; c++) {
      var x = 14 + c * CELLW + r * 4;
      var y = 112 - r * CELLH;
      // Height varies pseudo-randomly for topography feel
      var h = 10 + (((c * 7 + r * 11) % 9) * 2.8);
      var delay = (c + r) * STEP;
      var x1 = x, y1 = y;
      var x2 = x + 4, y2 = y - 1.5;
      needles +=
        '<g class="lg11-needle" style="animation-delay:' + delay + 's;transform-origin:' + x1 + 'px ' + y1 + 'px">' +
          // Thin front face
          '<polygon points="' +
            x1 + ',' + y1 + ' ' + x2 + ',' + y2 + ' ' +
            x2 + ',' + (y2 - h) + ' ' + x1 + ',' + (y1 - h) +
          '" fill="#5C5448" stroke="none"/>' +
          // Thin top
          '<polygon points="' +
            x1 + ',' + (y1 - h) + ' ' + x2 + ',' + (y2 - h) + ' ' +
            (x2 + 1.2) + ',' + (y2 - h - 0.8) + ' ' + (x1 + 1.2) + ',' + (y1 - h - 0.8) +
          '" fill="#8A7C64" stroke="none"/>' +
        '</g>';
    }
  }
  return '<svg class="lg-svg" viewBox="0 0 140 140">' + needles + '</svg>';
}

/* 12 — The Calendar Matrix
   7-col × 4-row grid of debossed calendar squares pressed into paper.
   A ripple sweeps across the "month" — selected cells pop up from
   indented → elevated with a sharp yellow top edge flagging a booked
   appointment. Unbooked cells remain indented. */
function lgSvg_12() {
  var COLS = 7, ROWS = 4, CELLW = 13, CELLH = 14, STEP = 0.055;
  // Booked pattern — some cells stay flat, others pop up
  var booked = {
    '1-2': 1, '2-0': 1, '2-4': 1, '3-1': 1, '3-5': 1,
    '1-6': 1, '2-6': 1, '0-3': 1, '3-3': 1, '1-1': 1, '2-2': 1
  };
  var cells = '';
  for (var r = 0; r < ROWS; r++) {
    for (var c = 0; c < COLS; c++) {
      var x = 16 + c * CELLW;
      var y = 30 + r * CELLH;
      var delay = (c + r) * STEP;
      var isBooked = booked[r + '-' + c];
      if (isBooked) {
        cells +=
          '<g class="lg12-cell lg12-cell--booked" ' +
             'style="animation-delay:' + delay + 's;transform-origin:' + (x + CELLW/2) + 'px ' + (y + CELLH/2) + 'px">' +
            // Front
            '<rect x="' + x + '" y="' + y + '" width="' + (CELLW - 1.5) + '" height="' + (CELLH - 1.5) + '" ' +
                  'fill="#2C2A28" stroke="#1A1918" stroke-width="0.3"/>' +
            // Yellow top highlight edge
            '<rect class="lg12-top" x="' + x + '" y="' + (y - 1.5) + '" width="' + (CELLW - 1.5) + '" height="1.8" ' +
                  'fill="#FFD700"/>' +
          '</g>';
      } else {
        // Debossed empty slot
        cells +=
          '<rect x="' + x + '" y="' + y + '" width="' + (CELLW - 1.5) + '" height="' + (CELLH - 1.5) + '" ' +
                'fill="#E8E0CF" stroke="#C4BAA0" stroke-width="0.4" rx="0.5"/>';
      }
    }
  }
  // Day-of-week header row
  var dows = ['S','M','T','W','T','F','S'];
  var header = dows.map(function(d, i) {
    return '<text x="' + (16 + i * CELLW + (CELLW - 1.5)/2) + '" y="24" ' +
           'fill="#7A7571" font-size="6" font-family="ui-monospace, monospace" ' +
           'text-anchor="middle">' + d + '</text>';
  }).join('');
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    header +
    cells +
  '</svg>';
}

/* 13 — The Time-Slot Cascade
   4 tall bars; each bar is broken into 5 horizontal time-slice
   slabs. As the ripple hits a bar, each slab spins 180° around the
   bar's vertical axis in sequence (like a briefcase-lock combo),
   snapping into its final alignment with a heavy drop. */
function lgSvg_13() {
  var bars = [{ x: 28 }, { x: 54 }, { x: 80 }, { x: 106 }];
  var floor = 116, barW = 18, slabH = 14, slabCount = 5;
  var topOff = 4;
  var svg = '';
  bars.forEach(function(b, bi) {
    var colDelay = bi * 0.26;
    for (var s = 0; s < slabCount; s++) {
      var y = floor - (s + 1) * slabH;
      var delay = colDelay + s * 0.09;
      // Alternating slab tints — schedule-block feel
      var tint = (s % 2 === 0) ? '#E88140' : '#B85F2A';
      var topTint = (s % 2 === 0) ? '#F3A268' : '#D17036';
      var x1 = b.x, x2 = b.x + barW;
      svg +=
        '<g class="lg13-slab" style="animation-delay:' + delay + 's;transform-origin:' + (b.x + barW/2) + 'px ' + (y + slabH/2) + 'px">' +
          // Front face
          '<polygon points="' +
            x1 + ',' + (y + slabH) + ' ' + x2 + ',' + (y + slabH - 3) + ' ' +
            x2 + ',' + (y - 3) + ' ' + x1 + ',' + y +
          '" fill="' + tint + '" stroke="#2C2A28" stroke-width="0.4"/>' +
          // Top
          '<polygon points="' +
            x1 + ',' + y + ' ' + x2 + ',' + (y - 3) + ' ' +
            (x2 + 3) + ',' + (y - 5) + ' ' + (x1 + 3) + ',' + (y - 2) +
          '" fill="' + topTint + '" stroke="#2C2A28" stroke-width="0.4"/>' +
          // Side
          '<polygon points="' +
            x2 + ',' + (y + slabH - 3) + ' ' + (x2 + 3) + ',' + (y + slabH - 5) + ' ' +
            (x2 + 3) + ',' + (y - 5) + ' ' + x2 + ',' + (y - 3) +
          '" fill="#7A3F1A" stroke="#2C2A28" stroke-width="0.4"/>' +
          // Hour label on side of slab
          '<text x="' + (x1 + 3) + '" y="' + (y + slabH - 4) + '" fill="#FAF9F6" ' +
                'font-size="3.5" font-family="ui-monospace, monospace" font-weight="700">' +
            (9 + s) + ':00</text>' +
        '</g>';
    }
  });
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    // Baseline
    '<line x1="18" y1="' + floor + '" x2="124" y2="' + floor + '" ' +
          'stroke="#5C5448" stroke-width="0.6"/>' +
    svg +
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
