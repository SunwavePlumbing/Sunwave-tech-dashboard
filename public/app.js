var currentData = null;
var currentSort = 'revenue';
var currentTimeRange = 'mtd';
var isFetching = false;

var dateRanges = [
  { label: 'Today', key: 'day' },
  { label: 'Yesterday', key: 'yesterday' },
  { label: 'This Week', key: 'week' },
  { label: 'Week to Date', key: 'wtd' },
  { label: 'Last 7 Days', key: 'l7d' },
  { label: 'Last 14 Days', key: 'l14d' },
  { label: 'Last 30 Days', key: 'l30d' },
  { label: 'Month to Date', key: 'mtd' },
  { label: 'Last Month', key: 'lm' },
  { label: 'Last 90 Days', key: 'l90d' },
  { label: 'This Quarter', key: 'qtd' },
  { label: 'Last Quarter', key: 'lq' },
  { label: 'Quarter to Date', key: 'q2d' },
  { label: 'Year to Date', key: 'ytd' },
  { label: 'Last 365 Days', key: 'l365d' },
  { label: 'Last Year', key: 'ly' }
];

/* Muted "dusty" avatar palette — each tone is low-saturation and
   earthy so the initials read as ink-on-paper rather than neon
   lozenges. All keep enough luminance contrast for white 700-weight
   text. Hashed deterministically by name so each tech always gets
   the same color. */
/* "Stamped Ink" avatar palette — each entry has a faint tinted bg
   (~15% alpha) plus a matching saturated-dark text color. Rendered
   as circular chips (border-radius:50% via paper-mode CSS) so the
   ink letter reads as the real mark and the bg as a soft halo. */
// Avatar tint alpha bumped 0.15 → 0.30 so the color halos read clearly
// against the off-white paper background (previously washed out, per
// user feedback). Foreground ink colors unchanged — they already carry
// enough contrast for the white 700-weight initials.
var AVATAR_PALETTES = [
  { bg: 'rgba(0, 128, 128, 0.30)',   fg: '#006666' },  // teal
  { bg: 'rgba(204, 85, 0, 0.30)',    fg: '#8A3D00' },  // terracotta
  { bg: 'rgba(138, 154, 91, 0.30)',  fg: '#4F5E2E' },  // sage green
  { bg: 'rgba(225, 173, 1, 0.30)',   fg: '#7A5C00' },  // mustard
  { bg: 'rgba(95, 123, 154, 0.30)',  fg: '#2E4466' },  // dusty blue
  { bg: 'rgba(136, 120, 160, 0.30)', fg: '#4A4069' },  // heather purple
  { bg: 'rgba(181, 102, 121, 0.30)', fg: '#6E3040' },  // dusty rose
  { bg: 'rgba(90, 102, 112, 0.30)',  fg: '#2A3540' }   // slate
];
function avatarColor(name) {
  var h = 0;
  for (var i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_PALETTES[Math.abs(h) % AVATAR_PALETTES.length];
}
function initials(name) {
  var p = name.trim().split(/\s+/);
  if (p.length >= 2) return (p[0][0] + p[p.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
function fmt(n) { return '$' + Math.round(n).toLocaleString(); }

/* ── Generic number count-up animation ────────────────────────
   Animates an element's text from its previous displayed numeric
   value to `targetVal` over `duration` ms using easeOutCubic.
   `formatter(v)` returns the formatted string for each frame. */
function countUpEl(el, fromVal, targetVal, duration, formatter) {
  duration = duration || 400;
  formatter = formatter || function(v) { return Math.round(v).toLocaleString(); };
  if (el._countRaf) cancelAnimationFrame(el._countRaf);
  var start = null;
  function step(ts) {
    if (!start) start = ts;
    var t = Math.min(1, (ts - start) / duration);
    var eased = 1 - Math.pow(1 - t, 3);
    var v = fromVal + (targetVal - fromVal) * eased;
    el.textContent = formatter(v);
    if (t < 1) {
      el._countRaf = requestAnimationFrame(step);
    } else {
      el.textContent = formatter(targetVal);
      el._countRaf = null;
    }
  }
  el._countRaf = requestAnimationFrame(step);
}
function fmtDate(iso) {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Build sidebar
var sidebar = document.getElementById('dateSidebar');
var commonKeys = ['day', 'yesterday', 'mtd', 'lm', 'l30d', 'ytd'];

// Selects a range and updates all UI that reflects it (pill row + bottom
// sheet). Safe to call from any source (pill tap, sheet tap, etc.).
// If a previous fetch is still in flight, fetchData() aborts it — the
// user can always override an accidental click with a new one.
function selectRange(key) {
  if (key === currentTimeRange) return;
  currentTimeRange = key;
  // Update pill buttons in the horizontal row
  document.querySelectorAll('.date-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.range === key);
  });
  // Update bottom-sheet item selection
  document.querySelectorAll('.date-bs-item').forEach(function(b) {
    b.classList.toggle('active', b.dataset.range === key);
  });
  // Update "More" pill label to reflect the picked range when it lives
  // in the sheet (not in the common pills)
  updateMoreBtnLabel();
  fetchData();
}

function createDateBtn(range) {
  var btn = document.createElement('button');
  btn.className = 'date-btn' + (range.key === currentTimeRange ? ' active' : '');
  btn.textContent = range.label;
  btn.dataset.range = range.key;
  btn.addEventListener('click', function() { selectRange(this.dataset.range); });
  return btn;
}

/* ── Bottom-sheet modal for "More" date ranges ─────────────────
   Slide-up panel from the bottom of the screen, covering the whole
   viewport with a semi-transparent backdrop. Replaces the old inline
   dropdown that caused layout jumps on mobile. */
function buildDateSheet() {
  var backdrop = document.createElement('div');
  backdrop.className = 'date-bs-backdrop';
  backdrop.id = 'dateBsBackdrop';
  backdrop.addEventListener('click', closeDateSheet);

  var sheet = document.createElement('div');
  sheet.className = 'date-bs-sheet';
  sheet.addEventListener('click', function(e) { e.stopPropagation(); });

  sheet.innerHTML =
    '<div class="date-bs-drag">' +
      '<div class="date-bs-handle"></div>' +
      '<div class="date-bs-title">Select Date Range</div>' +
    '</div>';

  /* ── Drag-to-dismiss on the full header strip ──────────────────
     The entire handle + "Select Date Range" title acts as a single
     drag zone so the user can't miss it with a thumb. The scrollable
     list underneath stays separate so swiping options still scrolls. */
  var dragStartY = null, dragDy = 0, dragStartT = 0;
  var grabArea = sheet.querySelector('.date-bs-drag');
  function onDragMove(ev) {
    var y = ev.touches ? ev.touches[0].clientY : ev.clientY;
    dragDy = Math.max(0, y - dragStartY);  // only allow downward
    sheet.style.transition = 'none';
    sheet.style.transform  = 'translateY(' + dragDy + 'px)';
    if (ev.cancelable) ev.preventDefault();
  }
  function onDragEnd() {
    var dt = Date.now() - dragStartT;
    var velocity = dragDy / Math.max(dt, 1);   // px/ms
    sheet.style.transition = '';               // restore default transition
    sheet.style.transform  = '';               // clear inline so CSS class wins
    if (dragDy > 80 || velocity > 0.5) {
      closeDateSheet();
    }
    // else it just springs back via the default CSS transition
    window.removeEventListener('touchmove',  onDragMove, { passive: false });
    window.removeEventListener('touchend',   onDragEnd);
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup',   onDragEnd);
    dragStartY = null; dragDy = 0;
  }
  function onDragStart(ev) {
    dragStartY = ev.touches ? ev.touches[0].clientY : ev.clientY;
    dragStartT = Date.now();
    dragDy = 0;
    window.addEventListener('touchmove',  onDragMove, { passive: false });
    window.addEventListener('touchend',   onDragEnd);
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup',   onDragEnd);
  }
  grabArea.addEventListener('touchstart',  onDragStart, { passive: true });
  grabArea.addEventListener('pointerdown', onDragStart);

  var list = document.createElement('div');
  list.className = 'date-bs-list';
  // Include ALL ranges so the sheet is a single source of truth
  dateRanges.forEach(function(range) {
    var item = document.createElement('button');
    item.className = 'date-bs-item' + (range.key === currentTimeRange ? ' active' : '');
    item.dataset.range = range.key;
    item.innerHTML =
      '<span class="date-bs-item-label">' + range.label + '</span>' +
      '<span class="date-bs-item-check">\u2713</span>';
    item.addEventListener('click', function() {
      selectRange(this.dataset.range);
      closeDateSheet();
    });
    list.appendChild(item);
  });
  sheet.appendChild(list);
  backdrop.appendChild(sheet);
  document.body.appendChild(backdrop);
}

function openDateSheet() {
  var bd = document.getElementById('dateBsBackdrop');
  if (!bd) return;
  // Sync active state each open so selections made elsewhere stay in sync
  bd.querySelectorAll('.date-bs-item').forEach(function(el) {
    el.classList.toggle('active', el.dataset.range === currentTimeRange);
  });
  document.body.classList.add('date-bs-open');
  bd.classList.add('open');
}

function closeDateSheet() {
  var bd = document.getElementById('dateBsBackdrop');
  if (!bd) return;
  document.body.classList.remove('date-bs-open');
  bd.classList.remove('open');
}

/* If the active range lives in the sheet (not a common pill), show the
   picked label inside the "More" button so the user sees their current
   selection without needing to open the sheet. */
function updateMoreBtnLabel() {
  var moreBtn = document.getElementById('dateMoreBtn');
  if (!moreBtn) return;
  var isCommon = commonKeys.indexOf(currentTimeRange) !== -1;
  var labelEl = moreBtn.querySelector('.date-more-label');
  if (isCommon) {
    labelEl.textContent = 'More';
    moreBtn.classList.remove('active');
  } else {
    var range = dateRanges.find(function(r) { return r.key === currentTimeRange; });
    labelEl.textContent = range ? range.label : 'More';
    moreBtn.classList.add('active');
  }
}

if (window.innerWidth <= 768) {
  // Common pills flow horizontally; "More" is the LAST pill in the same
  // scroll container (not absolutely positioned anymore).
  //
  // Mobile-only ordering: hoist Month-to-Date to the very first position
  // so the default-selected pill is fully visible on first load — instead
  // of landing in the 4th slot where it was being clipped by the right-
  // edge fade mask. Other common pills follow in their natural order.
  var mobileOrder = ['mtd', 'day', 'yesterday', 'l30d', 'lm', 'ytd'];
  mobileOrder.forEach(function(key) {
    var range = dateRanges.find(function(r) { return r.key === key; });
    if (range) sidebar.appendChild(createDateBtn(range));
  });
  var moreBtn = document.createElement('button');
  moreBtn.id = 'dateMoreBtn';
  moreBtn.className = 'date-btn date-more-btn';
  /* Small calendar glyph + short label ("More" or the current picked range) */
  moreBtn.innerHTML =
    '<svg class="date-more-icon" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">' +
      '<rect x="2" y="3" width="12" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
      '<path d="M2 6h12" stroke="currentColor" stroke-width="1.5"/>' +
      '<path d="M5 2v3M11 2v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
    '</svg>' +
    '<span class="date-more-label">More</span>';
  moreBtn.addEventListener('click', openDateSheet);
  sidebar.appendChild(moreBtn);
  buildDateSheet();
  updateMoreBtnLabel();
} else {
  dateRanges.forEach(function(range) {
    sidebar.appendChild(createDateBtn(range));
  });
}

document.querySelectorAll('.sort-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    var newSort = this.dataset.sort;
    if (newSort === currentSort) return;
    currentSort = newSort;
    document.querySelectorAll('.sort-btn').forEach(function(b) { b.classList.remove('active'); });
    this.classList.add('active');
    var body = document.getElementById('leaderboardBody');
    body.classList.add('sorting');
    setTimeout(function() {
      render();
      body.classList.remove('sorting');
    }, 120);
  });
});

// Modal
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalBackdrop').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});
document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeModal(); });

function openModal(tech) {
  document.getElementById('modalTitle').textContent = esc(tech.name) + ' \u2014 Jobs';
  var jobs = (tech.jobList || []).slice().sort(function(a, b) {
    return new Date(b.date || 0) - new Date(a.date || 0);
  });

  var roleClass = function(role) {
    return role === 'Sold & Did' ? 'role-sold-did' : role === 'Sold' ? 'role-sold' : 'role-did';
  };

  // Shared qualifier attached to any job that's split across techs.
  // Sits inline after the partner list as a clickable ⓘ that expands
  // a small explanatory note. Housecall Pro's split-credit records
  // can land on the wrong technician in edge cases — we surface that
  // here so individual techs aren't blindsided by a bad attribution.
  var SPLIT_QUALIFIER = 'Splits are sourced from Housecall Pro and may occasionally be attributed to the wrong technician. Double-check with the tech on the job if something looks off.';
  var splitInfoSpan = '<span class="split-info" tabindex="0" role="button" aria-label="About split-credit data" onclick="toggleSplitInfo(event)" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){toggleSplitInfo(event);event.preventDefault();}">' +
      '<span class="split-info-ico" aria-hidden="true">i</span>' +
      '<span class="split-info-bubble">' + SPLIT_QUALIFIER + '</span>' +
    '</span>';

  // Desktop: table rows
  var rows = jobs.map(function(job) {
    var desc = job.description ? esc(job.description) : (job.invoice ? 'Invoice #' + esc(job.invoice) : '\u2014');
    var roleBadge = job.role ? '<span class="role-badge ' + roleClass(job.role) + '">' + esc(job.role) + '</span>' : '';
    var splitNote = (job.splitWith && job.splitWith.length > 0)
      ? '<div style="font-size:11px;color:#aaa;margin-top:2px">w/ ' + job.splitWith.map(function(s){ return esc(s.name || s) + (s.creditPct != null ? ' <span style="color:#ccc">(' + s.creditPct + '%)</span>' : ''); }).join(', ') + splitInfoSpan + '</div>' : '';
    var jobTotal = job.jobTotal != null ? fmt(job.jobTotal) : fmt(job.credit);
    var shareHtml = job.creditPct != null && job.creditPct < 100
      ? fmt(job.credit) + '<span class="share-pct">(' + job.creditPct + '%)</span>'
      : fmt(job.credit != null ? job.credit : job.amount);
    return '<tr>' +
      '<td>' + fmtDate(job.date) + '</td>' +
      '<td>' + desc + roleBadge + splitNote + '</td>' +
      '<td>' + esc(job.customer || '\u2014') + '</td>' +
      '<td>' + jobTotal + '</td>' +
      '<td>' + shareHtml + '</td>' +
      '</tr>';
  }).join('');
  document.getElementById('modalBody').innerHTML = rows ||
    '<tr><td colspan="5" style="text-align:center;color:#aaa;padding:2rem">No jobs found</td></tr>';

  // Mobile: cards
  var cards = jobs.map(function(job) {
    var desc = job.description ? esc(job.description) : (job.invoice ? 'Invoice #' + esc(job.invoice) : '\u2014');
    var roleBadge = job.role ? '<span class="role-badge ' + roleClass(job.role) + '">' + esc(job.role) + '</span>' : '';
    var splitNote = (job.splitWith && job.splitWith.length > 0)
      ? ' <span style="font-size:11px;color:#bbb">w/ ' + job.splitWith.map(function(s){ return esc(s.name || s) + (s.creditPct != null ? ' (' + s.creditPct + '%)' : ''); }).join(', ') + splitInfoSpan + '</span>' : '';
    var creditAmt = fmt(job.credit != null ? job.credit : job.amount);
    var pctHtml = job.creditPct != null && job.creditPct < 100
      ? '<span class="job-card-credit-pct">(' + job.creditPct + '%)</span>' : '';
    var totalLine = job.jobTotal != null && job.creditPct < 100
      ? '<div class="job-card-total">of ' + fmt(job.jobTotal) + '</div>' : '';
    return '<div class="job-card">' +
      '<div class="job-card-top">' +
        '<span class="job-card-date">' + fmtDate(job.date) + '</span>' +
        '<div class="job-card-right"><span class="job-card-credit">' + creditAmt + '</span>' + pctHtml + totalLine + '</div>' +
      '</div>' +
      '<div class="job-card-desc">' + desc + '</div>' +
      '<div class="job-card-meta">' + esc(job.customer || '\u2014') + roleBadge + splitNote + '</div>' +
      '</div>';
  }).join('');
  document.getElementById('modalCards').innerHTML = cards ||
    '<p style="text-align:center;color:#aaa;padding:2rem">No jobs found</p>';

  document.getElementById('modalJobCount').textContent = jobs.length + ' job' + (jobs.length !== 1 ? 's' : '');
  document.getElementById('modalTotal').textContent = fmt(tech.monthlyRevenue) + ' credited';
  document.getElementById('modalBackdrop').classList.add('open');
  lockBodyScroll();
}

function closeModal() {
  document.getElementById('modalBackdrop').classList.remove('open');
  unlockBodyScroll();
}

/* Split-credit qualifier tooltip — toggles a small explanatory bubble
   when the user taps the ⓘ icon next to a job's partner list. Closes
   any other open bubble first so only one is visible at a time, and
   stops propagation so the global outside-click handler (below) doesn't
   immediately re-close the one we just opened. */
function toggleSplitInfo(evt) {
  evt.stopPropagation();
  var target = evt.currentTarget;
  var alreadyOpen = target.classList.contains('is-open');
  document.querySelectorAll('.split-info.is-open').forEach(function(el) {
    el.classList.remove('is-open');
  });
  if (!alreadyOpen) target.classList.add('is-open');
}
/* Outside-click closes any open split-info bubble. Attached once at
   document level rather than per-icon so it survives the modal's
   innerHTML rewrites and doesn't leak listeners. */
document.addEventListener('click', function(e) {
  if (e.target.closest && e.target.closest('.split-info')) return;
  document.querySelectorAll('.split-info.is-open').forEach(function(el) {
    el.classList.remove('is-open');
  });
});

// ── Mobile-safe body scroll lock ─────────────────────────────────
// Simply setting `document.body.style.overflow = 'hidden'` does NOT
// prevent scrolling on iOS Safari — iOS ignores overflow:hidden for
// touch gestures. The only reliable fix is `position: fixed` on the
// body with `top: -<currentScrollY>px`, which genuinely removes the
// body from the scroll graph. We save the scroll offset before
// locking and restore it on unlock so the page doesn't jump to the
// top when the modal closes.
var _bodyLockScrollY = 0;
function lockBodyScroll() {
  _bodyLockScrollY = window.scrollY || window.pageYOffset || 0;
  document.body.style.top = '-' + _bodyLockScrollY + 'px';
  document.body.classList.add('modal-open');
}
function unlockBodyScroll() {
  document.body.classList.remove('modal-open');
  document.body.style.top = '';
  // Restore scroll position AFTER removing the class, otherwise the
  // browser sees the position:fixed→static transition at a non-zero
  // top and briefly scrolls to the wrong place.
  window.scrollTo(0, _bodyLockScrollY);
}

// ── Sliding tab indicator ───────────────────────────────────────
// snap=true  → remove transition, set position instantly, re-enable after paint
// snap=false → animate the slide (normal same-layout tab switch)
function updateTabIndicator(tab, snap) {
  var btn = document.querySelector('.tab-btn[data-tab="' + tab + '"]');
  var indicator = document.getElementById('tabIndicator');
  if (!btn || !indicator) return;

  if (snap) {
    // Kill transition so the stale position doesn't visibly slide
    indicator.classList.remove('tab-indicator-ready');
  }

  var nav = btn.closest('.tab-nav');
  var navRect = nav.getBoundingClientRect();
  var btnRect = btn.getBoundingClientRect();
  indicator.style.top    = (btnRect.top    - navRect.top)  + 'px';
  indicator.style.left   = (btnRect.left   - navRect.left) + 'px';
  indicator.style.width  = btnRect.width  + 'px';
  indicator.style.height = btnRect.height + 'px';

  // Re-enable transition after two frames so the new position is painted first
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      indicator.classList.add('tab-indicator-ready');
    });
  });
}
window.addEventListener('resize', function() {
  var activeBtn = document.querySelector('.tab-btn.active');
  if (activeBtn) updateTabIndicator(activeBtn.dataset.tab, true);
});

/* Replay the Technicians view's mount-in cascade. Mirrors the pattern
   from replayMarketingAnimations(): drop the class so any in-flight
   animations reset, then re-add on the next frame so the browser sees
   a fresh class transition and re-fires the keyframes. The second rAF
   is defensive — some engines coalesce class toggles within a single
   frame, and the double-rAF guarantees a paint between remove and add.
   Auto-cleanup after the longest delay + duration so the class doesn't
   linger and accidentally hide content during a later reflow. */
function replayTechAnimations() {
  var body = document.body;
  body.classList.remove('tech-mount-in');
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      body.classList.add('tech-mount-in');
      // Longest delay (240ms) + duration (500ms) + safety margin.
      setTimeout(function() { body.classList.remove('tech-mount-in'); }, 900);
    });
  });
}

// ── Tab navigation with hash-based URLs ────────────────────────
// URLs: /#technicians  /#marketing  /#owners
var marketingLoaded = false;
var ownersLoaded = false;
// First activation of the Technicians tab is handled by the one-shot
// `anim-entrance` cascade on init(). Subsequent activations call
// replayTechAnimations() so the user gets the same fade-up every time
// they land back on the tab.
var techsActivated = false;

var TAB_MAP = {
  'technicians': { view: 'techView' },
  'marketing':   { view: 'marketingView' },
  'owners':      { view: 'ownersView' }
};
var DEFAULT_TAB = 'technicians';

function activateTab(tab) {
  if (!TAB_MAP[tab]) tab = DEFAULT_TAB;

  // Update buttons
  document.querySelectorAll('.tab-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  // Update panels
  document.querySelectorAll('.view-panel').forEach(function(p) { p.classList.remove('active'); });
  document.getElementById(TAB_MAP[tab].view).classList.add('active');

  // Paper-mode skin — active site-wide (all tabs). The body class is
  // consumed by public/marketing-paper.css. To fully disable: delete
  // that file, remove its <link> tag, and the class in index.html's
  // <body class="paper-mode"> tag.
  document.body.classList.add('paper-mode');

  // Sidebar is a child of #techView and auto-hides with the tab —
  // no JS toggle needed. Tab nav width is now constant across tabs, so
  // the indicator slides smoothly on every switch.
  updateTabIndicator(tab, false);
  // Lazy-load tab data
  if (tab === 'technicians') {
    if (!techsActivated) {
      // First activation — init()'s `anim-entrance` cascade is already
      // running (or about to), so don't double-fire our own class.
      techsActivated = true;
    } else {
      // Re-entry — replay the same staggered fade-up (sidebar, stats,
      // sort pills, table) every time the user comes back to the tab.
      replayTechAnimations();
    }
  }
  if (tab === 'marketing') {
    if (!marketingLoaded) {
      // First visit: kick off the real fetch + full loader → cascade.
      marketingLoaded = true;
      fetchMarketing();
      fetchQBOMarketing();
    } else {
      // Subsequent visits: data is cached, so skip the network round-
      // trip and just replay the mount-in cascade + graph count-ups.
      // The user gets the full "dashboard waking up" animation every
      // time they land on the tab — bars growing, progress filling,
      // stat numbers counting up.
      replayMarketingAnimations();
    }
  }
  if (tab === 'owners' && !ownersLoaded) {
    ownersLoaded = true;
    fetchOwnersData(false);
  }
}

// Tab button clicks — update hash (triggers hashchange)
document.querySelectorAll('.tab-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    window.location.hash = this.dataset.tab;
  });
});

// Handle hash changes (back/forward, direct link, refresh)
window.addEventListener('hashchange', function() {
  var tab = window.location.hash.replace('#', '') || DEFAULT_TAB;
  activateTab(tab);
});

// init() is called from index.html after all script files have loaded
function init() {
  var tab = window.location.hash.replace('#', '') || DEFAULT_TAB;
  activateTab(tab); // indicator snaps on first paint (no stale position to animate from)
  // One-shot staggered entrance on first paint. Remove the class once
  // all animations complete so subsequent renders (filter changes, tab
  // switches) don't retrigger the fade-in.
  document.body.classList.add('anim-entrance');
  setTimeout(function() { document.body.classList.remove('anim-entrance'); }, 1200);
  fetchData();
  setInterval(fetchData, 5 * 60 * 1000);
}
