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
    { n:  1, name: 'Drafting Pencil Circle Trace', svg: lgSvg_1()  },
    { n:  2, name: 'Sequential Leaf Vein Pathing', svg: lgSvg_2()  },
    { n:  3, name: 'Origami Pop-Up Fold',          svg: lgSvg_3()  },
    { n:  4, name: 'Topographical Ripple',         svg: lgSvg_4()  },
    { n:  5, name: 'Blueprint Grid Ripple',        svg: lgSvg_5()  },
    { n:  6, name: 'Paper Flip-Book Building',     svg: lgSvg_6()  },
    { n:  7, name: 'Laser-Cut Stencil Shadow',     svg: lgSvg_7()  },
    { n:  8, name: 'Stacked Data Column Fill',     svg: lgSvg_8()  },
    { n:  9, name: 'Connected Flow-Chart',         svg: lgSvg_9()  },
    { n: 10, name: 'Terra Cotta Curing Bar',       svg: lgSvg_10() }
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
   10 paper / ink / tactile loading animations — digital paper calendar
   Every variant reads as smooth, continuous, fountain-pen + risograph.
   Class prefix lgN — CSS scoped per-variant in marketing-paper.css.
   Drawn strokes use pathLength="100" so a single dasharray=100 keyframe
   works across paths of any real length.
   ══════════════════════════════════════════════════════════════════ */

/* 1 — Drafting Pencil Circle Trace
   A single pencil tip rotates around center, tracing a perfect charcoal
   circle via stroke-dashoffset. A coral dimension line with R=60.00%
   appears near completion; the date materializes in the center;
   everything fades and restarts smoothly. */
function lgSvg_1() {
  var cx = 70, cy = 74, R = 36;
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    // Traced circle
    '<circle class="lg1-circle" cx="' + cx + '" cy="' + cy + '" r="' + R + '" ' +
           'pathLength="100" fill="none" stroke="#2C2A28" stroke-width="1.3" ' +
           'stroke-linecap="round" stroke-dasharray="100" stroke-dashoffset="100"/>' +
    // Rotating pencil (tip sits at 3 o'clock, rotates around center)
    '<g class="lg1-pencil" style="transform-origin:' + cx + 'px ' + cy + 'px">' +
      '<g transform="translate(' + (cx + R) + ' ' + cy + ')">' +
        // Graphite tip
        '<polygon points="0,0 3.5,-2 3.5,2" fill="#2C2A28"/>' +
        // Wood body
        '<polygon points="3.5,-2 14,-3.2 14,3.2 3.5,2" fill="#D9A86B" stroke="#2C2A28" stroke-width="0.4"/>' +
        // Ferrule
        '<rect x="14" y="-3.2" width="3" height="6.4" fill="#A79D8B" stroke="#2C2A28" stroke-width="0.3"/>' +
        // Eraser
        '<rect x="17" y="-3.2" width="5" height="6.4" fill="#E88140" stroke="#2C2A28" stroke-width="0.3"/>' +
      '</g>' +
    '</g>' +
    // Center pivot mark (subtle)
    '<circle cx="' + cx + '" cy="' + cy + '" r="0.8" fill="#7A7571"/>' +
    // Dimension line (bottom)
    '<g class="lg1-dim">' +
      '<line x1="' + (cx - R) + '" y1="' + (cy + R + 12) + '" x2="' + (cx + R) + '" y2="' + (cy + R + 12) + '" ' +
            'stroke="#E88140" stroke-width="0.6" stroke-dasharray="2 2"/>' +
      '<polyline points="' + (cx - R + 3) + ',' + (cy + R + 10) + ' ' + (cx - R) + ',' + (cy + R + 12) + ' ' + (cx - R + 3) + ',' + (cy + R + 14) + '" fill="none" stroke="#E88140" stroke-width="0.6"/>' +
      '<polyline points="' + (cx + R - 3) + ',' + (cy + R + 10) + ' ' + (cx + R) + ',' + (cy + R + 12) + ' ' + (cx + R - 3) + ',' + (cy + R + 14) + '" fill="none" stroke="#E88140" stroke-width="0.6"/>' +
      '<text x="' + cx + '" y="' + (cy + R + 22) + '" fill="#E88140" font-size="6" ' +
            'font-family="ui-monospace, monospace" font-weight="700" text-anchor="middle" ' +
            'letter-spacing="0.05em" style="font-variant-numeric: tabular-nums">R = 60.00%</text>' +
    '</g>' +
    // Date inside circle
    '<text class="lg1-date" x="' + cx + '" y="' + (cy + 3) + '" fill="#2C2A28" font-size="11" ' +
          'font-family="ui-monospace, monospace" font-weight="800" text-anchor="middle" ' +
          'letter-spacing="0.04em">Apr 18</text>' +
  '</svg>';
}

/* 2 — Sequential Leaf Vein Pathing
   A leaf outline draws itself; midrib follows; 8 lateral veins cascade
   out in staggered pairs. Whole leaf fades and redraws seamlessly. */
function lgSvg_2() {
  var leaf   = 'M70 18 C96 32, 110 62, 96 108 C90 118, 80 124, 70 126 C60 124, 50 118, 44 108 C30 62, 44 32, 70 18 Z';
  var midrib = 'M70 22 L70 124';
  var veins = [
    'M70 36 L50 50', 'M70 36 L90 50',
    'M70 56 L44 70', 'M70 56 L96 70',
    'M70 76 L46 90', 'M70 76 L94 90',
    'M70 96 L54 108','M70 96 L86 108'
  ];
  var veinSvg = veins.map(function(d, i) {
    return '<path class="lg2-vein lg2-vein--' + i + '" d="' + d + '" pathLength="100" ' +
           'fill="none" stroke="#2C2A28" stroke-width="0.8" stroke-linecap="round" ' +
           'stroke-dasharray="100" stroke-dashoffset="100" ' +
           'style="animation-delay:' + (i * 0.12).toFixed(2) + 's"/>';
  }).join('');
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    '<path class="lg2-leaf" d="' + leaf + '" pathLength="100" fill="#F3EBD7" stroke="#2C2A28" ' +
          'stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" ' +
          'stroke-dasharray="100" stroke-dashoffset="100"/>' +
    '<path class="lg2-midrib" d="' + midrib + '" pathLength="100" fill="none" stroke="#2C2A28" ' +
          'stroke-width="1.1" stroke-linecap="round" stroke-dasharray="100" stroke-dashoffset="100"/>' +
    veinSvg +
    '<text x="70" y="14" fill="#7A7571" font-size="4.5" font-family="ui-monospace, monospace" ' +
          'text-anchor="middle" letter-spacing="0.1em">DAYS 1 \u2013 5</text>' +
  '</svg>';
}

/* 3 — Origami Pop-Up Fold
   5-frame flip-book: flat square → diagonal fold → triangle → paper
   crane (with a wing flap) → flattened entry bar "10 AM MEETING".
   Frames swap via steps-like opacity, crane flaps once, then collapses. */
function lgSvg_3() {
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    // Title
    '<text x="70" y="22" fill="#7A7571" font-size="4.5" font-family="ui-monospace, monospace" ' +
          'text-anchor="middle" letter-spacing="0.1em">ORIGAMI SCHEDULE</text>' +
    // Shadow plate (static)
    '<ellipse cx="70" cy="116" rx="32" ry="3" fill="#2C2A28" opacity="0.12"/>' +
    // Frame 0 — flat cardstock
    '<g class="lg3-frame lg3-frame--0">' +
      '<rect x="44" y="54" width="52" height="52" fill="#FAF0D5" stroke="#2C2A28" stroke-width="1.1"/>' +
    '</g>' +
    // Frame 1 — diagonal fold
    '<g class="lg3-frame lg3-frame--1">' +
      '<polygon points="44,54 96,54 70,106" fill="#F3EBD7" stroke="#2C2A28" stroke-width="1.1"/>' +
      '<polygon points="44,54 70,106 44,106" fill="#E8DBB8" stroke="#2C2A28" stroke-width="1.1"/>' +
    '</g>' +
    // Frame 2 — triangle
    '<g class="lg3-frame lg3-frame--2">' +
      '<polygon points="70,38 98,96 42,96" fill="#F3EBD7" stroke="#2C2A28" stroke-width="1.1"/>' +
      '<line x1="70" y1="38" x2="70" y2="96" stroke="#2C2A28" stroke-width="0.6" stroke-dasharray="1.5 1.5"/>' +
    '</g>' +
    // Frame 3 — crane
    '<g class="lg3-frame lg3-frame--3">' +
      // body
      '<polygon points="60,80 80,80 94,94 46,94" fill="#FAF0D5" stroke="#2C2A28" stroke-width="1.1"/>' +
      // left wing
      '<polygon class="lg3-wing lg3-wing--l" points="60,80 28,52 48,86" fill="#F3EBD7" stroke="#2C2A28" stroke-width="1.1" style="transform-origin:60px 82px"/>' +
      // right wing
      '<polygon class="lg3-wing lg3-wing--r" points="80,80 112,52 92,86" fill="#F3EBD7" stroke="#2C2A28" stroke-width="1.1" style="transform-origin:80px 82px"/>' +
      // beak
      '<polyline points="80,80 96,68 105,72" fill="none" stroke="#2C2A28" stroke-width="1" stroke-linejoin="round"/>' +
      // tail
      '<polyline points="60,80 40,70 32,74" fill="none" stroke="#2C2A28" stroke-width="1" stroke-linejoin="round"/>' +
    '</g>' +
    // Frame 4 — flattened entry
    '<g class="lg3-frame lg3-frame--4">' +
      '<rect x="26" y="78" width="88" height="16" rx="2.5" fill="#FAF0D5" stroke="#2C2A28" stroke-width="1.1"/>' +
      '<text x="70" y="89" fill="#2C2A28" font-size="7" font-family="ui-monospace, monospace" ' +
            'font-weight="700" text-anchor="middle" letter-spacing="0.05em">10 AM MEETING</text>' +
    '</g>' +
  '</svg>';
}

/* 4 — Topographical Ripple
   4 concentric irregular contours draw outward via stroke-dashoffset.
   Central peak pulses. On retract, all contours fade and restart from
   a quiet dot. Slow, meditative rhythm. */
function lgSvg_4() {
  var rings = [
    'M70 50 C86 50, 96 60, 96 72 C96 86, 86 96, 70 96 C54 96, 44 86, 44 72 C44 60, 54 50, 70 50 Z',
    'M70 38 C94 38, 106 56, 106 72 C106 90, 92 108, 70 108 C48 108, 34 90, 34 72 C34 56, 46 38, 70 38 Z',
    'M70 26 C100 26, 116 50, 116 72 C116 96, 100 120, 70 120 C40 120, 24 96, 24 72 C24 50, 40 26, 70 26 Z',
    'M70 14 C108 14, 128 44, 128 72 C128 102, 108 130, 70 130 C32 130, 12 102, 12 72 C12 44, 32 14, 70 14 Z'
  ];
  var paths = rings.map(function(d, i) {
    return '<path class="lg4-ring lg4-ring--' + i + '" d="' + d + '" pathLength="100" ' +
           'fill="none" stroke="#2C2A28" stroke-width="0.9" stroke-linecap="round" ' +
           'stroke-dasharray="100" stroke-dashoffset="100" ' +
           'style="animation-delay:' + (i * 0.35).toFixed(2) + 's"/>';
  }).join('');
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    // Title
    '<text x="70" y="14" fill="#7A7571" font-size="4.5" font-family="ui-monospace, monospace" ' +
          'text-anchor="middle" letter-spacing="0.12em">TOPOGRAPHY</text>' +
    paths +
    // Central peak
    '<circle class="lg4-peak" cx="70" cy="72" r="2.6" fill="#E88140" stroke="#2C2A28" ' +
           'stroke-width="0.5" style="transform-origin:70px 72px"/>' +
    // Meeting label
    '<text class="lg4-label" x="70" y="64" fill="#2C2A28" font-size="4.5" ' +
          'font-family="ui-monospace, monospace" font-weight="700" text-anchor="middle" ' +
          'letter-spacing="0.08em">MEET</text>' +
  '</svg>';
}

/* 5 — Blueprint Grid Ripple
   A 7×7 field of faint isometric dots. A radial wave expands from
   center, transforming dots into solid horizontal+vertical line
   segments (a blueprint grid). Wave reaches edges, reverses back to
   dots. Continuous breath. */
function lgSvg_5() {
  var cols = 7, rows = 7;
  var dx = 16, dy = 16;
  var startX = 14, startY = 16;
  var dots = '', hLines = '', vLines = '';
  var cc = 3, cr = 3;
  for (var r = 0; r < rows; r++) {
    for (var c = 0; c < cols; c++) {
      var x = startX + c * dx;
      var y = startY + r * dy;
      var gd = Math.sqrt((r - cr) * (r - cr) + (c - cc) * (c - cc));
      var delay = gd * 0.18;
      dots += '<circle class="lg5-dot" cx="' + x + '" cy="' + y + '" r="1.1" fill="#7A7571" opacity="0.5"/>';
      if (c < cols - 1) {
        hLines += '<line class="lg5-line lg5-h" x1="' + x + '" y1="' + y + '" ' +
                  'x2="' + (x + dx) + '" y2="' + y + '" stroke="#2C2A28" stroke-width="0.9" ' +
                  'stroke-linecap="round" style="transform-origin:' + x + 'px ' + y + 'px;' +
                  'animation-delay:' + delay.toFixed(2) + 's"/>';
      }
      if (r < rows - 1) {
        vLines += '<line class="lg5-line lg5-v" x1="' + x + '" y1="' + y + '" ' +
                  'x2="' + x + '" y2="' + (y + dy) + '" stroke="#2C2A28" stroke-width="0.9" ' +
                  'stroke-linecap="round" style="transform-origin:' + x + 'px ' + y + 'px;' +
                  'animation-delay:' + delay.toFixed(2) + 's"/>';
      }
    }
  }
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    hLines + vLines + dots +
    '<text x="70" y="134" fill="#7A7571" font-size="4.5" font-family="ui-monospace, monospace" ' +
          'text-anchor="middle" letter-spacing="0.12em">BLUEPRINT GRID</text>' +
  '</svg>';
}

/* 6 — Paper Flip-Book of a Building
   5 construction-stage frames cycle via steps-like opacity: LOT →
   FOUNDATION → FRAMING → CLADDING → COMPLETE. Tactile analog flip-
   book feel; distinct rhythm per stage. */
function lgSvg_6() {
  var base = '<line x1="20" y1="108" x2="120" y2="108" stroke="#2C2A28" stroke-width="0.6" stroke-dasharray="2 2"/>';
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    '<text x="70" y="18" fill="#7A7571" font-size="4.5" font-family="ui-monospace, monospace" ' +
          'text-anchor="middle" letter-spacing="0.12em">FLIP-BOOK BUILD</text>' +
    base +
    // 0 — empty lot
    '<g class="lg6-frame lg6-frame--0">' +
      '<text x="70" y="82" fill="#7A7571" font-size="5" font-family="ui-monospace, monospace" ' +
            'text-anchor="middle" letter-spacing="0.1em">LOT READY</text>' +
    '</g>' +
    // 1 — foundation
    '<g class="lg6-frame lg6-frame--1">' +
      '<rect x="36" y="100" width="68" height="8" fill="#A79D8B" stroke="#2C2A28" stroke-width="0.8"/>' +
      '<text x="70" y="88" fill="#7A7571" font-size="4.5" font-family="ui-monospace, monospace" ' +
            'text-anchor="middle" letter-spacing="0.1em">FOUNDATION</text>' +
    '</g>' +
    // 2 — framing
    '<g class="lg6-frame lg6-frame--2">' +
      '<rect x="36" y="100" width="68" height="8" fill="#A79D8B" stroke="#2C2A28" stroke-width="0.8"/>' +
      '<g stroke="#2C2A28" stroke-width="0.9" fill="none">' +
        '<line x1="40" y1="100" x2="40" y2="52"/>' +
        '<line x1="60" y1="100" x2="60" y2="52"/>' +
        '<line x1="80" y1="100" x2="80" y2="52"/>' +
        '<line x1="100" y1="100" x2="100" y2="52"/>' +
        '<line x1="40" y1="52"  x2="100" y2="52"/>' +
        '<line x1="40" y1="76"  x2="100" y2="76"/>' +
      '</g>' +
      '<text x="70" y="42" fill="#7A7571" font-size="4.5" font-family="ui-monospace, monospace" ' +
            'text-anchor="middle" letter-spacing="0.1em">FRAMING</text>' +
    '</g>' +
    // 3 — cladding + windows
    '<g class="lg6-frame lg6-frame--3">' +
      '<rect x="36" y="100" width="68" height="8" fill="#A79D8B" stroke="#2C2A28" stroke-width="0.8"/>' +
      '<rect x="40" y="52"  width="60" height="48" fill="#F3EBD7" stroke="#2C2A28" stroke-width="1"/>' +
      '<rect x="48" y="60" width="10" height="10" fill="#4A7CB8" stroke="#2C2A28" stroke-width="0.6"/>' +
      '<rect x="65" y="60" width="10" height="10" fill="#4A7CB8" stroke="#2C2A28" stroke-width="0.6"/>' +
      '<rect x="82" y="60" width="10" height="10" fill="#4A7CB8" stroke="#2C2A28" stroke-width="0.6"/>' +
      '<rect x="48" y="80" width="10" height="10" fill="#4A7CB8" stroke="#2C2A28" stroke-width="0.6"/>' +
      '<rect x="82" y="80" width="10" height="10" fill="#4A7CB8" stroke="#2C2A28" stroke-width="0.6"/>' +
      '<rect x="65" y="80" width="10" height="20" fill="#E88140" stroke="#2C2A28" stroke-width="0.6"/>' +
      '<text x="70" y="42" fill="#7A7571" font-size="4.5" font-family="ui-monospace, monospace" ' +
            'text-anchor="middle" letter-spacing="0.1em">CLADDING</text>' +
    '</g>' +
    // 4 — complete
    '<g class="lg6-frame lg6-frame--4">' +
      '<rect x="36" y="100" width="68" height="8" fill="#A79D8B" stroke="#2C2A28" stroke-width="0.8"/>' +
      '<rect x="40" y="52"  width="60" height="48" fill="#F3EBD7" stroke="#2C2A28" stroke-width="1"/>' +
      '<polygon points="34,52 106,52 70,30" fill="#D17036" stroke="#2C2A28" stroke-width="1"/>' +
      '<rect x="48" y="60" width="10" height="10" fill="#4A7CB8" stroke="#2C2A28" stroke-width="0.6"/>' +
      '<rect x="65" y="60" width="10" height="10" fill="#4A7CB8" stroke="#2C2A28" stroke-width="0.6"/>' +
      '<rect x="82" y="60" width="10" height="10" fill="#4A7CB8" stroke="#2C2A28" stroke-width="0.6"/>' +
      '<rect x="48" y="80" width="10" height="10" fill="#4A7CB8" stroke="#2C2A28" stroke-width="0.6"/>' +
      '<rect x="82" y="80" width="10" height="10" fill="#4A7CB8" stroke="#2C2A28" stroke-width="0.6"/>' +
      '<rect x="65" y="80" width="10" height="20" fill="#E88140" stroke="#2C2A28" stroke-width="0.6"/>' +
      '<rect x="84" y="34" width="5.5" height="10" fill="#2C2A28"/>' +
      '<text x="70" y="42" fill="#3CA04A" font-size="5" font-family="ui-monospace, monospace" ' +
            'font-weight="800" text-anchor="middle" letter-spacing="0.1em">COMPLETE</text>' +
    '</g>' +
  '</svg>';
}

/* 7 — Laser-Cut Stencil Shadow Sweep
   A 5×5 grid of windows punched out of an off-white facade. A light
   source sweeps left → right; a skewed shadow band cast across the
   facade elongates and retracts, landing precisely on the "current"
   time column at the end of each cycle. Clean, continuous arc. */
function lgSvg_7() {
  var windows = '';
  var rows = 5, cols = 5;
  var startX = 28, startY = 34;
  var wW = 10, wH = 12, gap = 5;
  for (var r = 0; r < rows; r++) {
    for (var c = 0; c < cols; c++) {
      var x = startX + c * (wW + gap);
      var y = startY + r * (wH + gap);
      windows += '<rect x="' + x + '" y="' + y + '" width="' + wW + '" height="' + wH + '" ' +
                 'fill="#FAF0D5" stroke="#2C2A28" stroke-width="0.6"/>';
    }
  }
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    '<defs>' +
      '<clipPath id="lg7-clip">' +
        '<rect x="22" y="28" width="96" height="94"/>' +
      '</clipPath>' +
    '</defs>' +
    // Title
    '<text x="70" y="18" fill="#7A7571" font-size="4.5" font-family="ui-monospace, monospace" ' +
          'text-anchor="middle" letter-spacing="0.12em">SOLAR TRACK</text>' +
    // Facade base
    '<rect x="22" y="28" width="96" height="94" fill="#E8DBB8" stroke="#2C2A28" stroke-width="1"/>' +
    windows +
    // Shadow band (clipped)
    '<g clip-path="url(#lg7-clip)">' +
      '<polygon class="lg7-shadow" points="-50,28 10,28 -14,122 -74,122" fill="#2C2A28" opacity="0.32"/>' +
    '</g>' +
    // Sun token
    '<g class="lg7-sun">' +
      '<circle cx="0" cy="0" r="4.5" fill="#F3C670" stroke="#2C2A28" stroke-width="0.6"/>' +
    '</g>' +
  '</svg>';
}

/* 8 — Stacked Data Column Fill
   4 vertical bars. Colored blocks cascade in from top, slamming into
   place to form the bars. Once each bar fills, a risograph teal
   highlight bleeds behind it. Every cycle: blocks fade, restart. */
function lgSvg_8() {
  var bars = [
    { x: 22,  h: 5, color: '#3CA04A' },
    { x: 54,  h: 4, color: '#D17036' },
    { x: 86,  h: 5, color: '#2C2A28' },
    { x: 118, h: 3, color: '#4A7CB8' }
  ];
  var highlights = '', outlines = '', blocks = '';
  var barBottom = 108, blockH = 10, barW = 16;
  bars.forEach(function(b, bi) {
    var topY = barBottom - b.h * blockH;
    // Riso highlight (teal bleed) behind bar
    highlights += '<rect class="lg8-highlight lg8-highlight--' + bi + '" ' +
                  'x="' + (b.x - 2) + '" y="' + (topY - 2) + '" ' +
                  'width="' + (barW + 4) + '" height="' + (b.h * blockH + 4) + '" rx="1.5" ' +
                  'fill="#5DC4C0" ' +
                  'style="animation-delay:' + (bi * 0.25 + b.h * 0.15 + 0.2).toFixed(2) + 's"/>';
    outlines += '<rect x="' + b.x + '" y="' + topY + '" width="' + barW + '" ' +
                'height="' + (b.h * blockH) + '" fill="none" stroke="#2C2A28" stroke-width="0.8"/>';
    for (var i = 0; i < b.h; i++) {
      var blockY = barBottom - (i + 1) * blockH;
      var col = (i % 2 === 0) ? b.color : '#2C2A28';
      var delay = bi * 0.25 + i * 0.16;
      blocks += '<rect class="lg8-block" x="' + b.x + '" y="' + blockY + '" ' +
                'width="' + barW + '" height="' + blockH + '" fill="' + col + '" ' +
                'stroke="#2C2A28" stroke-width="0.5" ' +
                'style="animation-delay:' + delay.toFixed(2) + 's"/>';
    }
  });
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    '<text x="70" y="18" fill="#7A7571" font-size="4.5" font-family="ui-monospace, monospace" ' +
          'text-anchor="middle" letter-spacing="0.12em">TEAM ALLOCATION</text>' +
    '<line x1="14" y1="108" x2="140" y2="108" stroke="#2C2A28" stroke-width="0.8"/>' +
    highlights + outlines + blocks +
  '</svg>';
}

/* 9 — Connected Flow-Chart
   4 icons on a dashed grid (IDEA → MEET → BUY → UP). A charcoal data
   line paths tip-to-tip between them; each icon is highlighted with a
   risograph-yellow halo the instant the line reaches it. */
function lgSvg_9() {
  var nodes = [
    { x: 24,  y: 46,  label: 'IDEA' },
    { x: 54,  y: 94,  label: 'MEET' },
    { x: 92,  y: 54,  label: 'BUY'  },
    { x: 116, y: 100, label: 'GROW' }
  ];
  var pathD = 'M' + nodes.map(function(n) { return n.x + ' ' + n.y; }).join(' L');
  // Grid dots
  var grid = '';
  for (var gx = 10; gx <= 130; gx += 12) {
    for (var gy = 14; gy <= 122; gy += 12) {
      grid += '<circle cx="' + gx + '" cy="' + gy + '" r="0.55" fill="#7A7571" opacity="0.32"/>';
    }
  }
  var halos = nodes.map(function(n, i) {
    return '<circle class="lg9-halo lg9-halo--' + i + '" cx="' + n.x + '" cy="' + n.y + '" r="11" ' +
           'fill="#FFD700" opacity="0" ' +
           'style="animation-delay:' + (0.2 + i * 0.8).toFixed(2) + 's"/>';
  }).join('');
  function iconAt(n, i) {
    switch (i) {
      case 0: // lightbulb
        return '<circle cx="' + n.x + '" cy="' + (n.y - 1) + '" r="5.5" fill="#FAF0D5" stroke="#2C2A28" stroke-width="0.9"/>' +
               '<rect x="' + (n.x - 2.5) + '" y="' + (n.y + 4) + '" width="5" height="2.5" fill="#2C2A28"/>';
      case 1: // handshake
        return '<path d="M' + (n.x - 6) + ' ' + n.y + ' Q' + (n.x - 3) + ' ' + (n.y - 4) + ' ' + n.x + ' ' + n.y + '" fill="none" stroke="#2C2A28" stroke-width="1.1" stroke-linecap="round"/>' +
               '<path d="M' + n.x + ' ' + n.y + ' Q' + (n.x + 3) + ' ' + (n.y - 4) + ' ' + (n.x + 6) + ' ' + n.y + '" fill="none" stroke="#2C2A28" stroke-width="1.1" stroke-linecap="round"/>' +
               '<line x1="' + (n.x - 7) + '" y1="' + n.y + '" x2="' + (n.x + 7) + '" y2="' + n.y + '" stroke="#2C2A28" stroke-width="0.8"/>';
      case 2: // cart
        return '<rect x="' + (n.x - 5) + '" y="' + (n.y - 4) + '" width="10" height="6" fill="#FAF0D5" stroke="#2C2A28" stroke-width="0.9"/>' +
               '<circle cx="' + (n.x - 3) + '" cy="' + (n.y + 4) + '" r="1.4" fill="#2C2A28"/>' +
               '<circle cx="' + (n.x + 3) + '" cy="' + (n.y + 4) + '" r="1.4" fill="#2C2A28"/>';
      case 3: // upward arrow
        return '<polygon points="' + n.x + ',' + (n.y - 6) + ' ' + (n.x + 5) + ',' + n.y + ' ' + (n.x + 2) + ',' + n.y + ' ' + (n.x + 2) + ',' + (n.y + 5) + ' ' + (n.x - 2) + ',' + (n.y + 5) + ' ' + (n.x - 2) + ',' + n.y + ' ' + (n.x - 5) + ',' + n.y + '" fill="#3CA04A" stroke="#2C2A28" stroke-width="0.7"/>';
    }
    return '';
  }
  var icons = nodes.map(function(n, i) {
    return '<g class="lg9-icon lg9-icon--' + i + '" style="animation-delay:' + (0.2 + i * 0.8).toFixed(2) + 's">' +
             iconAt(n, i) +
             '<text x="' + n.x + '" y="' + (n.y + 16) + '" fill="#2C2A28" font-size="4.5" ' +
                   'font-family="ui-monospace, monospace" font-weight="700" text-anchor="middle" ' +
                   'letter-spacing="0.06em">' + n.label + '</text>' +
           '</g>';
  }).join('');
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    grid +
    '<path class="lg9-path" d="' + pathD + '" pathLength="100" fill="none" stroke="#2C2A28" ' +
          'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" ' +
          'stroke-dasharray="100" stroke-dashoffset="100"/>' +
    halos + icons +
    '<text x="70" y="14" fill="#7A7571" font-size="4.5" font-family="ui-monospace, monospace" ' +
          'text-anchor="middle" letter-spacing="0.12em">PROJECT FLOW</text>' +
  '</svg>';
}

/* 10 — Terra Cotta Curing Bar
   A rounded horizontal bar fills smoothly from 0% → 100%, color
   transitioning from dark wet-clay (sienna) to baked terracotta.
   Paper grain overlaid across the bar. A green check draws in at the
   end; cycle fades back to 0%. */
function lgSvg_10() {
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    '<defs>' +
      '<pattern id="lg10-grain" x="0" y="0" width="3" height="3" patternUnits="userSpaceOnUse">' +
        '<circle cx="1" cy="1" r="0.35" fill="#2C2A28" opacity="0.22"/>' +
      '</pattern>' +
      '<clipPath id="lg10-clipbar">' +
        '<rect x="14" y="60" width="112" height="28" rx="14"/>' +
      '</clipPath>' +
    '</defs>' +
    // Label
    '<text x="16" y="50" fill="#7A7571" font-size="5" font-family="ui-monospace, monospace" ' +
          'text-anchor="start" letter-spacing="0.1em">CURING</text>' +
    // Percentage readout (right side, rolling)
    rollingTicker({
      id: 'lg10-clip', x: 124, y: 51, w: 28, h: 9,
      values: ['0%','20%','40%','60%','80%','100%'],
      fill: '#2C2A28', size: 8, anchor: 'end', className: 'lg10-pct'
    }) +
    // Bar frame (clay well)
    '<rect x="14" y="60" width="112" height="28" rx="14" fill="#E8DBB8" stroke="#2C2A28" stroke-width="1"/>' +
    // Fill bar (scaleX animated, clipped to bar rounded shape)
    '<g clip-path="url(#lg10-clipbar)">' +
      '<rect class="lg10-fill" x="14" y="60" width="112" height="28" ' +
            'fill="#8A3A1C" style="transform-origin:14px 74px"/>' +
      '<rect x="14" y="60" width="112" height="28" fill="url(#lg10-grain)" opacity="0.65" pointer-events="none"/>' +
    '</g>' +
    // Frame stroke back on top so it's crisp
    '<rect x="14" y="60" width="112" height="28" rx="14" fill="none" stroke="#2C2A28" stroke-width="1"/>' +
    // Check badge
    '<g class="lg10-check" style="transform-origin:70px 112px">' +
      '<circle cx="70" cy="112" r="10" fill="#FAF0D5" stroke="#3CA04A" stroke-width="1.3"/>' +
      '<polyline class="lg10-check-path" points="64,112 69,117 76,106" pathLength="100" ' +
                'fill="none" stroke="#3CA04A" stroke-width="2" stroke-linecap="round" ' +
                'stroke-linejoin="round" stroke-dasharray="100" stroke-dashoffset="100"/>' +
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
