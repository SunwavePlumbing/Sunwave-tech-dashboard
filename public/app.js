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
// Orphans modal — separate backdrop, same close patterns.
var orphansBackdropEl = document.getElementById('orphansBackdrop');
var orphansCloseEl    = document.getElementById('orphansClose');
var orphansShowEl     = document.getElementById('techOrphansShow');
if (orphansCloseEl)    orphansCloseEl.addEventListener('click', closeOrphansModal);
if (orphansBackdropEl) orphansBackdropEl.addEventListener('click', function(e) {
  if (e.target === this) closeOrphansModal();
});
if (orphansShowEl)     orphansShowEl.addEventListener('click', openOrphansModal);
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') { closeModal(); closeOrphansModal(); }
});

/* Disclaimer copy shown when the modal opens in "unpaid" mode. Phrased
   in the same reassuring voice as the split-credit qualifier — names
   the safety net (admin reconciles at month-end) so a tech reading
   their list of unpaid jobs doesn't panic over an entry that's been
   collected but just hasn't synced through QBO/HCP yet. */
var UNPAID_QUALIFIER = 'Heads up \u2014 due to billing timing, some of these may already be paid and just not recorded yet. The admin reconciles invoices at month-end, so anything that\u2019s actually paid will get cleared by then.';

function openModal(tech, mode) {
  mode = mode || 'all';
  var isUnpaid = mode === 'unpaid';

  // Pull the full list, then optionally narrow to unpaid-only. Always
  // sort newest-first so the most-recently-completed jobs (likeliest
  // to still be in collection limbo) surface at the top.
  var jobs = (tech.jobList || []).slice();
  if (isUnpaid) jobs = jobs.filter(function(j) { return j.outstanding && j.outstanding > 0; });
  jobs.sort(function(a, b) {
    return new Date(b.date || 0) - new Date(a.date || 0);
  });

  // Title + footer-summary text both swap based on mode.
  document.getElementById('modalTitle').textContent = esc(tech.name) +
    (isUnpaid ? ' \u2014 Unpaid Jobs' : ' \u2014 Jobs');

  // "Missing a job?" CTA in the header \u2014 seeds the report-issue form
  // with this tech's name + a friendly default description so the
  // report comes in tagged to who's missing the work.
  var missingLink = document.getElementById('modalReportMissing');
  if (missingLink) {
    var missingParams = new URLSearchParams();
    missingParams.set('type', 'missing');
    missingParams.set('context',
      'I (' + tech.name + ') did a job that isn\'t showing up on my row. Details below.');
    missingLink.href = '/report-issue?' + missingParams.toString();
  }

  // Disclaimer banner: only shown in unpaid mode. We populate text via
  // textContent (not innerHTML) so the qualifier copy is XSS-safe even
  // if it ever gets wired to a CMS-controlled string.
  var banner = document.getElementById('modalBanner');
  var bannerText = document.getElementById('modalBannerText');
  if (banner && bannerText) {
    if (isUnpaid) {
      bannerText.textContent = UNPAID_QUALIFIER;
      banner.hidden = false;
    } else {
      banner.hidden = true;
    }
  }

  var roleClass = function(role) {
    return role === 'Sold & Did' ? 'role-sold-did' : role === 'Sold' ? 'role-sold' : 'role-did';
  };

  /* Build a deep-link URL into /report-issue with the job's context
     pre-filled. The page parses these query params and seeds the form
     so the tech only has to add a sentence about what's wrong.
       type    — wrong_tech / wrong_customer / wrong_split / missing / other
       invoice — the job's invoice number (if any)
       customer — the customer name (if any)
       jobId    — the job's UUID for the admin lookup
       context  — a human-readable line that goes into the description
                 (e.g. "Currently shows: Trevor Cuoco — wrong tech for #408") */
  function reportHref(job, type, context) {
    var params = new URLSearchParams();
    params.set('type', type);
    if (job.invoice)  params.set('invoice',  String(job.invoice));
    if (job.customer) params.set('customer', String(job.customer));
    if (job.id)       params.set('jobId',    String(job.id));
    if (context)      params.set('context',  context);
    return '/report-issue?' + params.toString();
  }
  // Shared aria-label + title text per type so the contextual buttons
  // tell users what they're about to flag before they click.
  var REPORT_HINT = {
    wrong_tech:   'Flag wrong tech',
    wrong_customer: 'Flag wrong customer',
    wrong_split:  'Flag wrong split'
  };
  // Tiny flag SVG used as the visual cue. Inline so it inherits color.
  var FLAG_SVG = '<svg class="report-flag-ico" viewBox="0 0 12 14" width="11" height="13" aria-hidden="true">' +
    '<path d="M2 1v12M2 2h7l-1.2 2.4L9 7H2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';

  /* Wraps a piece of UI in an anchor that opens the report page with
     the right pre-fill. Used on the role badge, the split partners,
     and the customer name. Wrapping (vs replacing) means the visual
     content reads naturally — the flag icon sits next to it as a soft
     cue, and the whole element becomes clickable on hover. */
  function reportable(innerHtml, job, type, context) {
    if (!job || (!job.invoice && !job.id)) return innerHtml;
    return '<a class="report-flag" href="' + reportHref(job, type, context) +
      '" target="_blank" rel="noopener" title="' + REPORT_HINT[type] +
      '" aria-label="' + REPORT_HINT[type] + '">' +
      innerHtml + FLAG_SVG +
      '</a>';
  }

  // Shared qualifier attached to any job that's split across techs.
  // Sits inline after the partner list as a clickable ⓘ that expands
  // a small explanatory note. Phrased to reassure the technician
  // reading it — if a split looks wrong, the dashboard isn't what
  // their payout is based on; the admin reconciles at month-end and
  // the official KPI numbers use those corrected splits, not this
  // live HCP feed.
  var SPLIT_QUALIFIER = 'These splits come straight from Housecall Pro and are sometimes attributed to the wrong tech. If one looks off, don\u2019t sweat it \u2014 the admin reconciles splits at month-end, and official KPIs use those corrected numbers, not what\u2019s shown here.';
  var splitInfoSpan = '<span class="split-info" tabindex="0" role="button" aria-label="About split-credit data" onclick="toggleSplitInfo(event)" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){toggleSplitInfo(event);event.preventDefault();}">' +
      '<span class="split-info-ico" aria-hidden="true">i</span>' +
      '<span class="split-info-bubble">' + SPLIT_QUALIFIER + '</span>' +
    '</span>';

  // Desktop: table rows
  var rows = jobs.map(function(job) {
    var desc = job.description ? esc(job.description) : (job.invoice ? 'Invoice #' + esc(job.invoice) : '\u2014');
    // Each role badge is a flag-link \u2014 clicking it opens the report
    // page pre-filled with "wrong tech" + the job context. The role
    // describes how this row currently credits the viewer's tech, so
    // flagging it == "I wasn't the {Sold|Did|Sold & Did} on this job".
    var roleBadgeInner = job.role ? '<span class="role-badge ' + roleClass(job.role) + '">' + esc(job.role) + '</span>' : '';
    var roleBadge = roleBadgeInner
      ? reportable(roleBadgeInner, job, 'wrong_tech',
          'Currently shows me as the "' + (job.role || '') + '" tech on this job \u2014 that\'s not right.')
      : '';
    var autoDatedLabel = job.autoCompletionKind === 'open_over_three_days'
      ? 'Auto marked complete'
      : 'Auto dated complete';
    var autoDatedBadge = job.autoDatedComplete
      ? '<span class="role-badge role-auto-dated">' + esc(autoDatedLabel) + '</span>' : '';
    var showPercent = Number(job.jobTotal || 0) > 0 && job.creditPct != null && job.creditPct < 100;
    // Split partner list becomes its own flag-link \u2192 reports "wrong split."
    // Includes the actual partner names + percentages in the seeded
    // description so the admin sees exactly what the tech is disputing.
    var splitText = (job.splitWith || []).map(function(s){
      return esc(s.name || s) + (s.creditPct != null ? ' <span style="color:#ccc">(' + s.creditPct + '%)</span>' : '');
    }).join(', ');
    var splitContext = 'Currently split with: ' +
      (job.splitWith || []).map(function(s){ return (s.name || s) + (s.creditPct != null ? ' (' + s.creditPct + '%)' : ''); }).join(', ') +
      '. That split is wrong.';
    var splitNote = (job.splitWith && job.splitWith.length > 0 && Number(job.jobTotal || 0) > 0)
      ? '<div style="font-size:11px;color:#aaa;margin-top:2px">w/ ' +
          reportable(splitText, job, 'wrong_split', splitContext) +
          splitInfoSpan +
        '</div>' : '';
    // Show an "Unpaid: $X" pill under the job total when the invoice
    // hasn't been collected. We display the GROSS outstanding amount
    // (not the tech's credited share) on a per-job row so the number
    // matches what the customer actually owes.
    // Unpaid amount is also reportable — clicking the flag opens the
    // report page with "wrong unpaid amount" pre-selected. Common case:
    // the customer already paid in cash or by card and HCP hasn't
    // synced the payment yet, so it shows as unpaid here when it isn't.
    var unpaidNote = (job.outstanding && job.outstanding > 0)
      ? '<div class="job-unpaid-note">' +
          reportable('Unpaid: ' + fmt(job.outstanding), job, 'wrong_unpaid',
            'This shows as ' + fmt(job.outstanding) + ' unpaid, but it\'s actually been paid (or the amount is wrong).') +
        '</div>' : '';
    var jobTotal = job.jobTotal != null ? fmt(job.jobTotal) : fmt(job.credit);
    var shareHtml = showPercent
      ? fmt(job.credit) + '<span class="share-pct">(' + job.creditPct + '%)</span>'
      : fmt(job.credit != null ? job.credit : job.amount);
    // Customer name is tappable \u2014 opens the "wrong customer" report
    // flow so a tech can flag when a job is showing the wrong customer
    // (mismatched, swapped invoice, etc.). The flag icon hugs the name
    // so the visual hint is unmistakable but unobtrusive.
    var customerContext = 'For this job (currently showing customer: ' + (job.customer || '?') + '), the customer info on this row doesn\'t match what I actually did.';
    var customerCell = reportable(esc(job.customer || '\u2014'), job, 'wrong_customer', customerContext);
    return '<tr>' +
      '<td>' + fmtDate(job.date) + '</td>' +
      '<td>' + desc + roleBadge + autoDatedBadge + splitNote + '</td>' +
      '<td>' + customerCell + '</td>' +
      '<td>' + jobTotal + unpaidNote + '</td>' +
      '<td>' + shareHtml + '</td>' +
      '</tr>';
  }).join('');
  // Empty-state copy depends on mode. In unpaid mode "No jobs found"
  // would read as a bug; the cheerier "All clear" framing tells the
  // tech they're caught up on collections.
  var emptyMsg = isUnpaid
    ? 'All clear \u2014 no unpaid jobs in this period.'
    : 'No jobs found';
  document.getElementById('modalBody').innerHTML = rows ||
    '<tr><td colspan="5" style="text-align:center;color:#aaa;padding:2rem">' + emptyMsg + '</td></tr>';

  // Mobile: cards
  var cards = jobs.map(function(job) {
    var desc = job.description ? esc(job.description) : (job.invoice ? 'Invoice #' + esc(job.invoice) : '\u2014');
    var roleBadgeInner = job.role ? '<span class="role-badge ' + roleClass(job.role) + '">' + esc(job.role) + '</span>' : '';
    var roleBadge = roleBadgeInner
      ? reportable(roleBadgeInner, job, 'wrong_tech',
          'Currently shows me as the "' + (job.role || '') + '" tech on this job \u2014 that\'s not right.')
      : '';
    var autoDatedLabel = job.autoCompletionKind === 'open_over_three_days'
      ? 'Auto marked complete'
      : 'Auto dated complete';
    var autoDatedBadge = job.autoDatedComplete
      ? '<span class="role-badge role-auto-dated">' + esc(autoDatedLabel) + '</span>' : '';
    var showPercent = Number(job.jobTotal || 0) > 0 && job.creditPct != null && job.creditPct < 100;
    var splitTextMobile = (job.splitWith || []).map(function(s){
      return esc(s.name || s) + (s.creditPct != null ? ' (' + s.creditPct + '%)' : '');
    }).join(', ');
    var splitContextMobile = 'Currently split with: ' +
      (job.splitWith || []).map(function(s){ return (s.name || s) + (s.creditPct != null ? ' (' + s.creditPct + '%)' : ''); }).join(', ') +
      '. That split is wrong.';
    var splitNote = (job.splitWith && job.splitWith.length > 0 && Number(job.jobTotal || 0) > 0)
      ? ' <span style="font-size:11px;color:#bbb">w/ ' +
          reportable(splitTextMobile, job, 'wrong_split', splitContextMobile) +
          splitInfoSpan +
        '</span>' : '';
    var creditAmt = fmt(job.credit != null ? job.credit : job.amount);
    var pctHtml = showPercent
      ? '<span class="job-card-credit-pct">(' + job.creditPct + '%)</span>' : '';
    var totalLine = showPercent
      ? '<div class="job-card-total">of ' + fmt(job.jobTotal) + '</div>' : '';
    // Mobile card: red "Unpaid" chip when there's an outstanding balance.
    // Sits on the meta row alongside role + split partners.
    var unpaidChip = (job.outstanding && job.outstanding > 0)
      ? reportable('<span class="job-card-unpaid">Unpaid ' + fmt(job.outstanding) + '</span>',
          job, 'wrong_unpaid',
          'This shows as ' + fmt(job.outstanding) + ' unpaid, but it\'s actually been paid (or the amount is wrong).')
      : '';
    var customerContextMobile = 'For this job (currently showing customer: ' + (job.customer || '?') + '), the customer info on this row doesn\'t match what I actually did.';
    var customerMobile = reportable(esc(job.customer || '\u2014'), job, 'wrong_customer', customerContextMobile);
    return '<div class="job-card">' +
      '<div class="job-card-top">' +
        '<span class="job-card-date">' + fmtDate(job.date) + '</span>' +
        '<div class="job-card-right"><span class="job-card-credit">' + creditAmt + '</span>' + pctHtml + totalLine + '</div>' +
      '</div>' +
      '<div class="job-card-desc">' + desc + '</div>' +
      '<div class="job-card-meta">' + customerMobile + roleBadge + autoDatedBadge + splitNote + unpaidChip + '</div>' +
      '</div>';
  }).join('');
  document.getElementById('modalCards').innerHTML = cards ||
    '<p style="text-align:center;color:#aaa;padding:2rem">' + emptyMsg + '</p>';

  // Footer counts/totals swap based on mode. In unpaid mode the totals
  // line is the SUM OF GROSS OUTSTANDING (what the customers actually
  // owe), not the tech's credited share — the gross figure is what
  // matches an A/R-style "you have $X to chase down" read.
  var jobNoun = isUnpaid ? 'unpaid job' : 'job';
  document.getElementById('modalJobCount').textContent =
    jobs.length + ' ' + jobNoun + (jobs.length !== 1 ? 's' : '');
  if (isUnpaid) {
    var grossOutstanding = jobs.reduce(function(s, j) { return s + (j.outstanding || 0); }, 0);
    document.getElementById('modalTotal').textContent = fmt(grossOutstanding) + ' outstanding';
  } else {
    document.getElementById('modalTotal').textContent = fmt(tech.monthlyRevenue) + ' credited';
  }
  document.getElementById('modalBackdrop').classList.add('open');
  lockBodyScroll();
}

function closeModal() {
  document.getElementById('modalBackdrop').classList.remove('open');
  unlockBodyScroll();
}

/* ── Orphans modal — paid jobs with no assigned tech in HCP ─────
   Renders the list passed by /api/tech in `currentData.orphans`,
   stashed on `window._orphanJobs` by render(). Two layouts mirror
   the per-tech modal: desktop table + mobile cards. */
/* Reason-code → label. For most cases this is a fixed string, but
   "completed_in_different_period" is the most common entry in this
   bucket and deserves a specific answer: which month is the work
   actually credited toward? We compute that from the row's kpiDate. */
function reasonLabel(row) {
  var r = row.reason;
  if (r === 'completed_in_different_period') {
    if (row.kpiDate) {
      var d = new Date(row.kpiDate);
      var month = d.toLocaleDateString('en-US', { month: 'long' });
      var day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      // Show the day for recent dates (helps techs recall the job),
      // fall back to just the month for older.
      var now = new Date();
      var daysAgo = (now - d) / (1000 * 60 * 60 * 24);
      var when = daysAgo <= 45 ? day : month;
      return 'Already credited on ' + when + ' — no action needed';
    }
    return 'Already credited in another period — no action needed';
  }
  var fixed = {
    no_assigned_employees:     'No tech assigned in HCP — needs admin fix',
    servicetitan_artifact:     'ServiceTitan migration (excluded by design)',
    job_details_unavailable:   'HCP couldn’t return job details',
    standalone_invoice_no_job: 'Standalone invoice (no service job)',
    pipeline_unknown:          'Pipeline glitch — report to admin'
  };
  return fixed[r] || r;
}

function openOrphansModal() {
  var orphans = (window._orphanJobs || []).slice();
  // Newest-paid first so the most recent issues surface at the top.
  orphans.sort(function(a, b) {
    return new Date(b.paidAt || 0) - new Date(a.paidAt || 0);
  });

  var rows = orphans.map(function(o) {
    var dateLabel = o.paidAt ? fmtDate(o.paidAt) : '—';
    var invLabel  = o.invoice ? '#' + esc(o.invoice) : '—';
    var reasonText = reasonLabel(o);
    return '<tr>' +
      '<td>' + dateLabel + '</td>' +
      '<td>' + invLabel + '</td>' +
      '<td>' + esc(o.customer || '—') + '</td>' +
      '<td style="font-size:11px;color:#8A8680">' + esc(reasonText) + '</td>' +
      '<td>' + fmt(o.amount) + '</td>' +
      '</tr>';
  }).join('');
  document.getElementById('orphansBody').innerHTML = rows ||
    '<tr><td colspan="5" style="text-align:center;color:#aaa;padding:2rem">All clear &mdash; every paid job is credited.</td></tr>';

  var cards = orphans.map(function(o) {
    var dateLabel = o.paidAt ? fmtDate(o.paidAt) : '—';
    var invLabel  = o.invoice ? '#' + esc(o.invoice) : '—';
    var status    = o.workStatus
      ? '<span class="role-badge role-did">' + esc(o.workStatus) + '</span>' : '';
    var desc      = o.description ? esc(o.description) : '—';
    var reasonText = reasonLabel(o);
    var assigned = (o.assignedEmployees && o.assignedEmployees.length)
      ? ' &middot; <span style="color:#8A8680">assigned: ' + esc(o.assignedEmployees.join(', ')) + '</span>'
      : '';
    return '<div class="job-card">' +
      '<div class="job-card-top">' +
        '<span class="job-card-date">' + dateLabel + ' · ' + invLabel + '</span>' +
        '<div class="job-card-right"><span class="job-card-credit">' + fmt(o.amount) + '</span></div>' +
      '</div>' +
      '<div class="job-card-desc">' + desc + '</div>' +
      '<div class="job-card-meta">' + esc(o.customer || '—') + status + assigned + '</div>' +
      '<div style="font-size:11px;color:#8A8680;margin-top:4px">' + esc(reasonText) + '</div>' +
      '</div>';
  }).join('');
  document.getElementById('orphansCards').innerHTML = cards ||
    '<p style="text-align:center;color:#aaa;padding:2rem">All clear &mdash; every paid job is credited.</p>';

  var totalAmount = orphans.reduce(function(s, o) { return s + (o.amount || 0); }, 0);
  document.getElementById('orphansFooterCount').textContent =
    orphans.length + ' uncredited job' + (orphans.length !== 1 ? 's' : '');
  document.getElementById('orphansFooterTotal').textContent =
    fmt(totalAmount) + ' uncredited';

  document.getElementById('orphansBackdrop').classList.add('open');
  lockBodyScroll();
}
function closeOrphansModal() {
  document.getElementById('orphansBackdrop').classList.remove('open');
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

/* Time-of-day + day-of-week greeting at the top of the page.

   Every hour of the day has its own pool of phrasings in the same
   warm, slightly playful Sunwave voice. The active phrase rotates by
   day-of-week (`phrases[dayOfWeek % phrases.length]`) so the message
   stays stable across a single calendar day but varies through the
   week — roughly each phrase repeats every 1-2 weeks given pool sizes.

   Hour-by-hour from 5am through 4am the next morning. Daytime hours
   match the night-hour granularity so the whole 24-hour cycle reads
   as one continuous voice instead of "generic mornings, character at
   night".

   Em-dashes deliberately avoided per the user's voice preference.
   "{Day}" tokens get replaced with the current weekday name. */
function updateGreeting() {
  var headlineEl = document.getElementById('greetingHeadline');
  var sublineEl  = document.getElementById('greetingSubline');
  if (!headlineEl || !sublineEl) return;

  var now = new Date();
  var h   = now.getHours();
  var d   = now.getDay(); // 0 = Sun
  var DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var MONS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var dayName = DAYS[d];

  // Phrase pools keyed by hour (24h). Each pool has 5-7 entries so the
  // day-of-week rotation gives every phrase a turn within a couple
  // weeks without any one line dominating.
  var POOLS = {
    // Daytime pools rewritten to observe a moment, name the trade
    // specifically, or carry a small point of view. Time-stamping
    // ("8 a.m. and earning it"), motivational filler, and forced
    // cleverness cut. Phrases lean longer when needed — a real
    // observation is worth more than a four-word slogan. Tone stays
    // close to the night pools, which work because they actually
    // talk back to the reader.

    // ── Pre-dawn / first crew (5am) ────────────────────────────────
    h05: [
      "Pre-dawn. The first call of {Day} hasn't come in yet",
      "Somewhere a water heater is making it through the night, hopefully",
      'Up before the trucks, before the customers, before the news',
      'Quiet yard, big {Day} ahead',
      'Up before the kettle',
      'Hi, early one',
      "Headlamps and coffee",
      "Whoever's first in matters most",
      "Early hours are honest hours",
      "{Day} hasn't made a sound yet"
    ],
    // ── Sunrise, trucks warming (6am) ──────────────────────────────
    h06: [
      'Streetlights still on. The first truck is breathing',
      'Coffee in one hand, schedule in the other',
      "Somewhere in Charlottesville, somebody's about to call you",
      'The hour before the phone rings',
      "Sun's up, trucks warming",
      'Cold start, warm cup',
      "Morning, early bird",
      'Six. The roads are still mostly empty',
      "Yard waking up. Coffee's on"
    ],
    // ── First dispatch (7am) ───────────────────────────────────────
    h07: [
      "Out the door. Someone's morning gets easier today",
      "Trucks rolling into other people's mornings",
      "First call of {Day}. Hopefully an easy one",
      "Out to make a stranger's {Day} less bad",
      "The phone's already warmer than the truck cab",
      "Trucks rolling, happy {Day}",
      "Mornin', crew",
      "Coffee's on, gloves up"
    ],
    // ── Full morning, first calls (8am) ────────────────────────────
    h08: [
      'The customers are awake. So is the dispatcher',
      "Somewhere a kettle is being put on while you arrive",
      'First wrench of {Day} is turning',
      "Eight houses today will be glad to see you",
      "The work's small. The difference isn't",
      "Good morning, and happy {Day}",
      "First service calls of {Day}",
      "Real work for real people",
      "Wrenches up, happy {Day}"
    ],
    // ── Mid-morning hustle (9am) ───────────────────────────────────
    h09: [
      'Halfway between coffee one and coffee two',
      'Estimates landing, jobs starting',
      "Some old man somewhere is glad you showed up",
      "Most plumbing problems aren't plumbing problems",
      "Steady morning. That's mostly the point",
      "Mid-morning, full speed",
      "Trucks all on a call",
      "Every job, a chance to do it right"
    ],
    // ── Flow state (10am) ──────────────────────────────────────────
    h10: [
      "Half the day's questions answered already",
      "Somewhere a shower is on for the first time in days",
      "Quiet morning. The trade moves anyway",
      "The work doesn't care what day it is",
      "Mornings like this are why people stay in the trade",
      "Hope {Day} is wrenching well",
      "Houses being made whole",
      "Specialists at work"
    ],
    // ── Almost noon push (11am) ────────────────────────────────────
    h11: [
      'Lunch is closer than it feels',
      "Most of the morning's behind you",
      'Last call before the first real sit-down',
      "Coffee's mostly cold by now",
      "Stomach knows what time it is",
      "Almost noon, push through",
      'One more before the break'
    ],
    // ── Lunch (12pm) ───────────────────────────────────────────────
    h12: [
      "Lunch. Whatever's in the cooler, eat it slow",
      "Eat. Sit. Look at nothing. That counts",
      'Sandwich and a quiet truck cab',
      'The phone can wait one hour',
      "Half the day behind you. Be present for the second",
      "Lunch break is also work",
      "Lunch break, take it",
      "Rest matters too"
    ],
    // ── Post-lunch return (1pm) ────────────────────────────────────
    h13: [
      "Back in the truck. The afternoon has its own pace",
      'Second half. The hard calls come now',
      "Afternoons earn their keep slowly",
      "The hardest calls come after lunch. Always",
      "Post-lunch dispatch. Try not to fight it",
      "Back at it, happy {Day}",
      'Fed and rolling'
    ],
    // ── Afternoon push (2pm) ───────────────────────────────────────
    h14: [
      "The afternoon dip. Push or pull over",
      "Somebody's home from work hoping you can stay",
      "Mid-afternoon. The phone gets specific",
      'Trade slows down on purpose around two',
      "Afternoon work is patience work",
      "Most calls now are real ones",
      "Good afternoon, and happy {Day}",
      'Trucks back in motion'
    ],
    // ── Second wind (3pm) ──────────────────────────────────────────
    h15: [
      'Kids getting off school buses while you finish a job',
      'Afternoon light makes the work look easier than it is',
      "Last full-energy hour of {Day}",
      "Coffee three is a confession",
      'The afternoon is fully open',
      "Three o'clock, find your second wind",
      'Home stretch in sight',
      'Hope {Day} is treating you right'
    ],
    // ── Late afternoon (4pm) ───────────────────────────────────────
    h16: [
      "Most of {Day} is paid for. The rest is wrap-up",
      "The light is starting to lengthen",
      "Late calls are mostly small ones. Mostly",
      "Heading back to the yard soon",
      'Wrapping invoices, wrapping the day',
      "Late afternoon, almost done",
      "{Day} winding down"
    ],
    // ── Clock-out hour (5pm) ───────────────────────────────────────
    h17: [
      "Whatever {Day} was, it's behind you now",
      "End of shift. The dashboard doesn't catch what you actually did today",
      "Trucks heading home. Roads filling up",
      'Tools back in the truck',
      "Five o'clock. {Day}'s closing",
      "Quitting time. Hat off, head home",
      "Hope {Day} treated you right"
    ],
    // ── Evening, books-time (6pm) ──────────────────────────────────
    h18: [
      'Evening. Trucks parked. The work waits till tomorrow',
      "Eight houses tonight have working plumbing because of {Day}",
      "Hard work behind you. Whatever's next, enjoy it",
      "The trade rests when it can",
      "The dashboard goes quiet around now",
      "Good evening, and happy {Day}",
      'Closing out {Day}',
      "Trucks parked, {Day}'s in the books"
    ],
    // ── Late check-ins (7pm) ───────────────────────────────────────
    h19: [
      "Woah, you're checking this late?",
      'Past business hours, huh?',
      "Hope dinner's calling",
      'Evening, still here?',
      "Hope you're heading home soon"
    ],
    h20: [
      "Hope you're winding down",
      "Hope dinner's done",
      'Books still here, no rush',
      'Easy night ahead?',
      "Books quiet, you should be too"
    ],
    h21: [
      "Hope tomorrow's ticket is a good one",
      'Save some work for tomorrow',
      'Books will keep till morning',
      "Tomorrow's customers don't know you yet",
      'Couch time'
    ],
    h22: [
      'Pretty late to be checking the books',
      "Nothing here can't wait till morning",
      'Books look better with fresh eyes',
      "Get the rest before tomorrow's first call"
    ],
    h23: [
      'Almost tomorrow',
      "Drains don't sleep, but you should",
      'Last call, get some rest',
      "Don't audit yourself at eleven"
    ],
    h00: [
      'Past midnight, go get some rest',
      'Tomorrow is a workday too',
      'The KPIs will still be here in the morning',
      "Sunwave can wait. You can't"
    ],
    h01: [
      "The leaderboard isn't going anywhere",
      'Still up?',
      'The dashboard can wait',
      'Sleep is also a KPI',
      "Whatever it is, morning's better"
    ],
    h02: [
      'Up real late on a {Day}',
      'Even Sunwave needs sleep',
      'Two a.m. Are the books really worth this?'
    ],
    h03: [
      'Are you okay?',
      'Either up late or up very early. Either way, hi',
      "Whatever you're chasing, it can wait",
      'Three a.m. is for sleeping or for plumbing emergencies'
    ],
    h04: [
      "Early start? Or didn't sleep?",
      "Coffee's on you this morning",
      'First one in',
      'Whatever brought you here, hi'
    ]
  };

  // ── Day-of-week bonus lines ─────────────────────────────────────
  // Fire only on their matching weekday — concatenated onto the
  // hourly pool so they show up periodically without crowding the
  // hourly voice. Observational rather than cheerleading; if a line
  // didn't have a point of view, it got cut.
  var DAY_LINES = {
    monday: [
      "Monday. Whatever the weekend was, it's behind you",
      "First Monday of one of the fifty-two",
      "Monday is mostly waking up",
      "The hardest part of Monday is starting"
    ],
    tuesday: [
      "Tuesday. Most underrated day of the week",
      "Tuesday is when actual work happens",
      "Quietly, Tuesdays are the best ones"
    ],
    wednesday: [
      "Wednesday. Halfway home",
      "Hump day. You know what it is",
      "Wednesday: the spine of the week",
      "Two days down, two to go"
    ],
    thursday: [
      "Friday's in walking distance",
      'Almost Friday. Try not to count down',
      "Thursday's the underrated push"
    ],
    friday: [
      "Friday. The week's tail end",
      "Last calls of the week. Hopefully easy ones",
      'Friday at Sunwave. Weekend in sight',
      'Send the week off without dragging it',
      'Whatever the week was, finish it well'
    ],
    saturday: [
      "Saturday call. Someone's grateful you came",
      "Weekend roads are quieter, at least",
      'Saturday work makes the rest of the week make sense',
      "On the dashboard on a Saturday. Hope it's the good kind of busy"
    ],
    sunday: [
      "Sunday on the dashboard. Hope it's by choice",
      "Sunday quiet. Most of the world is off",
      "Sunday: the only day plumbing waits"
    ]
  };

  // Pick rotates by (day-of-week + week-of-epoch). The week shift
  // is what lets pools larger than 7 actually surface every entry —
  // without it, `d % pool.length` would only hit indices 0-6 forever
  // and every additional phrase past index 6 would be dead code.
  // Stable for a full 7-day window (weekOfEpoch is constant within a
  // week), then advances by 1 each Thursday at midnight UTC, which
  // works out to roughly Wednesday evening local time — gentle enough
  // that no one notices a "rotation day."
  var weekOfEpoch = Math.floor(now.getTime() / (7 * 24 * 60 * 60 * 1000));
  function pick(pool) { return pool[(d + weekOfEpoch) % pool.length]; }

  // Hourly pool + (if any) day-of-week bonus, picked from the
  // combined list so day-specific lines get airtime on their day.
  var key = 'h' + (h < 10 ? '0' + h : '' + h);
  var base = POOLS[key] || POOLS.h12;
  var bonus = DAY_LINES[dayName.toLowerCase()] || [];
  var raw = pick(base.concat(bonus));

  var headline = raw.replace(/\{Day\}/g, dayName);
  var subline  = dayName + ' · ' + MONS[now.getMonth()] + ' ' + now.getDate();

  headlineEl.textContent = headline;
  sublineEl.textContent  = subline;
}

// init() is called from index.html after all script files have loaded
function init() {
  var tab = window.location.hash.replace('#', '') || DEFAULT_TAB;
  activateTab(tab); // indicator snaps on first paint (no stale position to animate from)
  // Greeting populates immediately on first paint; re-renders every
  // minute so a tab left open across an hour boundary updates without
  // requiring a manual refresh.
  updateGreeting();
  setInterval(updateGreeting, 60 * 1000);
  // One-shot staggered entrance on first paint. Remove the class once
  // all animations complete so subsequent renders (filter changes, tab
  // switches) don't retrigger the fade-in.
  document.body.classList.add('anim-entrance');
  setTimeout(function() { document.body.classList.remove('anim-entrance'); }, 1200);
  fetchData();
  // Auto-refresh every 10 minutes. Halved from the original 5-min cadence
  // because the server now persists its cache to disk and serves stale
  // data instantly while revalidating in the background — so the only
  // reason to poll at all is to surface QBO/HCP changes that landed in
  // the last few minutes. 10 min is plenty for a finance dashboard
  // whose underlying data updates daily-ish, and it halves steady-state
  // load on the upstream APIs.
  setInterval(fetchData, 10 * 60 * 1000);
}
