/* ─────────────────────────────────────────────────────────────────
   custom-range.js — Shared two-month calendar overlay used by both
   the admin KPI page and the technician dashboard.

   Public API: window.openCustomRangePicker(seedStart, seedEnd, onApply)
     • seedStart / seedEnd: 'YYYY-MM-DD' strings (optional)
     • onApply(start, end): called when admin clicks Apply

   Pairs with custom-range.css (linked separately on each page) and
   server-side support for range="custom:YYYY-MM-DD:YYYY-MM-DD".
   ───────────────────────────────────────────────────────────────── */
(function () {
  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  // Local-date YYYY-MM-DD — avoids the off-by-one bug you get from
  // .toISOString() when the user's clock is west of UTC.
  function ymdLocal(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }
  window.ymdLocal = window.ymdLocal || ymdLocal;

  function parseYmd(s) {
    if (!s || typeof s !== 'string') return null;
    var d = new Date(s + 'T00:00:00');
    return isNaN(d) ? null : d;
  }
  function fmtDay(s) {
    var d = parseYmd(s);
    if (!d) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  function diffDays(a, b) {
    var A = parseYmd(a), B = parseYmd(b);
    if (!A || !B) return 0;
    return Math.round((B - A) / 86400000) + 1;
  }

  function openCustomRangePicker(seedStart, seedEnd, onApply) {
    // Tear down any previous instance — happens if the user opens
    // the picker twice without applying.
    var existing = document.querySelectorAll('.custom-range-backdrop');
    for (var i = 0; i < existing.length; i++) existing[i].remove();

    var backdrop = document.createElement('div');
    backdrop.className = 'custom-range-backdrop';
    var panel = document.createElement('div');
    panel.className = 'custom-range-panel';
    backdrop.appendChild(panel);

    var startStr = seedStart || '';
    var endStr = seedEnd || '';
    var leftAnchor = (function () {
      var d = startStr ? parseYmd(startStr) : new Date();
      if (!d) d = new Date();
      return new Date(d.getFullYear(), d.getMonth(), 1);
    })();

    function render() {
      var rightAnchor = new Date(leftAnchor.getFullYear(), leftAnchor.getMonth() + 1, 1);
      var dayCount = diffDays(startStr, endStr);
      panel.innerHTML =
        '<header class="cr-head">' +
          '<div class="cr-head-titles">' +
            '<span class="cr-head-eyebrow">Pick a range</span>' +
            '<span class="cr-head-summary">' +
              '<strong>' + escHtml(fmtDay(startStr)) + '</strong>' +
              '<span class="cr-arrow" aria-hidden="true">→</span>' +
              '<strong>' + escHtml(fmtDay(endStr)) + '</strong>' +
              (dayCount > 0
                ? ' <span class="cr-days">· ' + dayCount + ' day' + (dayCount === 1 ? '' : 's') + '</span>'
                : '') +
            '</span>' +
          '</div>' +
          '<button type="button" class="cr-close" aria-label="Close" data-cr-action="cancel">✕</button>' +
        '</header>' +
        '<div class="cr-presets">' +
          '<button type="button" class="cr-preset" data-cr-preset="last7">Last 7 days</button>' +
          '<button type="button" class="cr-preset" data-cr-preset="last30">Last 30 days</button>' +
          '<button type="button" class="cr-preset" data-cr-preset="thisMonth">This month</button>' +
          '<button type="button" class="cr-preset" data-cr-preset="lastMonth">Last month</button>' +
          '<button type="button" class="cr-preset" data-cr-preset="ytd">Year to date</button>' +
        '</div>' +
        '<div class="cr-months">' +
          renderMonth(leftAnchor, 'left') +
          renderMonth(rightAnchor, 'right') +
        '</div>' +
        '<footer class="cr-foot">' +
          '<button type="button" class="cr-btn cr-btn--ghost" data-cr-action="cancel">Cancel</button>' +
          '<button type="button" class="cr-btn cr-btn--apply" data-cr-action="apply" ' +
            (startStr && endStr ? '' : 'disabled') + '>Apply range</button>' +
        '</footer>';
    }

    function renderMonth(anchor, side) {
      var monthLabel = anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      var firstDayWeekday = anchor.getDay();
      var daysInMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
      var cells = [];
      for (var i = 0; i < firstDayWeekday; i++) cells.push('<div class="cr-cell cr-cell--blank"></div>');
      var startD = parseYmd(startStr);
      var endD = parseYmd(endStr);
      for (var d = 1; d <= daysInMonth; d++) {
        var cellD = new Date(anchor.getFullYear(), anchor.getMonth(), d);
        var ymd = ymdLocal(cellD);
        var isStart = startD && cellD.getTime() === startD.getTime();
        var isEnd = endD && cellD.getTime() === endD.getTime();
        var inRange = startD && endD && cellD > startD && cellD < endD;
        var today = ymd === ymdLocal(new Date());
        var cls = ['cr-cell'];
        if (isStart) cls.push('is-start');
        if (isEnd) cls.push('is-end');
        if (isStart && isEnd) cls.push('is-single');
        if (inRange) cls.push('is-in-range');
        if (today) cls.push('is-today');
        cells.push(
          '<button type="button" class="' + cls.join(' ') + '" data-cr-day="' + ymd + '">' +
            '<span class="cr-cell-num">' + d + '</span>' +
          '</button>'
        );
      }
      var navPrev = side === 'left'
        ? '<button type="button" class="cr-nav cr-nav--prev" data-cr-nav="-1" aria-label="Previous month">‹</button>'
        : '<span class="cr-nav-spacer" aria-hidden="true"></span>';
      var navNext = side === 'right'
        ? '<button type="button" class="cr-nav cr-nav--next" data-cr-nav="1" aria-label="Next month">›</button>'
        : '<span class="cr-nav-spacer" aria-hidden="true"></span>';
      return (
        '<div class="cr-month cr-month--' + side + '">' +
          '<div class="cr-month-head">' +
            navPrev +
            '<span class="cr-month-title">' + escHtml(monthLabel) + '</span>' +
            navNext +
          '</div>' +
          '<div class="cr-dow"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span></div>' +
          '<div class="cr-grid">' + cells.join('') + '</div>' +
        '</div>'
      );
    }

    function applyPreset(name) {
      var today = new Date();
      var todayStr = ymdLocal(today);
      if (name === 'last7') {
        var a7 = new Date(today); a7.setDate(today.getDate() - 6);
        startStr = ymdLocal(a7); endStr = todayStr;
      } else if (name === 'last30') {
        var a30 = new Date(today); a30.setDate(today.getDate() - 29);
        startStr = ymdLocal(a30); endStr = todayStr;
      } else if (name === 'thisMonth') {
        var tm = new Date(today.getFullYear(), today.getMonth(), 1);
        startStr = ymdLocal(tm); endStr = todayStr;
      } else if (name === 'lastMonth') {
        var lmA = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        var lmB = new Date(today.getFullYear(), today.getMonth(), 0);
        startStr = ymdLocal(lmA); endStr = ymdLocal(lmB);
      } else if (name === 'ytd') {
        var ya = new Date(today.getFullYear(), 0, 1);
        startStr = ymdLocal(ya); endStr = todayStr;
      }
      var sd = parseYmd(startStr);
      if (sd) leftAnchor.setFullYear(sd.getFullYear(), sd.getMonth(), 1);
      render();
    }

    function pickDay(ymd) {
      if (!startStr || (startStr && endStr)) {
        startStr = ymd;
        endStr = '';
      } else {
        var start = parseYmd(startStr);
        var cand = parseYmd(ymd);
        if (cand < start) {
          endStr = startStr;
          startStr = ymd;
        } else {
          endStr = ymd;
        }
      }
      render();
    }

    function dismiss() {
      backdrop.removeEventListener('click', onBackdropClick);
      document.removeEventListener('keydown', onKey);
      backdrop.classList.add('is-closing');
      setTimeout(function () { backdrop.remove(); }, 160);
    }
    function onBackdropClick(e) { if (e.target === backdrop) dismiss(); }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); dismiss(); }
    }

    panel.addEventListener('click', function (e) {
      e.stopPropagation();
      var navEl = e.target.closest('[data-cr-nav]');
      if (navEl) {
        var dir = Number(navEl.dataset.crNav) || 0;
        leftAnchor.setMonth(leftAnchor.getMonth() + dir);
        render();
        return;
      }
      var dayEl = e.target.closest('[data-cr-day]');
      if (dayEl) { pickDay(dayEl.dataset.crDay); return; }
      var presetEl = e.target.closest('[data-cr-preset]');
      if (presetEl) { applyPreset(presetEl.dataset.crPreset); return; }
      var actEl = e.target.closest('[data-cr-action]');
      if (actEl) {
        var a = actEl.dataset.crAction;
        if (a === 'cancel') { dismiss(); return; }
        if (a === 'apply') {
          if (!startStr || !endStr) return;
          dismiss();
          onApply(startStr, endStr);
          return;
        }
      }
    });

    backdrop.addEventListener('click', onBackdropClick);
    document.addEventListener('keydown', onKey);

    document.body.appendChild(backdrop);
    render();
    requestAnimationFrame(function () { backdrop.classList.add('is-open'); });
  }

  window.openCustomRangePicker = openCustomRangePicker;
})();
