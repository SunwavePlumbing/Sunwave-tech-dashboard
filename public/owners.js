// ── Location Owners / Financial Tab ────────────────────────────
var ownersData = null;
var finMode        = 'dollar';            // 'dollar' | 'pct'
var finMonth       = null;               // YYYY-MM currently selected
var finGranularity = 'month';            // 'month' | 'quarter'
var finQuarter     = null;               // 'YYYY-Q#' e.g. '2026-Q1'
var finCompare     = 'prior_year_month'; // prior_month | prior_year_month | prior_year_avg | none
var pnlCompareMonth = null;              // month key shown in the comparison column of the Full Picture grid
var ownersBalance = null;
var donutChartInst = null;
var trendChartInst = null;
var cfBarChartInst = null;
var trendActive = 'om'; // single-select key-ratio trend line


// SVG chevron — used in all clickable bar segments. CSS rotates it when open.
var MF_CHEV = '<svg class="mf-op-chev" viewBox="0 0 12 8" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 1.5l5 5 5-5"/></svg>';

// Toggle expandable detail panel; triggers zoom-bar + stagger animations on open
function mfToggle(panelId, btn) {
  var panel = document.getElementById(panelId);
  if (!panel) return;
  var nowOpen = panel.hidden; // true = was hidden, about to open
  panel.hidden = !nowOpen;
  // Find chevron: inside the button, or in a sibling .mf-cogs-chev-wrap (COGS bar case)
  var chev = btn && btn.querySelector('.mf-op-chev');
  if (!chev && btn) {
    var wrap = btn.closest('.mf-cogs-bar-wrap');
    if (wrap) chev = wrap.querySelector('.mf-cogs-chev-wrap .mf-op-chev');
  }
  if (chev) chev.classList.toggle('mf-op-chev--open', nowOpen);
  var anim = panel.querySelector('.mf-zoom-bar-anim');
  if (nowOpen) {
    // Opening — reset then animate bar + trigger stagger
    panel.classList.remove('is-open');
    if (anim) anim.classList.remove('mf-zoom-expanded');
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        if (anim) anim.classList.add('mf-zoom-expanded');
        panel.classList.add('is-open');
      });
    });
  } else {
    // Closing
    panel.classList.remove('is-open');
    if (anim) anim.classList.remove('mf-zoom-expanded');
  }
}

// Special toggle for GP section (also toggles the header section)
function mfToggleGp(btn) {
  mfToggle('mfGpDetail', btn);
  var section = document.getElementById('mfGpSection');
  if (section) section.hidden = !section.hidden;
}

// Special toggle for NOI section (also toggles the gap message)
function mfToggleNoi(btn) {
  mfToggle('mfNoiDetail', btn);
  var gap = document.getElementById('mfNoiGap');
  if (gap) gap.hidden = !gap.hidden;
}

// Highlight a zoom item across both segment bar and legend row (by data-zid)
function mfZoomHL(zid, on) {
  var els = document.querySelectorAll('[data-zid="' + zid + '"]');
  for (var i = 0; i < els.length; i++) {
    els[i].classList.toggle('mf-zoom-hl', on);
  }
}

// Persistent click-select: highlights a row+segment pair and toggles it off on re-tap.
// Clears other selections within the same panel (same zid prefix).
function mfZoomSel(zid) {
  var prefix = zid.replace(/-\d+$/, '');
  var wasSelected = !!document.querySelector('[data-zid="' + zid + '"].mf-zoom-sel');
  // Clear existing selections in the same panel
  var cur = document.querySelectorAll('.mf-zoom-sel');
  for (var i = 0; i < cur.length; i++) {
    if ((cur[i].getAttribute('data-zid') || '').replace(/-\d+$/, '') === prefix) {
      cur[i].classList.remove('mf-zoom-sel');
    }
  }
  // Re-select if it wasn't already selected (toggle off on second tap)
  if (!wasSelected) {
    var els = document.querySelectorAll('[data-zid="' + zid + '"]');
    for (var i = 0; i < els.length; i++) {
      els[i].classList.add('mf-zoom-sel');
    }
  }
}

// Hex color → rgba(r,g,b,a) string — used by mfZoomDetail and GP panel
function hexAlpha(hex, a) {
  var rv = parseInt(hex.slice(1,3),16), gv = parseInt(hex.slice(3,5),16), bv = parseInt(hex.slice(5,7),16);
  return 'rgba(' + rv + ',' + gv + ',' + bv + ',' + a + ')';
}

// Build a zoom-in breakdown panel.
function mfZoomDetail(id, items, segStart, segEnd, palette, segColor, segLabel) {
  var pal   = palette  || ['#FF6B35','#E5484D','#f59e0b','#64748b','#14b8a6','#8b5cf6','#FF9500','#3b82f6','#06b6d4','#a855f7','#22c55e','#ec4899','#9ca3af','#6366f1','#fbbf24'];
  var color = segColor || '#888';
  var label = segLabel || '';
  var visible = items.filter(function(r) { return r.val > 0; });
  var total   = visible.reduce(function(s, r) { return s + r.val; }, 0);
  if (!visible.length || !total) return '<div id="' + id + '" hidden></div>';

  var s  = Math.max(0,   segStart).toFixed(1);
  var e  = Math.min(100, segEnd).toFixed(1);
  var sw = (parseFloat(e) - parseFloat(s)).toFixed(1);

  var topCol  = hexAlpha(color, 0.9);  // solid top bar (source segment marker)
  var gradId  = id + '-g';             // unique gradient id per panel

  // Segments with hover handlers + inline % label (hidden by overflow when too narrow)
  var segs = visible.map(function(r, i) {
    var zid    = id + '-' + i;
    var rawPct = r.val / total * 100;
    // Render % label for all but tiny slivers — overflow:hidden + min-width hides it when too narrow
    var pctLabel = rawPct >= 3 ? '<span class="mf-zoom-seg-pct">' + rawPct.toFixed(0) + '%</span>' : '';
    return '<div class="mf-zoom-seg" data-zid="' + zid + '"' +
           ' style="flex:' + r.val.toFixed(0) + ';background:' + pal[i % pal.length] + '"' +
           ' onmouseenter="mfZoomHL(\'' + zid + '\',true)"' +
           ' onmouseleave="mfZoomHL(\'' + zid + '\',false)"' +
           ' onclick="mfZoomSel(\'' + zid + '\')"' +
           ' title="' + esc(r.label) + '">' +
           pctLabel +
           '</div>';
  }).join('');

  // Legend rows — full-row color tint + left accent stripe; click to cross-highlight or drill down
  var legend = visible.map(function(r, i) {
    var zid      = id + '-' + i;
    var rowColor = pal[i % pal.length];
    var rowBg    = hexAlpha(rowColor, 0.09);
    var pct      = (r.val / total * 100).toFixed(1);
    // If the item has a QB account key AND children data exists, make the row drillable
    var hasDrill = !!(r.acctKey && ownersData && ownersData.children && ownersData.children[r.acctKey]);
    var clickFn  = hasDrill
      ? 'mfDrillDown(\'' + esc(r.label) + '\',\'' + r.acctKey + '\')'
      : 'mfZoomSel(\'' + zid + '\')';
    return '<div class="mf-zoom-leg-row' + (hasDrill ? ' mf-zoom-drillable' : '') + '" data-zid="' + zid + '"' +
      ' style="--i:' + i + ';background:' + rowBg + ';border-left:3px solid ' + rowColor + '"' +
      ' onmouseenter="mfZoomHL(\'' + zid + '\',true)"' +
      ' onmouseleave="mfZoomHL(\'' + zid + '\',false)"' +
      ' onclick="' + clickFn + '">' +
      '<span class="mf-zoom-leg-name">' + esc(r.label) + '</span>' +
      '<span class="mf-zoom-leg-pct">' + pct + '%</span>' +
      '<span class="mf-zoom-leg-val">' + fmtDollar(r.val) + '</span>' +
      (hasDrill ? '<span class="mf-drill-ind" title="See line items">›</span>' : '') +
    '</div>';
  }).join('');

  return (
    '<div class="mf-zoom-detail" id="' + id + '" hidden>' +
      // Connector: gradient color block, no lines — widens from segment to full
      '<div class="mf-zoom-connector-wrap">' +
        '<svg class="mf-zoom-trap" viewBox="0 0 100 64" preserveAspectRatio="none" width="100%" height="64">' +
          '<defs>' +
            '<linearGradient id="' + gradId + '" x1="0" y1="0" x2="0" y2="1">' +
              '<stop offset="0%" stop-color="' + color + '" stop-opacity="0.45"/>' +
              '<stop offset="100%" stop-color="' + color + '" stop-opacity="0.12"/>' +
            '</linearGradient>' +
          '</defs>' +
          // Solid marker bar = the source segment position
          '<rect x="' + s + '" y="0" width="' + sw + '" height="5" fill="' + topCol + '"/>' +
          // Gradient fill trapezoid — no border lines
          '<polygon points="' + s + ',5 ' + e + ',5 100,64 0,64" fill="url(#' + gradId + ')"/>' +
        '</svg>' +
        '<div class="mf-zoom-conn-label" style="color:' + color + '">' +
          (label ? label + ' breakdown \u2193' : 'breakdown \u2193') +
        '</div>' +
      '</div>' +
      // Bar: starts at segment width, expands to full on open
      '<div class="mf-zoom-bar-anim" style="--z-start:' + sw + '%">' +
        '<div class="mf-zoom-bar">' + segs + '</div>' +
      '</div>' +
      '<div class="mf-zoom-legend">' + legend + '</div>' +
    '</div>'
  );
}


// Full month name helper (used by header title)
function fmtMkFull(mk) {
  if (!mk) return '';
  var p = mk.split('-');
  var full = ['January','February','March','April','May','June','July','August','September','October','November','December'][parseInt(p[1])-1] || '';
  return full + ' ' + p[0];
}

// Month picker open/close
function toggleMonthPicker() {
  var picker = document.getElementById('finMonthPicker');
  var hdr    = document.getElementById('finMonthHeader');
  var isOpen = !picker.hidden;
  picker.hidden = isOpen;
  hdr.classList.toggle('is-open', !isOpen);
}
function closMonthPicker() {
  document.getElementById('finMonthPicker').hidden = true;
  document.getElementById('finMonthHeader').classList.remove('is-open');
}

// Select a month from the custom list
function pickFinMonth(mk) {
  finMonth = mk;
  closMonthPicker();
  if (ownersData && ownersData.connected) renderOwners();
}

function setFinMode(m) {
  finMode = m;
  document.getElementById('finModeDollar').classList.toggle('active', m === 'dollar');
  document.getElementById('finModePct').classList.toggle('active', m === 'pct');
  if (ownersData && ownersData.connected) renderOwners();
}

function setFinMonth(mk) {
  finMonth = mk;
  if (ownersData && ownersData.connected) renderOwners();
}

function setFinCompare(v) {
  finCompare = v;
  if (ownersData && ownersData.connected) renderOwners();
}

// Close picker when clicking outside
document.addEventListener('click', function(e) {
  var hdr    = document.getElementById('finMonthHeader');
  var picker = document.getElementById('finMonthPicker');
  if (!picker || picker.hidden) return;
  if (!hdr.contains(e.target) && !picker.contains(e.target)) {
    closMonthPicker();
  }
});

async function fetchOwnersData(force) {
  if (ownersData && !force) return;
  document.getElementById('finCards').innerHTML =
    '<div style="text-align:center;padding:3rem;color:#aaa;font-size:14px;grid-column:1/-1">Loading financial data\u2026</div>';
  document.getElementById('finPnlCard').style.display = 'none';
  document.getElementById('finRow2').style.display = 'none';
  document.getElementById('finTrendCard').style.display = 'none';
  document.getElementById('finCashFlowCard').style.display = 'none';
  try {
    var [finResp, balResp] = await Promise.all([
      fetch('/api/owners-financial').then(function(r){return r.json();}).catch(function(){return{connected:false,reason:'error'};}),
      fetch('/api/qbo-balance').then(function(r){return r.json();}).catch(function(){return{connected:false};})
    ]);
    ownersData = finResp;
    ownersBalance = balResp;
  } catch(e) {
    ownersData = { connected: false, reason: 'error' };
  }
  renderOwners();
}

function acct(name) {
  // Exact-match lookup against QBO account labels.
  if (!ownersData || !ownersData.accounts) return [];
  var months = ownersData.months || [];
  var a = ownersData.accounts[name];
  if (!a) return months.map(function() { return 0; });
  return months.map(function(mk) { return a[mk] || 0; });
}

function acctSum(names) {
  // Sum multiple accounts month-by-month
  if (!ownersData) return [];
  var out = (ownersData.months || []).map(function() { return 0; });
  names.forEach(function(n) {
    acct(n).forEach(function(v, i) { out[i] += v; });
  });
  return out;
}

function calcDiff(arrA, arrB) {
  return arrA.map(function(v, i) { return v - (arrB[i] || 0); });
}

function acctTotal(name) {
  return acct(name).reduce(function(s,v){ return s+v; }, 0);
}

function sumArr(arr) {
  return (arr || []).reduce(function(s,v){ return s + (v||0); }, 0);
}

function last(arr) { return arr.length ? arr[arr.length - 1] : 0; }

function fmtDollar(v) {
  var abs = Math.abs(Math.round(v));
  var s = abs >= 1000000
    ? '$' + (abs/1000000).toFixed(1) + 'M'
    : abs >= 1000
    ? '$' + Math.round(abs/1000) + 'K'
    : '$' + abs;
  return v < 0 ? '-' + s : s;
}

function fmtPct(v) { return (v >= 0 ? '' : '-') + Math.abs(v).toFixed(1) + '%'; }

function colorClass(metric, val) {
  var t = {
    gm:    { g: 50, y: 43 },
    tl:    { g: 25, y: 30, inv: true },
    parts: { g: 25, y: 30, inv: true },
    admin: { g: 12, y: 15, inv: true },
    om:    { g: 15, y: 10 },
    mkt:   { g: 5,  y: 7,  inv: true },
    merch: { g: 2.5,y: 3.5,inv: true }
  }[metric];
  if (!t) return '';
  if (t.inv) {
    if (val <= t.g) return 'c-green';
    if (val <= t.y) return 'c-yellow';
    return 'c-red';
  } else {
    if (val >= t.g) return 'c-green';
    if (val >= t.y) return 'c-yellow';
    return 'c-red';
  }
}

function sparkSVG(values, color) {
  if (!values || values.length < 2) return '';
  var w = 80, h = 28;
  var mn = Math.min.apply(null, values), mx = Math.max.apply(null, values);
  var range = mx - mn || 1;
  var pts = values.map(function(v, i) {
    var x = Math.round(i / (values.length - 1) * w);
    var y = Math.round((1 - (v - mn) / range) * (h - 6) + 3);
    return x + ',' + y;
  }).join(' ');
  return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" style="display:block">' +
    '<polyline points="' + pts + '" fill="none" stroke="' + (color||'#FF9500') + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';
}

function fmtMk(mk) {
  if (!mk) return '';
  var p = mk.split('-');
  var mn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(p[1])-1] || '';
  return mn + ' ' + p[0];
}
function fmtMkShort(mk) {
  if (!mk) return '';
  var p = mk.split('-');
  return (['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(p[1])-1] || '') + ' ' + p[0].slice(2);
}

// ── Quarter helpers ──────────────────────────────────────────────
// '2026-03' → '2026-Q1'
function quarterKey(mk) {
  var m = parseInt(mk.split('-')[1]);
  return mk.split('-')[0] + '-Q' + Math.ceil(m / 3);
}
// '2026-Q1' → ['2026-01','2026-02','2026-03']
function quarterMonths(qk) {
  var parts = qk.split('-Q');
  var y = parts[0], q = parseInt(parts[1]);
  var start = (q - 1) * 3 + 1;
  return [start, start + 1, start + 2].map(function(m) {
    return y + '-' + String(m).padStart(2, '0');
  });
}
// '2026-Q1' → 'Q1 2026'
function fmtQk(qk) {
  if (!qk) return '';
  var parts = qk.split('-Q');
  return 'Q' + parts[1] + ' ' + parts[0];
}
// Returns sorted unique quarter keys that have at least one month in the months array
function availableQuarters(months) {
  var seen = {}, result = [];
  months.forEach(function(mk) {
    var qk = quarterKey(mk);
    if (!seen[qk]) { seen[qk] = true; result.push(qk); }
  });
  return result; // already in chronological order (months is sorted oldest-first)
}

// Switch between monthly and quarterly granularity
function setFinGranularity(g) {
  finGranularity = g;
  if (g === 'quarter') {
    // Jump to the quarter containing the currently selected month
    if (finMonth && !finQuarter) finQuarter = quarterKey(finMonth);
    else if (finMonth) finQuarter = quarterKey(finMonth);
  } else {
    // Jump to the last available month of the currently selected quarter
    if (finQuarter) {
      var months = (ownersData && ownersData.months) || [];
      var qms = quarterMonths(finQuarter);
      var last = qms.filter(function(mk) { return months.indexOf(mk) >= 0; }).pop();
      if (last) finMonth = last;
    }
  }
  if (ownersData && ownersData.connected) renderOwners();
}

// Select a quarter from the custom list
function pickFinQuarter(qk) {
  finQuarter = qk;
  closMonthPicker();
  if (ownersData && ownersData.connected) renderOwners();
}

// Sets the comparison month in the Full Picture grid and re-renders
function setPnlCompare(mk) {
  pnlCompareMonth = mk;
  if (ownersData && ownersData.connected) renderOwners();
}

function renderOwners() {
  if (!ownersData || !ownersData.connected) {
    var reason = ownersData && ownersData.reason || 'unknown';
    var isNoCreds = reason === 'not_configured';
    var banner = '<div class="fin-connect-banner">' +
      '<p>' + (isNoCreds
        ? 'QuickBooks is not connected. Connect it to see financial data.'
        : 'QuickBooks is connected but data could not load. Reason: ' + esc(reason)) + '</p>' +
      (isNoCreds ? '<a href="/connect-quickbooks" style="background:#FF9500;color:white;padding:8px 20px;border-radius:6px;font-size:13px;font-weight:600;text-decoration:none">Connect QuickBooks \u203a</a>' : '') +
      '</div>';
    document.getElementById('finCards').innerHTML = banner;
    document.getElementById('finPnlCard').style.display = 'none';
    document.getElementById('finRow2').style.display = 'none';
    document.getElementById('finTrendCard').style.display = 'none';
    document.getElementById('finCashFlowCard').style.display = 'none';
    return;
  }

  var months = ownersData.months || [];
  if (!months.length) return;

  // ── Populate period picker ──────────────────────────────────
  // Ensure valid defaults
  if (!finMonth || months.indexOf(finMonth) === -1) {
    finMonth = months[months.length - 1];
  }
  var quarters = availableQuarters(months);
  if (!finQuarter || quarters.indexOf(finQuarter) === -1) {
    finQuarter = quarters[quarters.length - 1];
  }

  // Sync tab active states
  var tabM = document.getElementById('finTabMonth');
  var tabQ = document.getElementById('finTabQuarter');
  if (tabM) tabM.classList.toggle('active', finGranularity === 'month');
  if (tabQ) tabQ.classList.toggle('active', finGranularity === 'quarter');

  // Update picker header title
  var titleEl = document.getElementById('finMonthTitle');
  if (titleEl) titleEl.textContent = finGranularity === 'quarter' ? fmtQk(finQuarter) : fmtMkFull(finMonth);

  // Rebuild list for current granularity
  var listEl = document.getElementById('finMonthList');
  if (listEl) {
    if (finGranularity === 'quarter') {
      listEl.innerHTML = quarters.slice().reverse().map(function(qk) {
        var active = qk === finQuarter ? ' active' : '';
        return '<div class="fin-month-item' + active + '" onclick="pickFinQuarter(\'' + qk + '\')">' + fmtQk(qk) + '</div>';
      }).join('');
    } else {
      listEl.innerHTML = months.slice().reverse().map(function(m) {
        var active = m === finMonth ? ' active' : '';
        return '<div class="fin-month-item' + active + '" onclick="pickFinMonth(\'' + m + '\')">' + fmtMkFull(m) + '</div>';
      }).join('');
    }
  }
  // Keep hidden native select in sync
  var sel = document.getElementById('finMonthSel');
  if (sel) sel.value = finMonth;

  // ── Key series (wired to exact QBO account labels) ──────────
  var revenue     = acct('Total Income');
  var cogs        = acct('Total Cost of goods sold'); // grand COGS
  var techLabor   = acct('Total Cost of Goods Sold - Labor');
  var parts       = acct('Cost of Goods Sold - Job Supplies');
  var subs        = acct('Subcontractors');
  var totalExp    = acct('Total Expenses');           // all OpEx
  var adminPay    = acct('Total Salaried & Admin Payroll Expense');
  var mktTotal    = acct('Total Advertising & marketing');
  var officeExp   = acct('Total Office expenses');
  var rentExp     = acct('Total Rent');
  var vehicleExp  = acct('Total Vehicle Expenses');
  var utilExp     = acct('Total Utilities');
  var travelExp   = acct('Total Travel');
  var mealsExp    = acct('Total Meals');
  var genExp      = acct('Total General Expenses');
  var taxesExp    = acct('Total Taxes paid');
  var merchExp    = acct('Total Merchant account fees');
  var benefitsExp = acct('Total Employee benefits');
  // Gross Profit & NOI aren't returned as rows — compute them.
  var gp          = revenue.map(function(r, i) { return r - (cogs[i] || 0); });
  var noi         = revenue.map(function(r, i) { return r - (cogs[i] || 0) - (totalExp[i] || 0); });
  var netInc      = noi; // No below-the-line items in this P&L

  // ── Selected period index + comparison ──────────────────────
  var curIdx = months.indexOf(finMonth);
  if (curIdx < 0) curIdx = months.length - 1;

  // Quarter mode: collect the 3 month indices for the selected quarter
  var qIdxs = [];
  if (finGranularity === 'quarter') {
    quarterMonths(finQuarter).forEach(function(mk) {
      var i = months.indexOf(mk);
      if (i >= 0) qIdxs.push(i);
    });
    // Advance curIdx to the last month of the quarter (for trend chart highlight etc.)
    if (qIdxs.length) curIdx = qIdxs[qIdxs.length - 1];
  }

  // at() — sums across the quarter in quarter mode, otherwise returns single-month value
  function at(arr) {
    if (finGranularity === 'quarter' && qIdxs.length) {
      return qIdxs.reduce(function(s, i) { return s + (arr[i] || 0); }, 0);
    }
    return arr[curIdx] || 0;
  }

  var cmpLabel  = '';
  var cmpValues = null; // function(seriesArr) -> number

  if (finGranularity === 'quarter') {
    // Compare to same quarter prior year
    var pyYear  = String(parseInt(finQuarter.split('-Q')[0]) - 1);
    var pyQk    = pyYear + '-Q' + finQuarter.split('-Q')[1];
    var pyIdxs  = [];
    quarterMonths(pyQk).forEach(function(mk) {
      var i = months.indexOf(mk); if (i >= 0) pyIdxs.push(i);
    });
    if (pyIdxs.length) {
      cmpLabel  = 'vs. ' + fmtQk(pyQk);
      cmpValues = function(arr) { return pyIdxs.reduce(function(s, i) { return s + (arr[i] || 0); }, 0); };
    }
  } else {
    var cmpIdx = -1;
    if (finCompare === 'prior_month' && curIdx > 0) {
      cmpIdx = curIdx - 1;
      cmpLabel = 'vs. ' + fmtMkShort(months[cmpIdx]);
      cmpValues = function(arr) { return arr[cmpIdx] || 0; };
    } else if (finCompare === 'prior_year_month' && curIdx >= 12) {
      cmpIdx = curIdx - 12;
      cmpLabel = 'vs. ' + fmtMkShort(months[cmpIdx]);
      cmpValues = function(arr) { return arr[cmpIdx] || 0; };
    } else if (finCompare === 'prior_year_avg' && curIdx >= 12) {
      var s = curIdx - 12, e = curIdx;
      cmpLabel = 'vs. prior-yr avg';
      cmpValues = function(arr) {
        var sum = 0, n = 0;
        for (var i = s; i < e; i++) { sum += arr[i] || 0; n++; }
        return n > 0 ? sum / n : 0;
      };
    }
  }
  var curRev = at(revenue), curGP = at(gp), curTL = at(techLabor);
  var curParts = at(parts), curNOI = at(noi);
  var gmPct    = curRev > 0 ? curGP / curRev * 100 : 0;
  var tlPct    = curRev > 0 ? curTL / curRev * 100 : 0;
  var partsPct = curRev > 0 ? curParts / curRev * 100 : 0;
  var noiPct   = curRev > 0 ? curNOI / curRev * 100 : 0;

  // % series (for trend chart)
  var gmArr    = months.map(function(_, i) { return revenue[i] > 0 ? gp[i]/revenue[i]*100 : 0; });
  var tlArr    = months.map(function(_, i) { return revenue[i] > 0 ? techLabor[i]/revenue[i]*100 : 0; });
  var partsArr = months.map(function(_, i) { return revenue[i] > 0 ? parts[i]/revenue[i]*100 : 0; });
  var noiArr   = months.map(function(_, i) { return revenue[i] > 0 ? noi[i]/revenue[i]*100 : 0; });
  var adminArr = months.map(function(_, i) { return revenue[i] > 0 ? (adminPay[i]+officeExp[i])/revenue[i]*100 : 0; });

  // ── Summary card deltas (respect compare mode) ───────────────
  function dollarCompare(curVal, arr) {
    if (!cmpValues) return '';
    var prev = cmpValues(arr);
    if (!prev) return '<div class="fin-compare-line">' + cmpLabel + ': —</div>';
    var d = curVal - prev;
    var pct = prev !== 0 ? Math.round(d / Math.abs(prev) * 100) : 0;
    var cls = d >= 0 ? 'up' : 'down';
    var arrow = d >= 0 ? '▲' : '▼';
    return '<span class="fin-card-delta ' + cls + '">' + arrow + ' ' + fmtDollar(Math.abs(d)) + ' (' + (pct>=0?'+':'') + pct + '%)</span>' +
      '<div class="fin-compare-line">' + cmpLabel + ': ' + fmtDollar(prev) + '</div>';
  }
  function pctCompare(curPct, arr) {
    // arr is the % series (already percentages). Show relative % change.
    if (!cmpValues) return '';
    var prev = cmpValues(arr);
    if (!prev) return '<div class="fin-compare-line">' + cmpLabel + ': —</div>';
    var d = curPct - prev;
    var relPct = Math.round(d / Math.abs(prev) * 100);
    var cls = d >= 0 ? 'up' : 'down';
    var arrow = d >= 0 ? '▲' : '▼';
    return '<span class="fin-card-delta ' + cls + '">' + arrow + ' ' + (relPct>=0?'+':'') + relPct + '%</span>' +
      '<div class="fin-compare-line">' + cmpLabel + ': ' + prev.toFixed(1) + '%</div>';
  }

  // ── Additional scalars for the money-flow card ──────────────
  var curCOGS  = at(cogs);
  var curOvhd  = at(totalExp);
  var cogsPct  = curRev > 0 ? curCOGS / curRev * 100 : 0;
  var ovhdPct  = curRev > 0 ? curOvhd / curRev * 100 : 0;

  // Compare-delta for the money-flow card (outputs .mf-delta classes)
  function mfDelta(curVal, arr) {
    if (!cmpValues) return '';
    var prev = cmpValues(arr);
    if (!prev) return '<div class="mf-delta"><span class="mf-cmp-lbl">' + cmpLabel + ': \u2014</span></div>';
    var d = curVal - prev;
    var pct = prev !== 0 ? Math.round(d / Math.abs(prev) * 100) : 0;
    var cls = d >= 0 ? 'up' : 'down';
    var arrow = d >= 0 ? '\u25b2' : '\u25bc';
    return '<div class="mf-delta ' + cls + '">' + arrow + ' ' + fmtDollar(Math.abs(d)) +
      ' (' + (pct >= 0 ? '+' : '') + pct + '%) <span class="mf-cmp-lbl">' + cmpLabel + '</span></div>';
  }

  // Status pill: Healthy / Near Target / Below Target
  function mfPill(metric, pct) {
    var label, cls;
    if (metric === 'gp') {
      if (pct >= 50)      { label = 'Healthy';      cls = 'pill-green'; }
      else if (pct >= 43) { label = 'Near Target';  cls = 'pill-yellow'; }
      else                { label = 'Below Target'; cls = 'pill-red'; }
    } else {
      if (pct >= 15)      { label = 'Healthy';      cls = 'pill-green'; }
      else if (pct >= 10) { label = 'Near Target';  cls = 'pill-yellow'; }
      else                { label = 'Below Target'; cls = 'pill-red'; }
    }
    return '<span class="mf-pill ' + cls + '">' + label + '</span>';
  }

  // Expandable sub-item list
  function mfSubList(id, items) {
    var rows = items.filter(function(r) { return r.val > 0; }).map(function(r) {
      return '<div class="mf-subitem">' +
        '<span class="mf-subitem-label">' + esc(r.label) + '</span>' +
        '<span class="mf-subitem-val">' + fmtDollar(r.val) + '</span>' +
        '</div>';
    }).join('');
    return '<div class="mf-sublist" id="' + id + '" hidden>' + rows + '</div>';
  }

  var cogsItems = [
    { label: 'Tech Labor',     val: at(techLabor), acctKey: 'Total Cost of Goods Sold - Labor' },
    { label: 'Parts',          val: at(parts),     acctKey: 'Cost of Goods Sold - Job Supplies' },
    { label: 'Subcontractors', val: at(subs),      acctKey: 'Subcontractors' }
  ];
  var ovhdItems = [
    { label: 'Admin Payroll',     val: at(adminPay),    acctKey: 'Total Salaried & Admin Payroll Expense' },
    { label: 'Marketing',         val: at(mktTotal),    acctKey: 'Total Advertising & marketing' },
    { label: 'Rent',              val: at(rentExp),     acctKey: 'Total Rent' },
    { label: 'Vehicles',          val: at(vehicleExp),  acctKey: 'Total Vehicle Expenses' },
    { label: 'Office',            val: at(officeExp),   acctKey: 'Total Office expenses' },
    { label: 'Utilities',         val: at(utilExp),     acctKey: 'Total Utilities' },
    { label: 'Employee Benefits', val: at(benefitsExp), acctKey: 'Total Employee benefits' },
    { label: 'Merchant Fees',     val: at(merchExp),    acctKey: 'Total Merchant account fees' },
    { label: 'Taxes',             val: at(taxesExp),    acctKey: 'Total Taxes paid' },
    { label: 'Travel',            val: at(travelExp),   acctKey: 'Total Travel' },
    { label: 'Meals',             val: at(mealsExp),    acctKey: 'Total Meals' },
    { label: 'Other',             val: at(genExp),      acctKey: 'Total General Expenses' }
  ];

  // Timestamp — rounded to minute, no seconds
  var stamp = '';
  if (ownersData.fetchedAt) {
    var d = new Date(ownersData.fetchedAt);
    d.setSeconds(0, 0);
    stamp = 'Updated ' + d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  // ── Helpers for the money-flow card ─────────────────────────
  // ── Finish-line target bar ───────────────────────────────────
  // pct       = current value (% of revenue)
  // targetPct = goal (e.g. 50 for GP, 15 for NOI)
  // maxPct    = right edge of the scale (e.g. 65 for GP, 25 for NOI)
  // Below target: fill stops short, magnetic zone tints the gap.
  // At/above target: gold marker glows, bonus zone shows the excess.
  function mfTargetBar(pct, targetPct, maxPct) {
    var scale    = maxPct || 100;
    var isAbove  = pct >= targetPct;
    var gap      = Math.abs(pct - targetPct);

    // Positions as % of track width
    var baseFillW  = Math.min(pct, targetPct) / scale * 100;
    var bonusW     = Math.max(0, pct - targetPct) / scale * 100;
    var magnetW    = isAbove ? 0 : (targetPct - pct) / scale * 100;
    var targetX    = targetPct / scale * 100;

    // Gap label
    var gapCls  = isAbove ? 'above' : (gap <= 3 ? 'near' : 'below');
    var gapIcon = isAbove ? (gap < 0.05 ? '✓ On target' : '▲') : '▼';
    var gapText = isAbove
      ? (gap < 0.05 ? 'On target' : gapIcon + ' ' + gap.toFixed(1) + ' pts above target')
      : gap.toFixed(1) + ' pts below target';

    return (
      '<div class="mf-score-wrap">' +
        '<div class="mf-score-track-inner">' +
          // Base fill: 0 → min(current, target). Flat right edge faces the target.
          '<div class="mf-score-fill" style="width:' + baseFillW.toFixed(2) + '%"></div>' +
          // Bonus zone: target → current when exceeding goal. Deeper/richer color.
          (bonusW > 0
            ? '<div class="mf-score-bonus" style="left:' + targetX.toFixed(2) + '%;width:' + bonusW.toFixed(2) + '%"></div>'
            : '') +
          // Magnetic zone: subtle tint in the gap between fill and target.
          (magnetW > 0
            ? '<div class="mf-score-magnet" style="left:' + baseFillW.toFixed(2) + '%;width:' + magnetW.toFixed(2) + '%"></div>'
            : '') +
        '</div>' +
        // Target marker — lives outside the clipped track so it can extend above/below.
        '<div class="mf-score-target' + (isAbove ? ' hit' : '') + '" style="left:' + targetX.toFixed(2) + '%">' +
          '<div class="mf-score-target-label">Target ' + targetPct + '%</div>' +
          '<div class="mf-score-target-line"></div>' +
        '</div>' +
        // Scale endpoints
        '<div class="mf-score-scale"><span>0%</span><span>' + scale + '%</span></div>' +
      '</div>' +
      // Gap / status line
      '<div class="mf-score-gap ' + gapCls + '">' + gapText + '</div>'
    );
  }

  function mfCostItem(label, val, revTotal) {
    var pct  = revTotal > 0 ? val / revTotal * 100 : 0;
    var barW = Math.min(pct / 55 * 100, 100); // 55% = full bar
    return '<div class="mf-op-item">' +
      '<span class="mf-op-item-label">' + esc(label) + '</span>' +
      '<div class="mf-op-item-bar-wrap"><div class="mf-op-item-bar" style="width:' + barW.toFixed(0) + '%"></div></div>' +
      '<span class="mf-op-item-pct">' + pct.toFixed(1) + '%</span>' +
      '<span class="mf-op-item-val">' + fmtDollar(val) + '</span>' +
    '</div>';
  }

  // ── GP expandable detail panel ──────────────────────────────
  // Hidden by default; revealed when the green bar or "Gross Profit" label is tapped.
  var gpGap     = Math.abs(gmPct - 50);
  var gpGapCls  = gmPct >= 50 ? 'above' : (gpGap <= 3 ? 'near' : 'below');
  var gpGapTxt  = gmPct >= 50
    ? '\u25b2 ' + gpGap.toFixed(1) + ' pts above target \u2014 you\'re in the zone!'
    : gpGap.toFixed(1) + ' pts below the 50% target';


  var gpDetailHtml =
    '<div id="mfGpDetail" class="mf-zoom-detail mf-gp-detail" hidden>' +
      // "We kept X%" context line
      '<div class="mf-score-pct-line mf-gp-pct-line">We kept ' + fmtPct(gmPct) + ' of every dollar \u2014 goal is 50%</div>' +
      // Reversed competition bar: COGS eating from left, GP defending the right
      '<div class="mf-gp-revbar-wrap">' +
        '<div class="mf-gp-revbar-head">Of ' + fmtDollar(curRev) + ' revenue, COGS consumed:</div>' +
        '<div class="mf-gp-revbar-outer">' +
          '<div class="mf-gp-revbar">' +
            '<div class="mf-gp-revbar-cogs" style="width:' + Math.min(cogsPct, 99).toFixed(1) + '%"></div>' +
            '<div class="mf-gp-revbar-gp">' +
              '<span class="mf-gp-revbar-txt">GP ' + fmtPct(gmPct) + '</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="mf-score-gap ' + gpGapCls + '">' + gpGapTxt + '</div>' +
      '</div>' +
    '</div>';

  var formulaHtml =
    '<div class="mf-card">' +

      // Header
      '<div class="mf-header">' +
        '<div class="mf-header-title">' + fmtMk(finMonth) + ' Financial Summary</div>' +
        (stamp ? '<div class="mf-header-stamp">' + stamp + '</div>' : '') +
      '</div>' +

      // ── Revenue ───────────────────────────────────────────────
      '<div class="mf-step">' +
        '<div class="mf-step-label">Revenue</div>' +
        '<div class="mf-step-num">' + fmtDollar(curRev) + '</div>' +
        '<div class="mf-step-desc">Total money collected from completed jobs</div>' +
        '<div class="mf-rev-bar"></div>' +
      '</div>' +

      // ── − Cost of Goods Sold ──────────────────────────────────
      '<div class="mf-op">' +
        '<div class="mf-op-label">Cost of Goods Sold</div>' +
        '<div class="mf-op-total">\u2212' + fmtDollar(curCOGS) + '<span class="mf-op-pct">' + fmtPct(cogsPct) + '</span></div>' +
        // 2-part split bar: red = COGS (clickable), pale-green = GP remainder (passive)
        '<div class="mf-split-wrap mf-split-wrap--cogs">' +
          '<div class="mf-cogs-bar-wrap">' +
            '<div class="mf-cogs-goal-lbl">Target 50%</div>' +
            '<div class="mf-split-bar">' +
              '<div class="mf-sb-cogs mf-seg-click" onclick="mfToggle(\'mfCogsDetail\',this)"' +
                  ' style="width:' + Math.max(0,Math.min(cogsPct,99)).toFixed(1) + '%">' +
                '<span class="mf-bar-label">Cost of Goods Sold</span>' +
              '</div>' +
              '<div class="mf-sb-gp mf-seg-click" onclick="mfToggleGp(this)">' +
                '<span class="mf-bar-label">Gross Profit</span>' +
                MF_CHEV +
              '</div>' +
            '</div>' +
            '<div class="mf-cogs-target-line"></div>' +
            '<div class="mf-cogs-chev-wrap">' + MF_CHEV + '</div>' +
          '</div>' +
        '</div>' +
        mfZoomDetail('mfCogsDetail', cogsItems, 0, cogsPct,
          ['#3b82f6','#8b5cf6','#f59e0b'], '#f87171', 'COGS') +
      '</div>' +

      // ── = Gross Profit ────────────────────────────────────────
      '<div class="mf-step mf-step--gp" id="mfGpSection" hidden>' +
        '<div class="mf-step-label"><span class="mf-step-eq">=</span> Gross Profit</div>' +
        '<div class="mf-step-num">' + fmtDollar(curGP) + '</div>' +
        gpDetailHtml +
      '</div>' +

      // ── − Overhead ────────────────────────────────────────────
      '<div class="mf-op">' +
        '<div class="mf-op-label">Overhead</div>' +
        '<div class="mf-op-total mf-op-total--orange">\u2212' + fmtDollar(curOvhd) + '<span class="mf-op-pct">' + fmtPct(ovhdPct) + '</span></div>' +
        // 3-part split bar: click the orange Overhead segment to expand the breakdown
        '<div class="mf-split-wrap mf-split-wrap--ovhd">' +
          '<div class="mf-split-bar">' +
            '<div class="mf-sb-prior" style="width:' + Math.max(0,Math.min(cogsPct,99)).toFixed(1) + '%">' +
              '<span class="mf-bar-label">COGS</span>' +
            '</div>' +
            '<div class="mf-sb-ovhd mf-seg-click" onclick="mfToggle(\'mfOvhdDetail\',this)"' +
                ' style="width:' + Math.max(0,Math.min(ovhdPct,100-cogsPct)).toFixed(1) + '%">' +
              '<span class="mf-bar-label">Overhead</span>' +
              MF_CHEV +
            '</div>' +
            '<div class="mf-sb-pass">' +
              '<span class="mf-bar-label" style="left:50%;transform:translate(-50%,-50%)">Profit</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        mfZoomDetail('mfOvhdDetail', ovhdItems, cogsPct, cogsPct + ovhdPct,
          ['#64748b','#14b8a6','#8b5cf6','#FF9500','#3b82f6','#06b6d4','#22c55e','#a855f7','#6366f1','#fbbf24','#ec4899','#9ca3af'],
          '#f97316', 'Overhead') +
      '</div>' +

      // ── = Operating Profit ────────────────────────────────────
      (function(){
        // Gold target line lives at (100-15)% = 85% from left edge of bar
        var targetX = (85).toFixed(1);
        var isAbove  = noiPct >= 15;
        var gap      = Math.abs(noiPct - 15);
        var gapCls   = isAbove ? 'above' : (gap <= 3 ? 'near' : 'below');
        var gapTxt   = isAbove
          ? '\u25b2 ' + gap.toFixed(1) + '% above the 15% profit goal'
          : gap.toFixed(1) + '% below the 15% profit goal';
        var periodWord = finGranularity === 'quarter' ? 'quarter' : 'month';

        // ── Delta vs prior period ──────────────────────────────
        var prevNOIPct = null;
        if (finGranularity === 'quarter' && finQuarter) {
          var pyQ = parseInt(finQuarter.split('-Q')[1]) - 1;
          if (pyQ >= 1) {
            var priorQk = finQuarter.split('-Q')[0] + '-Q' + pyQ;
            var priorIdxs = [];
            quarterMonths(priorQk).forEach(function(mk) { var i = months.indexOf(mk); if (i >= 0) priorIdxs.push(i); });
            var pRev = priorIdxs.reduce(function(s,i){return s+(revenue[i]||0);},0);
            var pNOI = priorIdxs.reduce(function(s,i){return s+(noi[i]||0);},0);
            if (pRev > 0) prevNOIPct = pNOI / pRev * 100;
          }
        } else if (curIdx > 0 && revenue[curIdx-1] > 0) {
          prevNOIPct = noi[curIdx-1] / revenue[curIdx-1] * 100;
        }
        var noiDelta = prevNOIPct !== null ? noiPct - prevNOIPct : null;
        var deltaSign = noiDelta !== null ? (noiDelta >= 0 ? '+' : '') : '';
        var deltaCls  = noiDelta !== null ? (noiDelta >= 0 ? 'c-green' : 'c-red') : '';

        // ── Gauge bar (0-25% range, gold pin at 15%) ──────────
        var gaugeMax     = 25;
        var gaugeFill    = (Math.min(Math.max(noiPct, 0), gaugeMax) / gaugeMax * 100).toFixed(1);
        var gaugeGoal    = (15 / gaugeMax * 100).toFixed(1); // 60%
        var gaugeColor   = noiPct >= 15 ? '#22c55e' : noiPct >= 10 ? '#f59e0b' : '#ef4444';
        // Position the "current" needle label — clamp so it doesn't overflow edges
        var needleLeft   = Math.min(Math.max(parseFloat(gaugeFill), 5), 92).toFixed(1);

        var gaugeHtml =
          '<div class="mf-noi-gauge">' +
            '<div class="mf-noi-gauge-track">' +
              '<div class="mf-noi-gauge-fill" style="width:' + gaugeFill + '%;background:' + gaugeColor + '"></div>' +
              '<div class="mf-noi-gauge-pin" style="left:' + gaugeGoal + '%"></div>' +
              '<div class="mf-noi-gauge-needle" style="left:' + gaugeFill + '%"></div>' +
            '</div>' +
            '<div class="mf-noi-gauge-scale">' +
              '<span>0%</span>' +
              '<span class="mf-noi-gauge-now" style="left:' + needleLeft + '%">' + fmtPct(noiPct) + '</span>' +
              '<span class="mf-noi-gauge-goal-tag" style="left:' + gaugeGoal + '%">15% goal</span>' +
              '<span>25%</span>' +
            '</div>' +
          '</div>';

        var noiDetailHtml =
          '<div id="mfNoiDetail" class="mf-zoom-detail mf-noi-detail" hidden>' +
            '<div class="mf-noi-explain">' +
              '<div class="mf-noi-explain-head">What is Profit?</div>' +
              '<div class="mf-noi-explain-body">' +
                'After paying for every job (COGS) and every bill to run the business (overhead), ' +
                'whatever\u2019s left is Profit \u2014 the real reward for owning the company. ' +
                'It\u2019s what funds savings, growth, and your own paycheck.' +
              '</div>' +
              gaugeHtml +
              '<div class="mf-noi-explain-row">' +
                '<div class="mf-noi-explain-stat">' +
                  '<div class="mf-noi-explain-stat-label">Our goal</div>' +
                  '<div class="mf-noi-explain-stat-val">15% of revenue</div>' +
                '</div>' +
                '<div class="mf-noi-explain-stat">' +
                  '<div class="mf-noi-explain-stat-label">This ' + periodWord + '</div>' +
                  '<div class="mf-noi-explain-stat-val ' + (isAbove ? 'c-green' : 'c-red') + '">' + fmtPct(noiPct) +
                    (noiDelta !== null ? '<span class="mf-noi-delta ' + deltaCls + '">' + deltaSign + noiDelta.toFixed(1) + '%</span>' : '') +
                  '</div>' +
                '</div>' +
                '<div class="mf-noi-explain-stat">' +
                  '<div class="mf-noi-explain-stat-label">Dollars earned</div>' +
                  '<div class="mf-noi-explain-stat-val">' + fmtDollar(curNOI) + '</div>' +
                '</div>' +
              '</div>' +
              '<div class="mf-noi-explain-tip">' +
                '<span class="mf-noi-tip-head">How to keep more of it:</span>' +
                ' Charge more per job, reduce parts costs, or trim overhead.' +
                ' Every extra 1% on ' + fmtDollar(curRev) + ' revenue = ' +
                '<strong>' + fmtDollar(curRev * 0.01) + ' more this ' + periodWord + '</strong>' +
                ' \u2014 or about ' + fmtDollar(curRev * 0.01 * 12) + ' over a full year.' +
              '</div>' +
            '</div>' +
          '</div>';

        return (
          '<div class="mf-step mf-step--noi">' +
            '<div class="mf-step-label">Profit</div>' +
            '<div class="mf-step-num"><span class="mf-step-eq">=&thinsp;</span>' + fmtDollar(curNOI) + '<span class="mf-op-pct">' + fmtPct(noiPct) + '</span></div>' +
            // Bar wrapper — position:relative so target line can sit on top
            '<div class="mf-noi-bar-wrap">' +
              // Gold target label above bar
              '<div class="mf-noi-goal-lbl" style="left:' + targetX + '%">Profit Goal 15%</div>' +
              // 3-segment mirror bar
              '<div class="mf-split-bar mf-noi-mirror-bar">' +
                '<div class="mf-seg-dim" style="width:' + Math.max(0, cogsPct).toFixed(1) + '%;background:#fecaca;flex-shrink:0;position:relative;">' +
                  '<span class="mf-bar-label">COGS</span>' +
                '</div>' +
                '<div class="mf-seg-dim" style="width:' + Math.max(0, ovhdPct).toFixed(1) + '%;background:#fed7aa;flex-shrink:0;position:relative;">' +
                  '<span class="mf-bar-label">Overhead</span>' +
                '</div>' +
                // Green NOI segment — clickable
                '<div class="mf-noi-profit-seg mf-seg-click" onclick="mfToggleNoi(this)" ' +
                    'style="flex:1;min-width:2px;background:#22c55e;position:relative;">' +
                  '<span class="mf-bar-label">Profit</span>' +
                  MF_CHEV +
                '</div>' +
              '</div>' +
              // Gold vertical target line
              '<div class="mf-noi-target-line" style="left:' + targetX + '%"></div>' +
            '</div>' +
            noiDetailHtml +
            // Gap line (hidden by default, shown when detail expands)
            '<div id="mfNoiGap" hidden style="margin-top:10px"><div class="mf-score-gap ' + gapCls + '">' + gapTxt + '</div></div>' +
          '</div>'
        );
      }()) +

    '</div>'; // .mf-card

  document.getElementById('finCards').innerHTML = formulaHtml;
  requestAnimationFrame(mfFixNarrowLabels);

  // ── Show structural elements ─────────────────────────────────
  var multiMonth = months.length > 1;
  document.getElementById('finPnlCard').style.display = multiMonth ? '' : 'none';
  document.getElementById('finRow2').style.display = '';
  document.getElementById('finTrendCard').style.display = multiMonth ? '' : 'none';
  var updEl = document.getElementById('finUpdated');
  if (updEl) {
    var updTxt = (finGranularity === 'quarter' ? fmtQk(finQuarter) : fmtMk(finMonth)) + '  \u00b7  ';
    if (ownersData.fetchedAt) updTxt += 'as of ' + new Date(ownersData.fetchedAt).toLocaleTimeString();
    updEl.textContent = updTxt;
  }

  // ── Monthly P&L grid ─────────────────────────────────────────
  // ── Monthly / Quarterly P&L grid ─────────────────────────────
  var isPhone = window.innerWidth < 700;
  var gridMonths, gridIndices;
  if (finGranularity === 'quarter') {
    // Quarter mode: always show the 3 months of the selected quarter
    gridMonths  = quarterMonths(finQuarter).filter(function(mk) { return months.indexOf(mk) >= 0; });
    gridIndices = gridMonths.map(function(mk) { return months.indexOf(mk); });
  } else {
    // Month mode: last 12 months on desktop, last 6 on phone, ending at curIdx
    var gridEnd   = curIdx;
    var gridStart = Math.max(0, gridEnd - (isPhone ? 5 : 11));
    gridMonths  = months.slice(gridStart, gridEnd + 1);
    gridIndices = gridMonths.map(function(_, gi) { return gridStart + gi; });
  }

  var otherOpex = totalExp.map(function(t, i) {
    return t - (adminPay[i]||0) - (mktTotal[i]||0) - (officeExp[i]||0) - (rentExp[i]||0)
      - (vehicleExp[i]||0) - (utilExp[i]||0) - (travelExp[i]||0) - (mealsExp[i]||0)
      - (genExp[i]||0) - (taxesExp[i]||0) - (merchExp[i]||0) - (benefitsExp[i]||0);
  });
  // good:'up' = more of this is better (revenue/profit); 'down' = less is better (expenses)
  var pnlRows = [
    { label: 'Revenue',              arr: revenue,    cls: 'subtotal', good: 'up'   },
    { label: 'Cost of Goods Sold',   arr: cogs,       cls: '',         good: 'down' },
    { label: 'Tech Labor',           arr: techLabor,  cls: 'indent',   good: 'down' },
    { label: 'Parts',                arr: parts,      cls: 'indent',   good: 'down' },
    { label: 'Subcontractors',       arr: subs,       cls: 'indent',   good: 'down' },
    { label: 'Gross Profit',         arr: gp,         cls: 'subtotal', good: 'up'   },
    { label: 'Operating Expenses',   arr: totalExp,   cls: '',         good: 'down' },
    { label: 'Admin Payroll',        arr: adminPay,   cls: 'indent',   good: 'down' },
    { label: 'Marketing',            arr: mktTotal,   cls: 'indent',   good: 'down' },
    { label: 'Rent',                 arr: rentExp,    cls: 'indent',   good: 'down' },
    { label: 'Vehicle',              arr: vehicleExp, cls: 'indent',   good: 'down' },
    { label: 'Office',               arr: officeExp,  cls: 'indent',   good: 'down' },
    { label: 'Utilities',            arr: utilExp,    cls: 'indent',   good: 'down' },
    { label: 'Merchant Fees',        arr: merchExp,   cls: 'indent',   good: 'down' },
    { label: 'Employee Benefits',    arr: benefitsExp,cls: 'indent',   good: 'down' },
    { label: 'Taxes',                arr: taxesExp,   cls: 'indent',   good: 'down' },
    { label: 'Travel',               arr: travelExp,  cls: 'indent',   good: 'down' },
    { label: 'Meals',                arr: mealsExp,   cls: 'indent',   good: 'down' },
    { label: 'Other',                arr: otherOpex,  cls: 'indent',   good: 'down' },
    { label: 'Net Operating Income', arr: noi,        cls: 'total',    good: 'up'   }
  ];

  // Show/hide the $/% toggle — only relevant in quarter mode
  var toggleEl = document.querySelector('.fin-pnl-head .fin-toggle');
  if (toggleEl) toggleEl.style.display = finGranularity === 'quarter' ? '' : 'none';

  if (finGranularity === 'quarter') {
    // ── Quarter mode: multi-column grid (one col per month + Total + % Rev) ──
    var revGridTotal = 0;
    gridIndices.forEach(function(idx) { revGridTotal += revenue[idx] || 0; });
    var pnlHead = '<tr><th>Line item</th>' +
      gridMonths.map(function(m) { return '<th>' + fmtMkShort(m) + '</th>'; }).join('') +
      '<th>Total</th><th>% Rev</th></tr>';
    var pnlBody = pnlRows.map(function(row) {
      var cells = gridIndices.map(function(idx) {
        var v = row.arr[idx] || 0;
        var neg = v < 0 ? ' neg' : '';
        return '<td class="highlight' + neg + '">' + (finMode==='pct' && revenue[idx]>0 ? (v/revenue[idx]*100).toFixed(1)+'%' : fmtDollar(v)) + '</td>';
      }).join('');
      var rowTotal = 0;
      gridIndices.forEach(function(idx) { rowTotal += row.arr[idx] || 0; });
      var pctRev = revGridTotal > 0 ? (rowTotal / revGridTotal * 100).toFixed(1) + '%' : '—';
      return '<tr class="' + row.cls + '"><td>' + esc(row.label) + '</td>' + cells +
        '<td>' + fmtDollar(rowTotal) + '</td>' +
        '<td>' + pctRev + '</td></tr>';
    }).join('');
    document.getElementById('finPnlGrid').innerHTML =
      '<table class="pnl-grid"><thead>' + pnlHead + '</thead><tbody>' + pnlBody + '</tbody></table>';
    document.getElementById('finPnlSubtitle').textContent = fmtQk(finQuarter);

  } else {
    // ── Month mode: focused 2-column comparison layout ───────────
    var priIdx2 = curIdx;
    var priRev  = revenue[priIdx2] || 0;

    // Default compare to prior month when not set / same as selected / not in data
    if (!pnlCompareMonth || pnlCompareMonth === finMonth || months.indexOf(pnlCompareMonth) < 0) {
      var defPi = priIdx2 - 1;
      pnlCompareMonth = defPi >= 0 ? months[defPi] : null;
    }
    var cmpIdx2 = pnlCompareMonth ? months.indexOf(pnlCompareMonth) : -1;
    var cmpRev  = cmpIdx2 >= 0 ? (revenue[cmpIdx2] || 0) : 0;

    // Data cell: stacked $ amount + % of revenue
    function pCell2(arr, idx, rev) {
      if (idx < 0) return '<td class="pnl2-cell pnl2-empty">—</td>';
      var v   = arr[idx] || 0;
      var pct = rev > 0 ? (v / rev * 100).toFixed(1) + '%' : '—';
      var cls = v < 0 ? ' pnl2-neg' : '';
      return '<td class="pnl2-cell' + cls + '"><div class="pnl2-dollar">' + fmtDollar(v) + '</div>' +
             '<div class="pnl2-pct-sub">' + pct + '</div></td>';
    }

    // Delta cell: change from compare → primary, direction-aware green/red
    function dCell2(arr, pi, ci, good) {
      if (ci < 0) return '<td class="pnl2-delta"><span class="pnl2-pill">—</span></td>';
      var pv   = arr[pi] || 0;
      var cv   = arr[ci] || 0;
      var diff = pv - cv;
      if (diff === 0) return '<td class="pnl2-delta"><span class="pnl2-pill">—</span></td>';
      var sign   = diff > 0 ? '+' : '';
      var isGood = good === 'up' ? diff > 0 : diff < 0;
      var cls    = isGood ? ' pnl2-good' : ' pnl2-bad';
      return '<td class="pnl2-delta' + cls + '"><span class="pnl2-pill">' + sign + fmtDollar(diff) + '</span></td>';
    }

    // Comparison chip picker — all months except current, most-recent first
    var chipHtml = months.slice().reverse().filter(function(m) { return m !== finMonth; }).map(function(m) {
      var act = m === pnlCompareMonth ? ' act' : '';
      return '<button class="pnl-cmp-chip' + act + '" onclick="setPnlCompare(\'' + m + '\')">' + fmtMkShort(m) + '</button>';
    }).join('');
    var pickerHtml = '<div class="pnl-cmp-row"><span class="pnl-cmp-lbl">Compare to</span>' +
      '<div class="pnl-cmp-chips">' + chipHtml + '</div></div>';

    var priHead = fmtMkShort(finMonth);
    var cmpHead = pnlCompareMonth ? fmtMkShort(pnlCompareMonth) : '—';
    var pnlHead = '<tr>' +
      '<th class="pnl2-th-lbl">Line Item</th>' +
      '<th class="pnl2-th-pri">' + priHead + '</th>' +
      '<th class="pnl2-th-cmp">' + cmpHead + '<span class="pnl2-cmp-tag">compare</span></th>' +
      '<th class="pnl2-th-delta">&Delta; Change</th>' +
      '</tr>';
    var pnlBody = pnlRows.map(function(row) {
      return '<tr class="' + row.cls + '">' +
        '<td class="pnl2-td-lbl">' + esc(row.label) + '</td>' +
        pCell2(row.arr, priIdx2, priRev) +
        pCell2(row.arr, cmpIdx2, cmpRev) +
        dCell2(row.arr, priIdx2, cmpIdx2, row.good) +
        '</tr>';
    }).join('');

    document.getElementById('finPnlGrid').innerHTML =
      pickerHtml +
      '<table class="pnl-grid pnl-grid--2col"><thead>' + pnlHead + '</thead><tbody>' + pnlBody + '</tbody></table>';
    document.getElementById('finPnlSubtitle').textContent = priHead;
  }

  // ── Cost breakdown donut (selected month) ────────────────────
  var dTechLabor = at(techLabor);
  var dParts     = at(parts);
  var dSubs      = at(subs);
  var dAdmin     = at(adminPay);
  var dMkt       = at(mktTotal);
  var dRent      = at(rentExp);
  var dVehicle   = at(vehicleExp);
  var dOffice    = at(officeExp);
  var dMerch     = at(merchExp);
  var dInsure    = acct('Insurance')[curIdx] || 0;
  var dBenefits  = at(benefitsExp);
  var dUtil      = at(utilExp);
  var dAccounted = dTechLabor + dParts + dSubs + dAdmin + dMkt + dRent + dVehicle + dOffice + dMerch + dInsure + dBenefits + dUtil;
  var dAllCosts  = at(cogs) + at(totalExp);
  var dOther     = Math.max(dAllCosts - dAccounted, 0);
  document.getElementById('donutSubtitle').textContent = fmtDollar(dAllCosts) + ' \u00b7 ' +
    (finGranularity === 'quarter' ? fmtQk(finQuarter) : fmtMkShort(finMonth));

  if (donutChartInst) donutChartInst.destroy();
  var dCtx = document.getElementById('donutChart').getContext('2d');
  donutChartInst = new Chart(dCtx, {
    type: 'doughnut',
    data: {
      labels: ['Tech Labor','Parts','Subcontractors','Admin Payroll','Marketing','Rent','Vehicle','Office','Merchant','Insurance','Benefits','Utilities','Other'],
      datasets: [{
        data: [dTechLabor,dParts,dSubs,dAdmin,dMkt,dRent,dVehicle,dOffice,dMerch,dInsure,dBenefits,dUtil,dOther],
        backgroundColor: ['#FF6B35','#E5484D','#f59e0b','#64748b','#14b8a6','#8b5cf6','#FF9500','#3b82f6','#a855f7','#6366f1','#22c55e','#06b6d4','#9ca3af'],
        borderWidth: 2, borderColor: '#fff', hoverOffset: 6
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '60%',
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 8, boxWidth: 10 } },
        tooltip: { callbacks: {
          label: function(ctx) {
            var v = ctx.parsed;
            var pct = dAllCosts > 0 ? (v/dAllCosts*100).toFixed(1) + '%' : '';
            return ctx.label + ': ' + fmtDollar(v) + (pct ? ' (' + pct + ')' : '');
          }
        }}
      }
    }
  });

  // ── Trend lines ──────────────────────────────────────────────
  var TREND_SERIES = [
    { key: 'gm',    label: 'Gross Profit %',     color: '#3b82f6', data: gmArr,    goal: 50,   dir: 'above' },
    { key: 'tl',    label: 'Technician Cost %',   color: '#FF9500', data: tlArr,    goal: 25,   dir: 'below' },
    { key: 'parts', label: 'Parts Cost %',        color: '#FF6B35', data: partsArr, goal: 25,   dir: 'below' },
    { key: 'admin', label: 'Admin & Office %',    color: '#8b5cf6', data: adminArr, goal: null, dir: null    },
    { key: 'om',    label: 'Profit %',            color: '#22c55e', data: noiArr,   goal: 15,   dir: 'above' }
  ];
  _trendSeries = TREND_SERIES; // cache for selectTrendLine

  // Build trend toggle buttons (single-select)
  var togHtml = TREND_SERIES.map(function(s) {
    var on = trendActive === s.key ? ' on' : '';
    return '<button class="fin-trend-btn' + on + '" data-key="' + s.key + '" style="color:' + s.color + ';--c:' + s.color + '" onclick="selectTrendLine(this)">' + esc(s.label) + '</button>';
  }).join('');
  document.getElementById('trendToggles').innerHTML = togHtml;

  if (trendChartInst) trendChartInst.destroy();
  var tCtx = document.getElementById('trendChart').getContext('2d');
  var mLabels = months.map(function(mk) {
    var p = mk.split('-'); return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(p[1])-1] + ' ' + p[0].slice(2);
  });
  var tDatasets = [];
  TREND_SERIES.forEach(function(s) {
    // Shade between the data line and the goal:
    //   dir:'above' (higher is better) → green above goal, red below
    //   dir:'below' (lower is better)  → green below goal, red above
    var fillCfg = false;
    if (s.goal != null && s.dir) {
      var goodColor = 'rgba(34,197,94,0.13)';
      var badColor  = 'rgba(239,68,68,0.10)';
      fillCfg = {
        target: { value: s.goal },
        above:  s.dir === 'above' ? goodColor : badColor,
        below:  s.dir === 'above' ? badColor  : goodColor
      };
    }
    tDatasets.push({
      label: s.label, data: s.data, borderColor: s.color,
      backgroundColor: 'transparent',
      borderWidth: 2, pointRadius: 3, pointHoverRadius: 5,
      tension: 0.3, hidden: trendActive !== s.key,
      fill: fillCfg
    });
  });
  // Goal-line datasets — solid slate, one per series
  TREND_SERIES.forEach(function(s) {
    tDatasets.push({
      label: s.label + ' target',
      data: s.goal == null ? [] : months.map(function() { return s.goal; }),
      borderColor: '#94a3b8',
      borderWidth: 2, pointRadius: 0, pointHoverRadius: 0,
      tension: 0, fill: false,
      hidden: trendActive !== s.key || s.goal == null
    });
  });
  trendChartInst = new Chart(tCtx, {
    type: 'line',
    data: { labels: mLabels, datasets: tDatasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          filter: function(ctx) { return !/target$/.test(ctx.dataset.label); },
          callbacks: {
            label: function(ctx) { return ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(1) + '%'; }
          }
        }
      },
      scales: {
        x: { grid: { color: '#f5f5f5' }, ticks: { font: { size: 10 } } },
        y: { ticks: { callback: function(v) { return v.toFixed(0) + '%'; }, font: { size: 10 } }, grid: { color: '#f0f0f0' } }
      }
    }
  });

  // Build the 2-item overlay legend (active series + target if it exists)
  buildTrendLegend(TREND_SERIES, curIdx);

  // ── Cash in the Bank Over Time ───────────────────────────────
  // Uses balance sheet bank history (from /api/qbo-balance) rather than
  // P&L data, so it shows the actual end-of-month bank balance.
  var cfCard = document.getElementById('finCashFlowCard');
  var hasBankHistory = ownersBalance && ownersBalance.connected &&
                       ownersBalance.bankHistory && ownersBalance.bankHistory.length > 1;

  if (cfCard && hasBankHistory) {
    cfCard.style.display = '';

    var bsMonths  = ownersBalance.months      || [];
    var bsHistory = ownersBalance.bankHistory || [];

    // Trim to last 13 months max, skip trailing months with no data
    var bsEnd = bsHistory.length - 1;
    while (bsEnd > 0 && !bsHistory[bsEnd]) bsEnd--;
    var bsStart = Math.max(0, bsEnd - 12);
    var cfMonths  = bsMonths.slice(bsStart, bsEnd + 1);
    var cfBal     = bsHistory.slice(bsStart, bsEnd + 1);
    var cfLabels  = cfMonths.map(function(mk) { return fmtMkShort(mk); });

    // Clean flat colours: light blue for history, vivid blue for current month
    var cfColors = cfBal.map(function(v, i) {
      return (bsStart + i) === bsEnd ? '#2563eb' : '#93c5fd';
    });

    if (cfBarChartInst) cfBarChartInst.destroy();
    var cfCtx = document.getElementById('cfBarChart').getContext('2d');

    // Inline plugin: draw the dollar value above each bar
    var cfLabelPlugin = {
      id: 'cfBarLabels',
      afterDatasetsDraw: function(chart) {
        var ctx2 = chart.ctx;
        var ds   = chart.data.datasets[0];
        var meta = chart.getDatasetMeta(0);
        ctx2.save();
        ctx2.textAlign = 'center';
        ctx2.textBaseline = 'bottom';
        meta.data.forEach(function(bar, i) {
          var v = ds.data[i];
          if (!v) return;
          var isLast = (bsStart + i) === bsEnd;
          ctx2.font = (isLast ? '700' : '600') + ' 11px "Inter",system-ui,sans-serif';
          ctx2.fillStyle = isLast ? '#1e3a8a' : '#64748b';
          ctx2.fillText(fmtDollar(v), bar.x, bar.y - 5);
        });
        ctx2.restore();
      }
    };

    cfBarChartInst = new Chart(cfCtx, {
      type: 'bar',
      data: {
        labels: cfLabels,
        datasets: [{
          data: cfBal,
          backgroundColor: cfColors,
          borderRadius: 8,
          borderSkipped: false,
          borderWidth: 0
        }]
      },
      plugins: [cfLabelPlugin],
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: false, // animated by IntersectionObserver below
        layout: { padding: { top: 26, left: 6, right: 6, bottom: 0 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1a2d3a',
            titleColor: '#94a3b8',
            bodyColor: '#fff',
            padding: 10,
            cornerRadius: 8,
            displayColors: false,
            callbacks: {
              title: function(items) { return items[0].label; },
              label: function(ctx) { return 'Balance: ' + fmtDollar(ctx.parsed.y); }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: {
              font: { size: 11, weight: '600' },
              color: '#94a3b8',
              maxRotation: 0, minRotation: 0,
              autoSkip: false
            }
          },
          y: {
            ticks: {
              callback: function(v) { return fmtDollar(v); },
              font: { size: 10 },
              color: '#94a3b8',
              maxTicksLimit: 5
            },
            grid: { color: '#f0f0f0', lineWidth: 1 },
            border: { display: false }
          }
        }
      }
    });

    // Scroll-triggered grow animation — fires once when the card enters the viewport
    (function() {
      var card = document.getElementById('finCashFlowCard');
      function runAnim() {
        if (!cfBarChartInst) return;
        cfBarChartInst.options.animation = {
          duration: 900,
          easing: 'easeOutBack',
          delay: function(ctx) { return ctx.type === 'data' ? ctx.dataIndex * 55 : 0; }
        };
        cfBarChartInst.update('active');
        cfBarChartInst.options.animation = false; // don't re-animate on hover/tooltip
      }
      if (window.IntersectionObserver) {
        var obs = new IntersectionObserver(function(entries) {
          if (entries[0].isIntersecting) { runAnim(); obs.disconnect(); }
        }, { threshold: 0.25 });
        obs.observe(card);
      } else {
        runAnim(); // fallback for old browsers
      }
    })();

    // Subtitle: date range instead of just a count
    document.getElementById('cfSubtitle').textContent =
      cfMonths.length > 1
        ? fmtMkShort(cfMonths[0]) + '\u2013' + fmtMkShort(cfMonths[cfMonths.length - 1])
        : (cfMonths.length + ' months');
  } else if (cfCard) {
    cfCard.style.display = 'none';
  }


}

// Build the 2-item overlay legend inside the chart (active series + gold target)
function buildTrendLegend(series, curIdx) {
  var el = document.getElementById('trendLegendOverlay');
  if (!el) return;
  var active = series.filter(function(s) { return s.key === trendActive; })[0];
  if (!active) return;
  var curVal = (active.data && active.data[curIdx] != null) ? active.data[curIdx].toFixed(1) + '%' : '\u2014';
  var html =
    '<div class="tcl-item">' +
      '<span class="tcl-swatch" style="background:' + active.color + '"></span>' +
      '<span class="tcl-label">' + esc(active.label) + '</span>' +
      '<span class="tcl-val" style="color:' + active.color + '">' + curVal + '</span>' +
    '</div>';
  if (active.goal != null) {
    var dirBadge = '';
    if (active.dir === 'above') {
      dirBadge = '<span class="tcl-dir tcl-dir--above">↑ aim above</span>';
    } else if (active.dir === 'below') {
      dirBadge = '<span class="tcl-dir tcl-dir--below">↓ stay below</span>';
    }
    html +=
      '<div class="tcl-item">' +
        '<span class="tcl-swatch tcl-swatch--target"></span>' +
        '<span class="tcl-label" style="color:#94a3b8">Target ' + active.goal + '%</span>' +
        dirBadge +
      '</div>';
  }
  el.innerHTML = html;
}

// Cache series reference for selectTrendLine to call buildTrendLegend
var _trendSeries = null;

function selectTrendLine(btn) {
  var key = btn.dataset.key;
  trendActive = key;
  // Sync toggle buttons above chart
  var btns = document.querySelectorAll('#trendToggles .fin-trend-btn');
  btns.forEach(function(b) { b.classList.toggle('on', b.dataset.key === key); });
  if (trendChartInst) {
    var keys = ['gm','tl','parts','admin','om'];
    var goals = { gm:50, tl:25, parts:25, admin:null, om:15 };
    keys.forEach(function(k, idx) {
      trendChartInst.data.datasets[idx].hidden = k !== key;
      if (trendChartInst.data.datasets[idx + keys.length]) {
        trendChartInst.data.datasets[idx + keys.length].hidden = k !== key || goals[k] == null;
      }
    });
    trendChartInst.update();
  }
  // Rebuild the 2-item overlay legend
  if (_trendSeries) {
    // Find current curIdx from ownersData
    var months = ownersData && ownersData.months || [];
    var ci = finMonth ? months.indexOf(finMonth) : months.length - 1;
    if (ci < 0) ci = months.length - 1;
    buildTrendLegend(_trendSeries, ci);
  }
}
// ── Overhead drill-down modal ─────────────────────────────────

// Fetches transactions for a single month/acctKey combo, including child-key fallback.
// Returns an array of transaction objects (may be empty).
async function fetchTxnsForMonth(acctKey, month) {
  var resp = await fetch('/api/account-detail?acct=' + encodeURIComponent(acctKey) + '&month=' + encodeURIComponent(month));
  var data = await resp.json();

  if (data.transactions && data.transactions.length) return data.transactions;

  // Key miss — try matching child sub-account keys the server returned
  if (data.availableKeys && data.availableKeys.length) {
    var childNames = (ownersData.children && ownersData.children[acctKey]) || [];
    var childBases = childNames.map(function(n) { return n.toLowerCase(); });
    var matchedKeys = data.availableKeys.filter(function(k) {
      var kBase = k.replace(/^Total\s+/i, '').toLowerCase();
      return childBases.some(function(b) { return b.includes(kBase) || kBase.includes(b); });
    });
    var childTxns = [];
    for (var i = 0; i < matchedKeys.length; i++) {
      try {
        var r2 = await fetch('/api/account-detail?acct=' + encodeURIComponent(matchedKeys[i]) + '&month=' + encodeURIComponent(month));
        var d2 = await r2.json();
        if (d2.transactions) childTxns = childTxns.concat(d2.transactions);
      } catch (e) { /* skip */ }
    }
    if (childTxns.length) return childTxns;
  }
  return [];
}

// Opens the expense detail sheet for a given overhead category.
// In quarter mode, fetches and combines all 3 months of the quarter.
async function mfDrillDown(label, acctKey) {
  if (!ownersData) return;
  var color = '#f97316'; // orange — overhead theme

  // Determine which months to pull and the label to show in the sheet header
  var fetchMonths, periodLabel;
  if (finGranularity === 'quarter' && finQuarter) {
    fetchMonths = quarterMonths(finQuarter).filter(function(mk) {
      return (ownersData.months || []).indexOf(mk) >= 0;
    });
    periodLabel = fmtQk(finQuarter);
  } else {
    var single = finMonth || (ownersData.months || [])[(ownersData.months || []).length - 1];
    fetchMonths = [single];
    periodLabel = fmtMk(single);
  }

  // Show modal immediately with a loading spinner
  showExpModalLoading(label, periodLabel, color);

  try {
    var allTxns = [];
    for (var mi = 0; mi < fetchMonths.length; mi++) {
      var txns = await fetchTxnsForMonth(acctKey, fetchMonths[mi]);
      allTxns = allTxns.concat(txns);
    }

    if (allTxns.length) {
      // Sort largest amount first
      allTxns.sort(function(a, b) { return Math.abs(b.amount) - Math.abs(a.amount); });
      showExpModalTxns(label, periodLabel, allTxns, color);
      return;
    }
  } catch (err) {
    console.error('[mfDrillDown] fetch failed:', err);
  }

  // Final fallback: show sub-account totals from the P&L summary, summed across period
  var childNames = (ownersData.children && ownersData.children[acctKey]) || [];
  var items = childNames.map(function(name) {
    var val = fetchMonths.reduce(function(s, mk) {
      return s + ((ownersData.accounts[name] && ownersData.accounts[name][mk]) || 0);
    }, 0);
    return { name: name, val: val };
  }).filter(function(i) { return i.val > 0; })
    .sort(function(a, b) { return b.val - a.val; });
  var total = fetchMonths.reduce(function(s, mk) {
    return s + ((ownersData.accounts[acctKey] && ownersData.accounts[acctKey][mk]) || 0);
  }, 0);
  showExpModal(label, periodLabel, items, total, color);
}

// Show the expense sheet in "loading" state while the transaction fetch runs
function showExpModalLoading(title, monthLabel, color) {
  var backdrop = document.getElementById('expBackdrop');
  var titleEl  = document.getElementById('expSheetTitle');
  var subEl    = document.getElementById('expSheetSub');
  var bodyEl   = document.getElementById('expSheetBody');
  var footEl   = document.getElementById('expSheetFooter');
  if (!backdrop) return;

  titleEl.textContent = title;
  subEl.textContent   = monthLabel;
  titleEl.style.color = color || '#333';
  bodyEl.innerHTML    = '<div class="exp-loading"><div class="spinner" style="margin:0 auto"></div><div style="margin-top:10px;color:#aaa;font-size:13px">Loading line items\u2026</div></div>';
  footEl.innerHTML    = '';

  backdrop.style.display = 'flex';
  document.body.style.overflow = 'hidden'; // prevent background page scroll while sheet is open
  requestAnimationFrame(function() { backdrop.classList.add('exp-open'); });
}

// Show individual transactions in the already-open expense sheet
function showExpModalTxns(title, monthLabel, txns, color) {
  var bodyEl = document.getElementById('expSheetBody');
  var footEl = document.getElementById('expSheetFooter');
  if (!bodyEl) return;

  var total = txns.reduce(function(s, t) { return s + Math.abs(t.amount); }, 0);

  var rowsHtml = txns.map(function(t) {
    var dateStr = '';
    if (t.date) {
      var d = new Date(t.date + 'T12:00:00');
      dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    var desc = t.name || t.memo || t.type || '\u2014';
    var memo = t.memo && t.name ? t.memo : '';
    var barPct = total > 0 ? (Math.abs(t.amount) / total * 100) : 0;
    return '<div class="exp-row">' +
      '<div class="exp-row-top">' +
        '<span class="exp-row-name">' +
          (dateStr ? '<span class="exp-txn-date">' + esc(dateStr) + '</span>' : '') +
          '<span class="exp-txn-desc">' + esc(desc) + '</span>' +
          (memo ? '<span class="exp-txn-memo">' + esc(memo) + '</span>' : '') +
        '</span>' +
        '<span class="exp-row-val">' + fmtDollar(Math.abs(t.amount)) + '</span>' +
      '</div>' +
      '<div class="exp-bar-track">' +
        '<div class="exp-bar-fill" style="width:' + barPct.toFixed(1) + '%;background:' + (color || '#f97316') + '"></div>' +
      '</div>' +
    '</div>';
  }).join('');

  bodyEl.innerHTML = rowsHtml || '<div class="exp-empty">No transactions found for this month.</div>';
  footEl.innerHTML = '<span class="exp-foot-label">' + txns.length + ' transaction' + (txns.length !== 1 ? 's' : '') + '</span>' +
                     '<span class="exp-foot-val">' + fmtDollar(total) + '</span>';
}

// Fallback: show sub-account totals (when transaction detail isn't available)
function showExpModal(title, monthLabel, items, total, color) {
  var backdrop = document.getElementById('expBackdrop');
  var titleEl  = document.getElementById('expSheetTitle');
  var subEl    = document.getElementById('expSheetSub');
  var bodyEl   = document.getElementById('expSheetBody');
  var footEl   = document.getElementById('expSheetFooter');
  if (!backdrop) return;

  titleEl.textContent = title;
  subEl.textContent   = monthLabel;
  titleEl.style.color = color || '#333';

  if (!items.length) {
    bodyEl.innerHTML = '<div class="exp-empty">No sub-account detail available for this month.</div>';
  } else {
    var rowsHtml = items.map(function(item, i) {
      var barPct = total > 0 ? (item.val / total * 100) : 0;
      return '<div class="exp-row">' +
        '<div class="exp-row-top">' +
          '<span class="exp-row-name">' + esc(item.name) + '</span>' +
          '<span class="exp-row-val">' + fmtDollar(item.val) + '</span>' +
        '</div>' +
        '<div class="exp-bar-track">' +
          '<div class="exp-bar-fill" style="width:' + barPct.toFixed(1) + '%;background:' + (color || '#f97316') + '"></div>' +
        '</div>' +
      '</div>';
    }).join('');
    bodyEl.innerHTML = rowsHtml;
  }

  footEl.innerHTML = '<span class="exp-foot-label">Total</span>' +
                     '<span class="exp-foot-val">' + fmtDollar(total) + '</span>';

  backdrop.style.display = 'flex';  // make it flex before animating
  requestAnimationFrame(function() { backdrop.classList.add('exp-open'); });
}

function closeExpModal() {
  var backdrop = document.getElementById('expBackdrop');
  if (!backdrop) return;
  backdrop.classList.remove('exp-open');
  document.body.style.overflow = ''; // restore page scroll
  // Remove from layout after the slide-down transition finishes
  setTimeout(function() { backdrop.style.display = 'none'; }, 280);
}

// ── Narrow-bar label guard ────────────────────────────────────
// Called after every money-flow render and on window resize.
// Any clickable bar segment narrower than MIN_PX gets its text label hidden
// so it never shows a truncated / overlapping partial string.
function mfFixNarrowLabels() {
  var MIN_PX = 90;
  document.querySelectorAll('.mf-seg-click, .mf-noi-profit-seg').forEach(function(seg) {
    seg.classList.toggle('mf-label-too-narrow', seg.offsetWidth < MIN_PX);
  });
}
window.addEventListener('resize', mfFixNarrowLabels);
