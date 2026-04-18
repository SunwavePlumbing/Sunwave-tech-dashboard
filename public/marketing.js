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

  // ── 17 loader concepts — each an SVG / DOM + class package ──
  // Variants 1–15 are the new architectural + business animations;
  // 16 & 17 are the two kept from the prior round (origami fold +
  // terra-cotta curing bar). CSS in marketing-paper.css drives most
  // of the motion — SMIL is used where CSS alone can't animate the
  // attribute (SVG `points`, `d`, `cx`, etc.).
  var cells = [
    { n:  1, name: 'Drafting Pencil Circle Trace',       svg: lgSvg_1() },
    { n:  2, name: 'Blueprint Overlay Stagger',          svg: lgSvg_2() },
    { n:  3, name: 'Paper Flip Book of a Building',      svg: lgSvg_3() },
    { n:  4, name: 'Floor Plan Room Draw',               svg: lgSvg_4() },
    { n:  5, name: 'Blueprint Grid Ripple',              svg: lgSvg_5() },
    { n:  6, name: 'Pencil → Pen Line Weight',           svg: lgSvg_6() },
    { n:  7, name: 'Architectural Model Unfolding',      svg: lgSvg_7() },
    { n:  8, name: 'Paper Crane Transformation',         svg: lgSvg_8() },
    { n:  9, name: 'Vellum Paper Scale Pulse',           svg: lgSvg_9() },
    { n: 10, name: 'Laser-Cut Stencil Shadow Sweep',     svg: lgSvg_10() },
    { n: 11, name: 'Tabular Data Growth Cascade',        svg: lgSvg_11() },
    { n: 12, name: 'Growth Chart Risograph Highlighter', svg: lgSvg_12() },
    { n: 13, name: 'Stacked Data Column Fill',           svg: lgSvg_13() },
    { n: 14, name: 'Project Roadmap Connection',         svg: lgSvg_14() },
    { n: 15, name: 'Isometric Bar Chart Ripple',         svg: lgSvg_15() },
    { n: 16, name: 'Continuous Origami Fold (kept)',     svg: lgSvg_16() },
    { n: 17, name: 'Terra Cotta Curing Bar (kept)',      svg: lgSvg_17() }
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

/* 2 — Architectural Overlay Blueprint Stagger
   4 translucent vellum layers stack into place, each dropping in
   from a few pixels above with a 100ms delay and a "cushioned"
   decelerating ease to simulate tracing-paper air-resistance. */
function lgSvg_2() {
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    // Layer 1 — building outline
    '<g class="lg2-layer lg2-layer--1" stroke="#002147" fill="none" stroke-width="1.1">' +
      '<rect x="28" y="34" width="84" height="72"/>' +
      '<line x1="28" y1="70" x2="112" y2="70"/>' +
    '</g>' +
    // Layer 2 — interior walls
    '<g class="lg2-layer lg2-layer--2" stroke="#002147" fill="none" stroke-width="0.9">' +
      '<line x1="66" y1="34" x2="66" y2="70"/>' +
      '<line x1="66" y1="70" x2="112" y2="70"/>' +
      '<line x1="88" y1="70" x2="88" y2="106"/>' +
    '</g>' +
    // Layer 3 — dimension lines + door swing
    '<g class="lg2-layer lg2-layer--3" stroke="#B57A3A" fill="none" stroke-width="0.8" stroke-dasharray="2 2">' +
      '<path d="M66,50 Q78,50 78,62" stroke-dasharray="0"/>' +
      '<line x1="28" y1="22" x2="112" y2="22"/>' +
      '<line x1="28" y1="19" x2="28" y2="25"/>' +
      '<line x1="112" y1="19" x2="112" y2="25"/>' +
    '</g>' +
    // Layer 4 — annotations + final ink
    '<g class="lg2-layer lg2-layer--4" fill="#2C2A28" font-family="ui-monospace, monospace" font-size="6">' +
      '<text x="44" y="52">LIVING</text>' +
      '<text x="78" y="52">KITCHEN</text>' +
      '<text x="44" y="88">BED</text>' +
      '<text x="94" y="88">BATH</text>' +
      '<circle cx="36" cy="70" r="1.2" fill="#002147"/>' +
      '<circle cx="104" cy="70" r="1.2" fill="#002147"/>' +
    '</g>' +
  '</svg>';
}

/* 3 — Physical Paper Flip Book of a Building
   8 construction frames cycled via CSS animation-delay with a
   keyframe that holds each frame's opacity at 1 for 1/8 of the
   cycle then snaps to 0. The flip-book "frame-by-frame" feel comes
   from the deliberate lack of interpolation between states.
   Container is tilted -6° for an isometric presentation. */
function lgSvg_3() {
  // Helper — a floor box (rectangle with window grid)
  function floor(y, wins) {
    var w = '';
    if (wins) {
      for (var i = 0; i < 3; i++) {
        w += '<rect x="' + (42 + i*15) + '" y="' + (y+5) + '" width="8" height="10" ' +
             'fill="#FAF9F6" stroke="#2C2A28" stroke-width="0.5"/>';
      }
    }
    return '<rect x="36" y="' + y + '" width="68" height="20" ' +
           'fill="#E8E0CF" stroke="#2C2A28" stroke-width="0.8"/>' + w;
  }
  var frames = [
    // F1 — site leveling (just foundation line)
    '<line x1="30" y1="115" x2="110" y2="115" stroke="#2C2A28" stroke-width="1.2"/>',
    // F2 — foundation
    '<rect x="36" y="108" width="68" height="8" fill="#C19A6B" stroke="#2C2A28" stroke-width="0.8"/>',
    // F3 — + 1st floor
    '<rect x="36" y="108" width="68" height="8" fill="#C19A6B" stroke="#2C2A28" stroke-width="0.8"/>' +
    floor(88, false),
    // F4 — + 1st floor windows
    '<rect x="36" y="108" width="68" height="8" fill="#C19A6B" stroke="#2C2A28" stroke-width="0.8"/>' +
    floor(88, true),
    // F5 — + 2nd floor
    '<rect x="36" y="108" width="68" height="8" fill="#C19A6B" stroke="#2C2A28" stroke-width="0.8"/>' +
    floor(88, true) + floor(68, false),
    // F6 — + 2nd floor windows
    '<rect x="36" y="108" width="68" height="8" fill="#C19A6B" stroke="#2C2A28" stroke-width="0.8"/>' +
    floor(88, true) + floor(68, true),
    // F7 — + 3rd floor
    '<rect x="36" y="108" width="68" height="8" fill="#C19A6B" stroke="#2C2A28" stroke-width="0.8"/>' +
    floor(88, true) + floor(68, true) + floor(48, true),
    // F8 — + peaked roof + door
    '<rect x="36" y="108" width="68" height="8" fill="#C19A6B" stroke="#2C2A28" stroke-width="0.8"/>' +
    floor(88, true) + floor(68, true) + floor(48, true) +
    '<polygon points="30,48 70,28 110,48" fill="#7A4A25" stroke="#2C2A28" stroke-width="0.8"/>' +
    '<rect x="64" y="98" width="12" height="18" fill="#7A4A25" stroke="#2C2A28" stroke-width="0.5"/>'
  ];
  var groups = frames.map(function(f, i) {
    return '<g class="lg3-frame lg3-frame--' + (i+1) + '">' + f + '</g>';
  }).join('');
  return '<svg class="lg-svg lg3-svg" viewBox="0 0 140 140">' + groups + '</svg>';
}

/* 4 — Sequential Floor Plan Room Draw
   Four walls draw one at a time via stroke-dashoffset, each with
   a small "drafting pause" at the corner (100ms) before the next
   begins. After the walls complete, a door-swing arc and window
   symbols fade in. */
function lgSvg_4() {
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    '<g class="lg4-plan">' +
      // Four walls of a rectangular room (34,40) to (106,100)
      '<line class="lg4-wall lg4-w1" x1="34" y1="40" x2="106" y2="40"/>' +
      '<line class="lg4-wall lg4-w2" x1="106" y1="40" x2="106" y2="100"/>' +
      '<line class="lg4-wall lg4-w3" x1="106" y1="100" x2="34" y2="100"/>' +
      '<line class="lg4-wall lg4-w4" x1="34" y1="100" x2="34" y2="40"/>' +
      // Door swing arc (appears last)
      '<g class="lg4-door">' +
        '<path d="M62,100 A14 14 0 0 1 76 86" fill="none" stroke="#7A7571" stroke-width="0.8" stroke-dasharray="1.5 1.5"/>' +
        '<line x1="62" y1="100" x2="76" y2="100" stroke="#FAF9F6" stroke-width="3"/>' +
      '</g>' +
      // Window symbols (three parallel lines)
      '<g class="lg4-win">' +
        '<line x1="52" y1="40" x2="88" y2="40" stroke="#FAF9F6" stroke-width="3"/>' +
        '<line x1="52" y1="40" x2="88" y2="40" stroke="#2C2A28" stroke-width="0.7"/>' +
      '</g>' +
    '</g>' +
  '</svg>';
}

/* 5 — Blueprint Grid Ripple to Solid Line
   6×6 grid of tiny dots. Each dot animates scale + border-radius
   (circle → square touching neighbors) with delay based on
   Chebyshev distance from center, producing a radial ripple that
   briefly forms a solid wall before reverting. */
function lgSvg_5() {
  var N = 6;
  var cellSize = 18;
  var origin = 16;          // leftmost grid position in viewBox
  var center = (N - 1) / 2; // grid center index (2.5 for 6x6)
  var html = '';
  for (var r = 0; r < N; r++) {
    for (var c = 0; c < N; c++) {
      var cx = origin + c * cellSize + cellSize / 2;
      var cy = origin + r * cellSize + cellSize / 2;
      // Chebyshev distance — creates square rings of equal delay
      var d = Math.max(Math.abs(r - center), Math.abs(c - center));
      var delay = (d * 120).toFixed(0);
      html +=
        '<rect class="lg5-dot" x="' + (cx - 8) + '" y="' + (cy - 8) +
              '" width="16" height="16" ' +
              'style="animation-delay:' + delay + 'ms"/>';
    }
  }
  return '<svg class="lg-svg" viewBox="0 0 140 140">' + html + '</svg>';
}

/* 6 — Pencil to Pen Line Weight Transition
   Two stacked paths form the same architectural arch motif. The
   bottom path is a thin faint pencil guide (static). The top path
   is drawn in as thick charcoal ink, with a turbulence + displacement
   filter giving its edges a slight irregular "ink bleed" feel. */
function lgSvg_6() {
  var d = 'M28,104 L28,72 Q28,44 70,44 Q112,44 112,72 L112,104';
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    '<defs>' +
      '<filter id="lg6-bleed">' +
        '<feTurbulence baseFrequency="0.9" numOctaves="1" seed="4"/>' +
        '<feDisplacementMap in="SourceGraphic" scale="1.2"/>' +
      '</filter>' +
    '</defs>' +
    // Pencil guide — faint, thin, static
    '<path d="' + d + '" fill="none" stroke="#7A7571" stroke-width="0.5" ' +
          'opacity="0.45" stroke-linecap="round" stroke-linejoin="round"/>' +
    // Ink tracing — thicker, drawn in, bleeding
    '<path class="lg6-ink" d="' + d + '" fill="none" stroke="#2C2A28" ' +
          'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" ' +
          'filter="url(#lg6-bleed)"/>' +
    // Base line under the arch
    '<line x1="16" y1="104" x2="124" y2="104" stroke="#7A7571" stroke-width="0.5" opacity="0.45"/>' +
    '<line class="lg6-ink lg6-ink--base" x1="16" y1="104" x2="124" y2="104" ' +
          'stroke="#2C2A28" stroke-width="2.2" stroke-linecap="round" filter="url(#lg6-bleed)"/>' +
  '</svg>';
}

/* 7 — Architectural Model Unfolding
   Central square (the "core") with four triangular flaps hinged on
   each of its edges. Flaps begin folded onto the core (rotated 180°
   around their shared edge) and unfold outward with a stiff bouncy
   ease that overshoots + snaps back. */
function lgSvg_7() {
  return '<div class="lg7-scene">' +
    '<div class="lg7-core"></div>' +
    '<div class="lg7-flap lg7-flap--top"></div>' +
    '<div class="lg7-flap lg7-flap--right"></div>' +
    '<div class="lg7-flap lg7-flap--bottom"></div>' +
    '<div class="lg7-flap lg7-flap--left"></div>' +
  '</div>';
}

/* 8 — Paper Crane Transformation
   Square morphs into a crane silhouette via SMIL path morphing.
   A CSS drop-shadow on the container scales with animation phase
   (see .lg8-wrap in CSS) to sell the physical depth. */
function lgSvg_8() {
  return '<div class="lg8-wrap">' +
    '<svg class="lg-svg" viewBox="0 0 140 140">' +
      '<path fill="#F4F1EA" stroke="#5C5448" stroke-width="0.6" stroke-linejoin="round">' +
        '<animate attributeName="d" dur="4.5s" repeatCount="indefinite" ' +
                 'calcMode="spline" keyTimes="0;0.45;0.55;1" ' +
                 'keySplines="0.3 0 0.2 1;0 0 1 1;0.3 0 0.2 1" ' +
                 'values="' +
                   // Square (flat paper)
                   'M28,28 L112,28 L112,112 L28,112 Z;' +
                   // Mid-fold (diamond kite)
                   'M70,20 L115,70 L70,120 L25,70 Z;' +
                   // Crane silhouette (head + body + wings + tail)
                   'M70,28 L82,58 L118,44 L92,72 L112,100 L86,90 L70,112 L60,88 L28,100 L48,72 L22,44 L58,58 Z;' +
                   // Back to square (via diamond implicit)
                   'M28,28 L112,28 L112,112 L28,112 Z"/>' +
      '</path>' +
    '</svg>' +
  '</div>';
}

/* 9 — Vellum Paper Scale Pulse
   A technical cross-section detail (beam with flange + web + bolts)
   scales 1 → 1.06 → 1 on a slow cycle. Above it, a fixed noise
   overlay sits in multiply blend mode, so the drawing appears to
   move UNDER the stationary paper grain — locking the scene into
   the physical world per the spec. */
function lgSvg_9() {
  return '<div class="lg9-wrap">' +
    '<svg class="lg-svg lg9-drawing" viewBox="0 0 140 140">' +
      // Wide-flange beam (I-beam) cross-section with bolts + dimension
      '<g stroke="#2C2A28" fill="none" stroke-width="1.1" stroke-linejoin="round">' +
        // Top flange
        '<rect x="30" y="40" width="80" height="9" fill="#E8E0CF"/>' +
        // Web
        '<rect x="64" y="49" width="12" height="42" fill="#E8E0CF"/>' +
        // Bottom flange
        '<rect x="30" y="91" width="80" height="9" fill="#E8E0CF"/>' +
      '</g>' +
      // Bolt holes
      '<g fill="#2C2A28">' +
        '<circle cx="40" cy="44.5" r="1.2"/>' +
        '<circle cx="100" cy="44.5" r="1.2"/>' +
        '<circle cx="40" cy="95.5" r="1.2"/>' +
        '<circle cx="100" cy="95.5" r="1.2"/>' +
      '</g>' +
      // Dimension lines (yellow, technical)
      '<g stroke="#B09000" stroke-width="0.5" fill="#6B5600">' +
        '<line x1="30" y1="114" x2="110" y2="114"/>' +
        '<line x1="30" y1="111" x2="30" y2="117"/>' +
        '<line x1="110" y1="111" x2="110" y2="117"/>' +
        '<text x="62" y="124" font-size="6" font-family="ui-monospace, monospace" stroke="none">W8×15</text>' +
      '</g>' +
    '</svg>' +
    // Static paper grain overlaid ON TOP in multiply mode
    '<div class="lg9-grain"></div>' +
  '</div>';
}

/* 10 — Laser-Cut Stencil Shadow Sweep
   A static geometric stencil. The drop-shadow's (dx, dy, blur, alpha)
   are animated in a circular sine-wave pattern via CSS keyframes —
   only the LIGHT SOURCE moves, the stencil sits still, so the scene
   reads as a physical object on a desk rather than a moving UI. */
function lgSvg_10() {
  return '<div class="lg10-stencil">' +
    '<svg class="lg-svg" viewBox="0 0 140 140">' +
      // A grid of small architectural cut-outs
      '<g fill="#FAF9F6" stroke="#2C2A28" stroke-width="0.8">' +
        '<rect x="20" y="20" width="32" height="32" rx="2"/>' +
        '<circle cx="70" cy="36" r="16"/>' +
        '<rect x="88" y="20" width="32" height="32" rx="2"/>' +
        // Middle row
        '<polygon points="20,72 52,72 36,104"/>' +
        '<rect x="54" y="60" width="32" height="40" rx="1"/>' +
        '<polygon points="88,72 120,72 104,104"/>' +
        // Bottom row — three small circles
        '<circle cx="32" cy="118" r="6"/>' +
        '<circle cx="70" cy="118" r="6"/>' +
        '<circle cx="108" cy="118" r="6"/>' +
      '</g>' +
    '</svg>' +
  '</div>';
}

/* 11 — Tabular Data Growth Cascade
   Four P&L rows. Each fades in with an upward slide, and the moment
   it lands its background flashes vibrant yellow then fades clear —
   simulating a calculated cell being highlighted. Staggered 250ms. */
function lgSvg_11() {
  var rows = [
    { label: 'Revenue',   val: '$273K', pos: '+25%' },
    { label: 'COGS',      val: '$144K', pos: '+34%' },
    { label: 'Gross',     val: '$129K', pos: '+38%' },
    { label: 'Net Inc.',  val:  '$41K', pos: '-30%' }
  ];
  var html = rows.map(function(r, i) {
    return '<div class="lg11-row" style="animation-delay:' + (i * 0.28) + 's">' +
      '<span class="lg11-label">' + r.label + '</span>' +
      '<span class="lg11-val">'   + r.val   + '</span>' +
      '<span class="lg11-pos">'   + r.pos   + '</span>' +
    '</div>';
  }).join('');
  return '<div class="lg11-wrap">' + html + '</div>';
}

/* 12 — Growth Chart Risograph Highlighter
   Static yellow-wash area fill underneath a charcoal line chart.
   A clip-rect (animated left → right) reveals the fill in sync
   with the line drawing, producing the "highlighter following the
   pen" effect. Turbulence on the fill gives it marker-on-paper feel. */
function lgSvg_12() {
  var line = 'M20,108 L40,94 L60,80 L80,64 L100,48 L120,30';
  var fill = 'M20,108 L40,94 L60,80 L80,64 L100,48 L120,30 L120,120 L20,120 Z';
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    '<defs>' +
      '<filter id="lg12-tex">' +
        '<feTurbulence baseFrequency="0.85" numOctaves="2" seed="6"/>' +
        '<feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.18 0"/>' +
        '<feComposite in2="SourceGraphic" operator="in"/>' +
      '</filter>' +
      '<clipPath id="lg12-clip">' +
        '<rect x="0" y="0" width="140" height="140" class="lg12-clip-rect"/>' +
      '</clipPath>' +
    '</defs>' +
    // Axis lines
    '<g stroke="#7A7571" stroke-width="0.5" opacity="0.4">' +
      '<line x1="20" y1="108" x2="120" y2="108"/>' +
      '<line x1="20" y1="20" x2="20" y2="108"/>' +
    '</g>' +
    // Yellow wash — static, revealed via clipPath
    '<g clip-path="url(#lg12-clip)">' +
      '<path d="' + fill + '" fill="#FFD700" opacity="0.45"/>' +
      '<rect x="0" y="0" width="140" height="140" fill="transparent" filter="url(#lg12-tex)"/>' +
    '</g>' +
    // Charcoal data line (drawn in via CSS)
    '<path class="lg12-line" d="' + line + '" fill="none" stroke="#2C2A28" ' +
          'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
    // Data point markers — appear as the line passes through
    '<g fill="#2C2A28">' +
      '<circle class="lg12-dot lg12-dot--1" cx="20"  cy="108" r="2"/>' +
      '<circle class="lg12-dot lg12-dot--2" cx="40"  cy="94"  r="2"/>' +
      '<circle class="lg12-dot lg12-dot--3" cx="60"  cy="80"  r="2"/>' +
      '<circle class="lg12-dot lg12-dot--4" cx="80"  cy="64"  r="2"/>' +
      '<circle class="lg12-dot lg12-dot--5" cx="100" cy="48"  r="2"/>' +
      '<circle class="lg12-dot lg12-dot--6" cx="120" cy="30"  r="2"/>' +
    '</g>' +
  '</svg>';
}

/* 13 — Stacked Data Column Fill
   Three columns, each with three color-tiered segments. Segments
   drop in bottom → middle → top per column with a heavy gravitational
   ease-in easing (accelerating into the landing). Columns staggered
   left → right. */
function lgSvg_13() {
  var cols = [
    { x: 28, delay: 0 },
    { x: 60, delay: 0.18 },
    { x: 92, delay: 0.36 }
  ];
  var segments = '';
  cols.forEach(function(c, idx) {
    // Bottom: dark, Middle: mid, Top: light — rendered bottom-up
    // via transform-origin at bottom so scaleY grows upward.
    segments +=
      '<rect class="lg13-seg lg13-seg--b" x="' + c.x + '" y="86" width="20" height="24" ' +
            'fill="#002147" style="animation-delay:' + (c.delay        ) + 's"/>' +
      '<rect class="lg13-seg lg13-seg--m" x="' + c.x + '" y="66" width="20" height="20" ' +
            'fill="#5578A0" style="animation-delay:' + (c.delay + 0.22) + 's"/>' +
      '<rect class="lg13-seg lg13-seg--t" x="' + c.x + '" y="46" width="20" height="20" ' +
            'fill="#BFE0F3" style="animation-delay:' + (c.delay + 0.44) + 's"/>';
  });
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    // Baseline
    '<line x1="20" y1="110" x2="120" y2="110" stroke="#7A7571" stroke-width="0.6"/>' +
    segments +
  '</svg>';
}

/* 14 — Sequential Project Roadmap Connection
   4 icons sit on a dashed grid. A charcoal line draws from left to
   right across them. Each icon has its own delayed animation that
   fires at the exact moment the pen reaches it — scale-pulse +
   fill transitions from hollow to solid accent color. */
function lgSvg_14() {
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    // Dashed grid background
    '<g stroke="#D6CFBD" stroke-width="0.4" stroke-dasharray="2 3">' +
      '<line x1="10" y1="35" x2="130" y2="35"/>' +
      '<line x1="10" y1="70" x2="130" y2="70"/>' +
      '<line x1="10" y1="105" x2="130" y2="105"/>' +
    '</g>' +
    // The connecting line that draws through each icon
    '<path class="lg14-path" d="M26,98 Q44,98 52,70 T80,42 Q98,42 112,70" ' +
          'fill="none" stroke="#2C2A28" stroke-width="1.3" stroke-linecap="round"/>' +
    // Icons along the path (hollow → solid with scale pulse)
    '<g>' +
      '<circle class="lg14-icon lg14-icon--1" cx="26"  cy="98" r="6"/>' +
      '<rect   class="lg14-icon lg14-icon--2" x="46"   y="64" width="12" height="12"/>' +
      '<circle class="lg14-icon lg14-icon--3" cx="80"  cy="42" r="6"/>' +
      '<polygon class="lg14-icon lg14-icon--4" points="112,64 118,76 106,76"/>' +
    '</g>' +
  '</svg>';
}

/* 15 — Isometric Bar Chart Ripple
   4×3 grid of isometric bars. Each bar scaleY-animates 0→1 with an
   elastic cubic-bezier that overshoots then wobbles into place. The
   diagonal delay (delay = (col + row) * step) produces a ripple that
   sweeps corner-to-corner. */
function lgSvg_15() {
  var COLS = 4, ROWS = 3, CELL = 20, STEP = 0.08;
  var bars = '';
  for (var r = 0; r < ROWS; r++) {
    for (var c = 0; c < COLS; c++) {
      // Isometric offset per cell — right shifts X, down shifts Y.
      // On a 140x140 viewbox anchor at (20, 110) for bottom-left.
      var x = 20 + c * CELL + r * 6;       // isometric column X
      var y = 100 - r * 10;                 // isometric row baseline Y
      // Height varies slightly per cell for visual interest
      var h = 22 + (((c + r*2) % 5) * 8);
      var delay = (c + r) * STEP;
      // Parallelogram: one visible face + a thin top face
      var x1 = x, y1 = y;
      var x2 = x + 14, y2 = y - 4;
      bars +=
        '<g class="lg15-bar" style="animation-delay:' + delay + 's;transform-origin:' + x1 + 'px ' + y1 + 'px">' +
          // Front face
          '<polygon points="' +
            x1 + ',' + y1 + ' ' + x2 + ',' + y2 + ' ' +
            x2 + ',' + (y2 - h) + ' ' + x1 + ',' + (y1 - h) +
          '" fill="#E88140" stroke="#2C2A28" stroke-width="0.4"/>' +
          // Top face
          '<polygon points="' +
            x1 + ',' + (y1 - h) + ' ' + x2 + ',' + (y2 - h) + ' ' +
            (x2 + 4) + ',' + (y2 - h - 3) + ' ' + (x1 + 4) + ',' + (y1 - h - 3) +
          '" fill="#F3A268" stroke="#2C2A28" stroke-width="0.4"/>' +
          // Right side face
          '<polygon points="' +
            x2 + ',' + y2 + ' ' + (x2 + 4) + ',' + (y2 - 3) + ' ' +
            (x2 + 4) + ',' + (y2 - h - 3) + ' ' + x2 + ',' + (y2 - h) +
          '" fill="#B85F2A" stroke="#2C2A28" stroke-width="0.4"/>' +
        '</g>';
    }
  }
  return '<svg class="lg-svg" viewBox="0 0 140 140">' + bars + '</svg>';
}

/* 16 — Continuous Origami Fold (KEPT from prior round)
   A square polygon whose `points` attribute is animated via SMIL,
   simulating a square folding + unfolding. Drop-shadow + noise
   overlay preserved from the original. */
function lgSvg_16() {
  return '<svg class="lg-svg" viewBox="0 0 140 140">' +
    '<defs>' +
      '<filter id="lg16-shadow" x="-30%" y="-30%" width="160%" height="160%">' +
        '<feGaussianBlur stdDeviation="3"/>' +
        '<feOffset dx="0" dy="3"/>' +
        '<feComponentTransfer><feFuncA type="linear" slope="0.35"/></feComponentTransfer>' +
        '<feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>' +
      '</filter>' +
      '<filter id="lg16-noise">' +
        '<feTurbulence baseFrequency="0.9" numOctaves="2" seed="3" stitchTiles="stitch"/>' +
        '<feColorMatrix values="0 0 0 0 0.2  0 0 0 0 0.17  0 0 0 0 0.12  0 0 0 0.12 0"/>' +
        '<feComposite in2="SourceGraphic" operator="in"/>' +
      '</filter>' +
    '</defs>' +
    '<polygon fill="#F4F1EA" filter="url(#lg16-shadow)" ' +
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
    '<rect width="140" height="140" fill="transparent" filter="url(#lg16-noise)" opacity="0.7"/>' +
  '</svg>';
}

/* 17 — Terra Cotta Curing Bar (KEPT from prior round)
   Plain DOM — rounded container + inner fill div. CSS animates width
   0→100% while background transitions from wet-clay to baked-terracotta. */
function lgSvg_17() {
  return '<div class="lg17-wrap"><div class="lg17-fill"></div></div>';
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
