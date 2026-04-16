// ── Location Owners / Financial Tab ────────────────────────────
var ownersData = null;
var finMode = 'dollar'; // 'dollar' | 'pct'
var finMonth = null;    // YYYY-MM currently selected
var finCompare = 'prior_year_month'; // prior_month | prior_year_month | prior_year_avg | none
var ownersBalance = null;
var donutChartInst = null;
var trendChartInst = null;
var cfBarChartInst = null;
var trendActive = 'gm'; // single-select key-ratio trend line

// ── Growth Decision Cards ────────────────────────────────────────
var growthMetrics = null;
var growthForecastChartInst = null;
var growthInteractiveData = {
  newTechCount: 1,
  newVanCount: 1,
  toolInvestment: 8000, // Sewer Camera is the first tool in the list
  selectedScenarios: { doNothing: true, hireTech: false, buyVan: false, buyTool: false }
};

// Toggle expandable detail panel; triggers zoom-bar + stagger animations on open
function mfToggle(panelId, btn) {
  var panel = document.getElementById(panelId);
  if (!panel) return;
  var nowOpen = panel.hidden; // true = was hidden, about to open
  panel.hidden = !nowOpen;
  var chev = btn && btn.querySelector('.mf-op-chev');
  if (chev) chev.textContent = nowOpen ? '\u25b4' : '\u25be';
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
    // Only render % label when segment is >= 10% wide — prevents partial/clipped text
    var pctLabel = rawPct >= 10 ? '<span class="mf-zoom-seg-pct">' + rawPct.toFixed(0) + '%</span>' : '';
    return '<div class="mf-zoom-seg" data-zid="' + zid + '"' +
           ' style="flex:' + r.val.toFixed(0) + ';background:' + pal[i % pal.length] + '"' +
           ' onmouseenter="mfZoomHL(\'' + zid + '\',true)"' +
           ' onmouseleave="mfZoomHL(\'' + zid + '\',false)"' +
           ' onclick="mfZoomSel(\'' + zid + '\')"' +
           ' title="' + esc(r.label) + '">' +
           pctLabel +
           '</div>';
  }).join('');

  // Legend rows — full-row color tint + left accent stripe; click to cross-highlight
  var legend = visible.map(function(r, i) {
    var zid      = id + '-' + i;
    var rowColor = pal[i % pal.length];
    var rowBg    = hexAlpha(rowColor, 0.09);
    var pct      = (r.val / total * 100).toFixed(1);
    return '<div class="mf-zoom-leg-row" data-zid="' + zid + '"' +
      ' style="--i:' + i + ';background:' + rowBg + ';border-left:3px solid ' + rowColor + '"' +
      ' onmouseenter="mfZoomHL(\'' + zid + '\',true)"' +
      ' onmouseleave="mfZoomHL(\'' + zid + '\',false)"' +
      ' onclick="mfZoomSel(\'' + zid + '\')">' +
      '<span class="mf-zoom-leg-name">' + esc(r.label) + '</span>' +
      '<span class="mf-zoom-leg-pct">' + pct + '%</span>' +
      '<span class="mf-zoom-leg-val">' + fmtDollar(r.val) + '</span>' +
    '</div>';
  }).join('');

  return (
    '<div class="mf-zoom-detail" id="' + id + '" hidden>' +
      // Connector: gradient color block, no lines — widens from segment to full
      '<div class="mf-zoom-connector-wrap">' +
        '<svg class="mf-zoom-trap" viewBox="0 0 100 64" preserveAspectRatio="none" width="100%" height="64">' +
          '<defs>' +
            '<linearGradient id="' + gradId + '" x1="0" y1="0" x2="0" y2="1">' +
              '<stop offset="0%" stop-color="' + color + '" stop-opacity="0.22"/>' +
              '<stop offset="100%" stop-color="' + color + '" stop-opacity="0"/>' +
            '</linearGradient>' +
          '</defs>' +
          // Solid marker bar = the source segment position
          '<rect x="' + s + '" y="0" width="' + sw + '" height="5" fill="' + topCol + '" rx="1"/>' +
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

// Toggle expandable balance-sheet sub-lists
function bsToggle(id) {
  var el = document.getElementById(id);
  if (!el) return;
  el.hidden = !el.hidden;
  // rotate chevron if present (chev id = id + first letter caps trick → just scan parent)
  var btn = el.previousElementSibling;
  var chev = btn && btn.querySelector('.bs-chev');
  if (chev) chev.style.transform = el.hidden ? '' : 'rotate(180deg)';
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
  document.getElementById('finRow3').style.display = 'none';
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
  fetchGrowthMetrics();
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
    document.getElementById('finRow3').style.display = 'none';
    document.getElementById('finTrendCard').style.display = 'none';
    document.getElementById('finCashFlowCard').style.display = 'none';
    return;
  }

  var months = ownersData.months || [];
  if (!months.length) return;

  // ── Populate month picker (most-recent first) ───────────────
  if (!finMonth || months.indexOf(finMonth) === -1) {
    finMonth = months[months.length - 1];
  }
  // Update big header title
  var titleEl = document.getElementById('finMonthTitle');
  if (titleEl) titleEl.textContent = fmtMkFull(finMonth);
  // Rebuild custom month list
  var listEl = document.getElementById('finMonthList');
  if (listEl) {
    listEl.innerHTML = months.slice().reverse().map(function(m) {
      var active = m === finMonth ? ' active' : '';
      return '<div class="fin-month-item' + active + '" onclick="pickFinMonth(\'' + m + '\')">' + fmtMkFull(m) + '</div>';
    }).join('');
  }
  // Keep hidden native select in sync (used nowhere else but kept for safety)
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

  // ── Selected-month index + comparison index ──────────────────
  var curIdx = months.indexOf(finMonth);
  if (curIdx < 0) curIdx = months.length - 1;
  var cmpIdx = -1;
  var cmpLabel = '';
  var cmpValues = null; // function(seriesArr) -> number
  if (finCompare === 'prior_month' && curIdx > 0) {
    cmpIdx = curIdx - 1;
    cmpLabel = 'vs. ' + fmtMkShort(months[cmpIdx]);
    cmpValues = function(arr) { return arr[cmpIdx] || 0; };
  } else if (finCompare === 'prior_year_month' && curIdx >= 12) {
    cmpIdx = curIdx - 12;
    cmpLabel = 'vs. ' + fmtMkShort(months[cmpIdx]);
    cmpValues = function(arr) { return arr[cmpIdx] || 0; };
  } else if (finCompare === 'prior_year_avg' && curIdx >= 12) {
    var s = curIdx - 12, e = curIdx; // 12 months ending the month before selected
    cmpLabel = 'vs. prior-yr avg';
    cmpValues = function(arr) {
      var sum = 0, n = 0;
      for (var i = s; i < e; i++) { sum += arr[i] || 0; n++; }
      return n > 0 ? sum / n : 0;
    };
  }

  // Current month scalars
  function at(arr) { return arr[curIdx] || 0; }
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
    { label: 'Tech Labor',  val: at(techLabor) },
    { label: 'Parts',       val: at(parts) },
    { label: 'Subcontractors', val: at(subs) }
  ];
  var ovhdItems = [
    { label: 'Admin Payroll',     val: at(adminPay) },
    { label: 'Marketing',         val: at(mktTotal) },
    { label: 'Rent',              val: at(rentExp) },
    { label: 'Vehicles',          val: at(vehicleExp) },
    { label: 'Office',            val: at(officeExp) },
    { label: 'Utilities',         val: at(utilExp) },
    { label: 'Employee Benefits', val: at(benefitsExp) },
    { label: 'Merchant Fees',     val: at(merchExp) },
    { label: 'Taxes',             val: at(taxesExp) },
    { label: 'Travel',            val: at(travelExp) },
    { label: 'Meals',             val: at(mealsExp) },
    { label: 'Other',             val: at(genExp) }
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
    '<div id="mfGpDetail" class="mf-zoom-detail mf-gp-detail is-open">' +
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
        '<div class="mf-rev-bar-leg">This is the full 100% — everything below is carved out of this bar</div>' +
      '</div>' +

      // ── − Cost of Goods Sold ──────────────────────────────────
      '<div class="mf-op">' +
        '<div class="mf-op-label"><span class="mf-op-sign">\u2212</span> Cost of Goods Sold</div>' +
        '<div class="mf-op-total">\u2212' + fmtDollar(curCOGS) + '</div>' +
        // 2-part split bar: red = COGS (clickable), pale-green = GP remainder (passive)
        '<div class="mf-split-wrap mf-split-wrap--cogs">' +
          '<div class="mf-cogs-bar-wrap">' +
            '<div class="mf-cogs-goal-lbl">Target 50%</div>' +
            '<div class="mf-split-bar">' +
              '<div class="mf-sb-cogs mf-seg-click" onclick="mfToggle(\'mfCogsDetail\',this)"' +
                  ' style="width:' + Math.max(0,Math.min(cogsPct,99)).toFixed(1) + '%">' +
                '<span class="mf-op-chev">\u25be</span>' +
              '</div>' +
              '<div style="flex:1;min-width:2px;background:#bbf7d0"></div>' +
            '</div>' +
            '<div class="mf-cogs-target-line"></div>' +
          '</div>' +
          '<div class="mf-split-leg">' +
            '<button class="mf-sl-cogs mf-sl-btn" onclick="mfToggle(\'mfCogsDetail\',null)">COGS</button>' +
          '</div>' +
        '</div>' +
        mfZoomDetail('mfCogsDetail', cogsItems, 0, cogsPct,
          ['#3b82f6','#8b5cf6','#f59e0b'], '#f87171', 'COGS') +
      '</div>' +

      // ── = Gross Profit ────────────────────────────────────────
      '<div class="mf-step mf-step--gp">' +
        '<div class="mf-step-label"><span class="mf-step-eq">=</span> Gross Profit ' + mfPill('gp', gmPct) + '</div>' +
        '<div class="mf-step-num">' + fmtDollar(curGP) + '</div>' +
        gpDetailHtml +
      '</div>' +

      // ── − Overhead ────────────────────────────────────────────
      '<div class="mf-op">' +
        '<div class="mf-op-label"><span class="mf-op-sign">\u2212</span> Overhead</div>' +
        '<div class="mf-op-total mf-op-total--orange">\u2212' + fmtDollar(curOvhd) + '</div>' +
        // 3-part split bar: click the orange Overhead segment to expand the breakdown
        '<div class="mf-split-wrap mf-split-wrap--ovhd">' +
          '<div class="mf-split-bar">' +
            '<div class="mf-sb-prior" style="width:' + Math.max(0,Math.min(cogsPct,99)).toFixed(1) + '%"></div>' +
            '<div class="mf-sb-ovhd mf-seg-click" onclick="mfToggle(\'mfOvhdDetail\',this)"' +
                ' style="width:' + Math.max(0,Math.min(ovhdPct,100-cogsPct)).toFixed(1) + '%">' +
              '<span class="mf-op-chev">\u25be</span>' +
            '</div>' +
            '<div class="mf-sb-pass"></div>' +
          '</div>' +
          '<div class="mf-split-leg">' +
            '<span class="mf-sl-prior">COGS</span>' +
            '<button class="mf-sl-ovhd mf-sl-btn" onclick="mfToggle(\'mfOvhdDetail\',null)">Overhead</button>' +
            '<span class="mf-sl-pass-noi">Operating Profit</span>' +
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

        var noiDetailHtml =
          '<div id="mfNoiDetail" class="mf-zoom-detail mf-noi-detail" hidden>' +
            '<div class="mf-noi-explain">' +
              '<div class="mf-noi-explain-head">What is Operating Profit?</div>' +
              '<div class="mf-noi-explain-body">' +
                'After paying for every job (COGS) and every bill to run the business (overhead), ' +
                'whatever\u2019s left is Operating Profit \u2014 the real reward for owning the company. ' +
                'It\u2019s what funds savings, growth, and your own paycheck.' +
              '</div>' +
              '<div class="mf-noi-explain-row">' +
                '<div class="mf-noi-explain-stat">' +
                  '<div class="mf-noi-explain-stat-label">Our goal</div>' +
                  '<div class="mf-noi-explain-stat-val">15% of revenue</div>' +
                '</div>' +
                '<div class="mf-noi-explain-stat">' +
                  '<div class="mf-noi-explain-stat-label">This month</div>' +
                  '<div class="mf-noi-explain-stat-val ' + (isAbove ? 'c-green' : 'c-red') + '">' + fmtPct(noiPct) + '</div>' +
                '</div>' +
              '</div>' +
              '<div class="mf-noi-explain-tip">' +
                '<span class="mf-noi-tip-head">How to keep more of it:</span>' +
                ' Charge more per job, reduce parts costs, or trim overhead. ' +
                'Every extra 1% on ' + fmtDollar(curRev) + ' revenue puts an extra ' +
                fmtDollar(curRev * 0.01) + ' in the bank.' +
              '</div>' +
            '</div>' +
          '</div>';

        return (
          '<div class="mf-step mf-step--noi">' +
            '<div class="mf-step-label"><span class="mf-step-eq">=</span> Operating Profit ' + mfPill('op', noiPct) + '</div>' +
            '<div class="mf-step-num">' + fmtDollar(curNOI) + '</div>' +
            // Bar wrapper — position:relative so target line can sit on top
            '<div class="mf-noi-bar-wrap">' +
              // Gold target label above bar
              '<div class="mf-noi-goal-lbl" style="left:' + targetX + '%">Profit Goal 15%</div>' +
              // 3-segment mirror bar
              '<div class="mf-split-bar mf-noi-mirror-bar">' +
                '<div style="width:' + Math.max(0, cogsPct).toFixed(1) + '%;background:#fecaca;flex-shrink:0"></div>' +
                '<div style="width:' + Math.max(0, ovhdPct).toFixed(1) + '%;background:#fed7aa;flex-shrink:0"></div>' +
                // Blue NOI segment — clickable
                '<div class="mf-noi-profit-seg mf-seg-click" onclick="mfToggle(\'mfNoiDetail\',this)" ' +
                    'style="flex:1;min-width:2px;background:#3b82f6">' +
                  '<span class="mf-op-chev">\u25be</span>' +
                '</div>' +
              '</div>' +
              // Gold vertical target line
              '<div class="mf-noi-target-line" style="left:' + targetX + '%"></div>' +
            '</div>' +
            // Legend
            '<div class="mf-split-leg">' +
              '<span class="mf-sl-noi-cogs">COGS</span>' +
              '<span class="mf-sl-noi-ovhd">Overhead</span>' +
              '<button class="mf-sl-noi-profit mf-sl-btn" onclick="mfToggle(\'mfNoiDetail\',null)">Operating Profit</button>' +
            '</div>' +
            noiDetailHtml +
            // Gap line
            '<div class="mf-score-gap ' + gapCls + '" style="margin-top:10px">' + gapTxt + '</div>' +
          '</div>'
        );
      }()) +

    '</div>'; // .mf-card

  document.getElementById('finCards').innerHTML = formulaHtml;

  // ── Show structural elements ─────────────────────────────────
  var multiMonth = months.length > 1;
  document.getElementById('finPnlCard').style.display = multiMonth ? '' : 'none';
  document.getElementById('finRow2').style.display = '';
  document.getElementById('finRow3').style.display = '';
  document.getElementById('finTrendCard').style.display = multiMonth ? '' : 'none';
  var updEl = document.getElementById('finUpdated');
  if (updEl) {
    var updTxt = fmtMk(finMonth) + '  \u00b7  ';
    if (ownersData.fetchedAt) updTxt += 'as of ' + new Date(ownersData.fetchedAt).toLocaleTimeString();
    updEl.textContent = updTxt;
  }

  // ── Monthly P&L grid ─────────────────────────────────────────
  // On phone, show last 6 months; desktop, last 12.
  var isPhone = window.innerWidth < 700;
  var gridEnd = curIdx;
  var gridStart = Math.max(0, gridEnd - (isPhone ? 5 : 11));
  var gridMonths = months.slice(gridStart, gridEnd + 1);

  var otherOpex = totalExp.map(function(t, i) {
    return t - (adminPay[i]||0) - (mktTotal[i]||0) - (officeExp[i]||0) - (rentExp[i]||0)
      - (vehicleExp[i]||0) - (utilExp[i]||0) - (travelExp[i]||0) - (mealsExp[i]||0)
      - (genExp[i]||0) - (taxesExp[i]||0) - (merchExp[i]||0) - (benefitsExp[i]||0);
  });
  var pnlRows = [
    { label: 'Revenue', arr: revenue, cls: 'subtotal' },
    { label: 'Cost of Goods Sold', arr: cogs, cls: '' },
    { label: 'Tech Labor', arr: techLabor, cls: 'indent' },
    { label: 'Parts', arr: parts, cls: 'indent' },
    { label: 'Subcontractors', arr: subs, cls: 'indent' },
    { label: 'Gross Profit', arr: gp, cls: 'subtotal' },
    { label: 'Operating Expenses', arr: totalExp, cls: '' },
    { label: 'Admin Payroll', arr: adminPay, cls: 'indent' },
    { label: 'Marketing', arr: mktTotal, cls: 'indent' },
    { label: 'Rent', arr: rentExp, cls: 'indent' },
    { label: 'Vehicle', arr: vehicleExp, cls: 'indent' },
    { label: 'Office', arr: officeExp, cls: 'indent' },
    { label: 'Utilities', arr: utilExp, cls: 'indent' },
    { label: 'Merchant Fees', arr: merchExp, cls: 'indent' },
    { label: 'Employee Benefits', arr: benefitsExp, cls: 'indent' },
    { label: 'Taxes', arr: taxesExp, cls: 'indent' },
    { label: 'Travel', arr: travelExp, cls: 'indent' },
    { label: 'Meals', arr: mealsExp, cls: 'indent' },
    { label: 'Other', arr: otherOpex, cls: 'indent' },
    { label: 'Net Operating Income', arr: noi, cls: 'total' }
  ];
  var revGridTotal = 0;
  gridMonths.forEach(function(_, gi) { revGridTotal += revenue[gridStart+gi] || 0; });
  var pnlHead = '<tr><th>Line item</th>' +
    gridMonths.map(function(m) { return '<th>' + fmtMkShort(m) + '</th>'; }).join('') +
    '<th>Total</th><th>% Rev</th></tr>';
  var pnlBody = pnlRows.map(function(row) {
    var cells = gridMonths.map(function(_, gi) {
      var v = row.arr[gridStart+gi] || 0;
      var isHi = (gridStart+gi) === curIdx ? ' highlight' : '';
      var neg = v < 0 ? ' neg' : '';
      return '<td class="' + isHi + neg + '">' + (finMode==='pct' && revenue[gridStart+gi]>0 ? (v/revenue[gridStart+gi]*100).toFixed(1)+'%' : fmtDollar(v)) + '</td>';
    }).join('');
    var rowTotal = 0;
    gridMonths.forEach(function(_, gi) { rowTotal += row.arr[gridStart+gi] || 0; });
    var pctRev = revGridTotal > 0 ? (rowTotal / revGridTotal * 100).toFixed(1) + '%' : '—';
    return '<tr class="' + row.cls + '"><td>' + esc(row.label) + '</td>' + cells +
      '<td>' + fmtDollar(rowTotal) + '</td>' +
      '<td>' + pctRev + '</td></tr>';
  }).join('');
  document.getElementById('finPnlGrid').innerHTML =
    '<table class="pnl-grid"><thead>' + pnlHead + '</thead><tbody>' + pnlBody + '</tbody></table>';
  document.getElementById('finPnlSubtitle').textContent = gridMonths.length + ' months ending ' + fmtMkShort(finMonth);

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
  document.getElementById('donutSubtitle').textContent = fmtDollar(dAllCosts) + ' \u00b7 ' + fmtMkShort(finMonth);

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

  // ── Variance card (comparison mode driven by finCompare dropdown) ─
  // Sync the compare select in the card to the current state
  var varSelEl = document.getElementById('finCompareSel');
  if (varSelEl) varSelEl.value = finCompare;

  if (finCompare === 'none' || !cmpValues) {
    document.getElementById('finVariance').innerHTML =
      '<div style="padding:2rem;text-align:center;color:#aaa;font-size:15px">Select a comparison above to see how this month stacks up.</div>';
    document.getElementById('varSubtitle').textContent = fmtMkShort(finMonth);
  } else {
    // Resolve comparison values for each P&L line
    var cmpRev  = cmpValues(revenue);
    var cmpCogs = cmpValues(cogs);
    var cmpGP   = cmpValues(gp);
    var cmpExp  = cmpValues(totalExp);
    var cmpNOI  = cmpValues(noi);

    // Column header label: "Same month last year" → "Last year (Mar 25)"
    var cmpColHeader = finCompare === 'prior_year_month' && cmpIdx >= 0
      ? 'Last year (' + fmtMkShort(months[cmpIdx]) + ')'
      : finCompare === 'prior_month' && cmpIdx >= 0
      ? 'Prior month (' + fmtMkShort(months[cmpIdx]) + ')'
      : 'Prior period';

    // Mobile NOI vs. label
    var cmpVsLabel = finCompare === 'prior_year_month' && cmpIdx >= 0
      ? 'vs. ' + fmtMkShort(months[cmpIdx])
      : finCompare === 'prior_month' && cmpIdx >= 0
      ? 'vs. ' + fmtMkShort(months[cmpIdx])
      : 'vs. prior avg';

    var varLines = [
      { label: 'Revenue',            cur: curRev,        cmp: cmpRev,  good: 'up',   kind: 'top',    op: '' },
      { label: 'Cost of Goods Sold', cur: curCOGS,       cmp: cmpCogs, good: 'down', kind: 'indent', op: '\u2212' },
      { label: 'Gross Profit',       cur: curGP,         cmp: cmpGP,   good: 'up',   kind: 'sub',    op: '=' },
      { label: 'Operating Expenses', cur: curOvhd,       cmp: cmpExp,  good: 'down', kind: 'indent', op: '\u2212' },
      { label: 'Operating Profit',   cur: curNOI,        cmp: cmpNOI,  good: 'up',   kind: 'noi',    op: '=' }
    ];
    function deltaParts(l) {
      var d = (l.cur||0) - (l.cmp||0);
      var pct = l.cmp ? (d / Math.abs(l.cmp) * 100) : 0;
      var isGood = l.good === 'up' ? d >= 0 : d <= 0;
      var cls = isGood ? 'pos' : 'neg';
      var signStr = d >= 0 ? '+' : '';
      return { d: d, pct: pct, cls: cls, signStr: signStr };
    }
    // Desktop table — NOI row emphasized
    var varBody = varLines.map(function(l) {
      var p = deltaParts(l);
      var rowCls = l.kind === 'sub' ? 'subtotal' : (l.kind === 'noi' ? 'noi' : '');
      return '<tr class="' + rowCls + '">' +
        '<td>' + esc(l.label) + '</td>' +
        '<td>' + fmtDollar(l.cur || 0) + '</td>' +
        '<td>' + fmtDollar(l.cmp || 0) + '</td>' +
        '<td class="' + p.cls + '">' + p.signStr + fmtDollar(p.d) + '</td>' +
        '<td class="' + p.cls + '">' + (l.cmp ? p.signStr + p.pct.toFixed(1) + '%' : '—') + '</td>' +
        '</tr>';
    }).join('');
    // Mobile flow — P&L order with big NOI payload
    var varFlow = varLines.map(function(l) {
      var p = deltaParts(l);
      if (l.kind === 'noi') {
        return '<div class="var-flow-row noi">' +
          '<div class="var-noi-lbl">' + (l.op ? l.op + ' ' : '') + 'Operating Profit</div>' +
          '<div class="var-noi-val">' + fmtDollar(l.cur || 0) + '</div>' +
          '<div class="var-noi-vs">' + cmpVsLabel + ': ' + fmtDollar(l.cmp || 0) + '</div>' +
          '<div class="var-noi-change ' + p.cls + '">' + (p.d >= 0 ? '▲' : '▼') + ' ' + p.signStr + fmtDollar(p.d) +
            (l.cmp ? ' (' + p.signStr + p.pct.toFixed(0) + '%)' : '') + '</div>' +
          '</div>';
      }
      var rowCls = l.kind === 'indent' ? 'indent' : (l.kind === 'sub' ? 'sub' : '');
      return '<div class="var-flow-row ' + rowCls + '">' +
        '<span>' + (l.op ? l.op + ' ' : '') + esc(l.label) + ' <span class="var-row-amt">' + fmtDollar(l.cur||0) + '</span></span>' +
        '<span class="var-chg ' + p.cls + '">' + (l.cmp ? p.signStr + p.pct.toFixed(0) + '%' : '—') + '</span>' +
        '</div>';
    }).join('');
    document.getElementById('finVariance').innerHTML =
      '<div class="var-flow">' + varFlow + '</div>' +
      '<div class="var-table-wrap">' +
      '<table class="var-table"><thead><tr>' +
      '<th>Line item</th><th>This year (' + fmtMkShort(finMonth) + ')</th><th>' + cmpColHeader + '</th>' +
      '<th>Change ($)</th><th>Change (%)</th></tr></thead><tbody>' + varBody + '</tbody></table></div>';
    document.getElementById('varSubtitle').textContent = fmtMkShort(finMonth) + ' vs. ' + (cmpIdx >= 0 ? fmtMkShort(months[cmpIdx]) : 'prior avg');
  }

  // ── Debt-to-Asset Ratio card ─────────────────────────────────
  var debtCard = document.getElementById('finDebtCard');
  var debtContent = document.getElementById('finDebtContent');
  if (debtCard && debtContent && ownersBalance && ownersBalance.connected) {
    var db = ownersBalance;
    var dtaTotalLiab = (db.totalLiabilities != null) ? db.totalLiabilities : ((db.currentLiabilities || 0) + (db.longTermLiabilities || 0));
    var dtaTotalAssets = db.totalAssets || ((db.currentAssets || 0) + (db.longTermAssets || 0));
    var dtaRatio = (dtaTotalAssets > 0) ? dtaTotalLiab / dtaTotalAssets : null;
    var dtaPct   = dtaRatio != null ? (dtaRatio * 100) : null;

    if (dtaPct != null && dtaTotalAssets > 0) {
      debtCard.style.display = '';
      var dtaCls   = dtaPct < 40 ? 'dta-green' : dtaPct < 70 ? 'dta-yellow' : 'dta-red';
      var dtaLabel = dtaPct < 40 ? 'Low leverage — strong position' : dtaPct < 70 ? 'Moderate leverage — watch it' : 'High leverage — reduce debt';
      var dtaColor = dtaPct < 40 ? '#12A071' : dtaPct < 70 ? '#C9820A' : '#E5484D';
      var dtaBarW  = Math.min(dtaPct, 100).toFixed(1);

      debtContent.innerHTML =
        '<div class="dta-header">' +
          '<div>' +
            '<div class="fin-chart-title" style="margin-bottom:2px">Debt-to-Asset Ratio</div>' +
            '<div style="font-size:11px;color:#888">How much of everything we own is financed by debt. Lower = more financially secure.</div>' +
          '</div>' +
          '<div class="dta-big" style="color:' + dtaColor + '">' + dtaPct.toFixed(1) + '%</div>' +
        '</div>' +

        // Gauge bar
        '<div class="dta-gauge-wrap">' +
          '<div class="dta-gauge-track">' +
            '<div class="dta-gauge-fill" style="width:' + dtaBarW + '%;background:' + dtaColor + '"></div>' +
            // Zone markers
            '<div class="dta-gauge-mark" style="left:40%"><span class="dta-gauge-mark-lbl">40%</span></div>' +
            '<div class="dta-gauge-mark" style="left:70%"><span class="dta-gauge-mark-lbl">70%</span></div>' +
          '</div>' +
          '<div class="dta-gauge-zones">' +
            '<span style="color:#12A071;font-weight:600">Healthy</span>' +
            '<span style="color:#C9820A;font-weight:600">Moderate</span>' +
            '<span style="color:#E5484D;font-weight:600">High Risk</span>' +
          '</div>' +
        '</div>' +

        // Status + breakdown
        '<div class="dta-status ' + dtaCls + '">' + dtaLabel + '</div>' +
        '<div class="dta-row-group">' +
          '<div class="dta-row">' +
            '<div class="dta-row-label">Total Assets<span class="dta-row-sub">Everything the business owns</span></div>' +
            '<div class="dta-row-val">' + fmtDollar(dtaTotalAssets) + '</div>' +
          '</div>' +
          '<div class="dta-row dta-row--debt">' +
            '<div class="dta-row-label"><span class="dta-row-op">&minus;</span>Total Liabilities<span class="dta-row-sub">All debt — short + long-term</span></div>' +
            '<div class="dta-row-val" style="color:#E5484D">\u2212' + fmtDollar(dtaTotalLiab) + '</div>' +
          '</div>' +
          '<div class="dta-row dta-row--equity">' +
            '<div class="dta-row-label"><span class="dta-row-op">=</span>Owner\'s Equity<span class="dta-row-sub">What you actually own outright</span></div>' +
            '<div class="dta-row-val" style="color:' + (dtaTotalAssets - dtaTotalLiab >= 0 ? '#12A071' : '#E5484D') + '">' + fmtDollar(dtaTotalAssets - dtaTotalLiab) + '</div>' +
          '</div>' +
        '</div>';
    } else {
      debtCard.style.display = 'none';
    }
  } else if (debtCard) {
    debtCard.style.display = 'none';
  }

  // ── Cash / Working Capital ───────────────────────────────────
  if (ownersBalance && ownersBalance.connected) {
    var b = ownersBalance;
    var cash       = b.cash || 0;
    var curAssets  = b.currentAssets || 0;
    var curLiab    = b.currentLiabilities || 0;
    var ltDebt     = b.longTermLiabilities || 0;
    var totalLiab  = (b.totalLiabilities != null) ? b.totalLiabilities : (curLiab + ltDebt);
    var totalAssets = b.totalAssets || (curAssets + (b.longTermAssets || 0));
    var equity     = totalAssets - totalLiab;
    var creditCards  = b.creditCards || 0;
    var payrollLiabs = b.payrollLiabilities || 0;
    var otherCurLiab = Math.max(curLiab - creditCards - payrollLiabs, 0);
    var bankAccts    = b.bankAccounts || [];
    var cardAccts    = b.creditCardAccts || [];
    var notesAccts   = b.notesPayable || [];

    // Cash runway: cash ÷ monthly overhead
    var monthlyBurn = curOvhd > 0 ? curOvhd : null;
    var runway      = monthlyBurn ? cash / monthlyBurn : null;
    var runwayCls   = runway == null ? 'bs-warn' : runway >= 3 ? 'bs-green' : runway >= 1.5 ? 'bs-yellow' : 'bs-red';
    var runwayMsg   = runway == null ? 'Connect overhead data for runway estimate' :
      runway >= 3   ? 'You can weather a slow quarter with ease' :
      runway >= 1.5 ? 'Moderate cushion \u2014 aim to build toward 3 months' :
                      'Thin cushion \u2014 prioritize growing cash reserves';

    // Debt urgency: credit cards first (high interest), then structured loans
    var debtUrgent     = creditCards;
    var debtStructured = ltDebt;
    var debtOther      = Math.max(totalLiab - creditCards - ltDebt, 0);

    // Leverage ratio
    var leverage = totalAssets > 0 ? totalLiab / totalAssets * 100 : null;
    var levCls   = leverage == null ? 'bs-warn' :
      leverage < 40 ? 'bs-green' : leverage < 70 ? 'bs-yellow' : 'bs-red';
    var levMsg   = leverage == null ? '' :
      leverage < 40 ? 'Low leverage \u2014 you own more than you owe' :
      leverage < 70 ? 'Moderate leverage \u2014 healthy but keep an eye on it' :
                      'High leverage \u2014 reducing debt should be a priority';

    // Helper: account list (expandable)
    function acctList(accounts) {
      if (!accounts || !accounts.length) return '';
      return '<div class="bs-acct-list">' +
        accounts.map(function(a) {
          return '<div class="bs-acct-row">' +
            '<span class="bs-acct-name">' + esc(a.name) + '</span>' +
            '<span class="bs-acct-val">' + fmtDollar(a.balance) + '</span>' +
          '</div>';
        }).join('') +
      '</div>';
    }

    // Helper: a mini stat tile
    function bsTile(label, val, cls, sub) {
      return '<div class="bs-tile' + (cls ? ' ' + cls : '') + '">' +
        '<div class="bs-tile-label">' + label + '</div>' +
        '<div class="bs-tile-val">' + val + '</div>' +
        (sub ? '<div class="bs-tile-sub">' + sub + '</div>' : '') +
      '</div>';
    }

    // ── CARD 1: Cash Runway ─────────────────────────────────────
    var runwayW  = runway != null ? Math.min(runway / 6 * 100, 100).toFixed(1) : '0';
    var bankRows = bankAccts.map(function(a) {
      return '<div class="bs-acct-row">' +
        '<span class="bs-acct-name">' + esc(a.name) + '</span>' +
        '<span class="bs-acct-val">' + fmtDollar(a.balance) + '</span>' +
      '</div>';
    }).join('');
    var runwayCard =
      '<div class="bs-card">' +
        '<div class="bs-card-hd">' +
          '<div>' +
            '<div class="bs-card-title">How Long Can We Run Without Revenue?</div>' +
            '<div class="bs-card-sub">Cash on hand \u00f7 monthly overhead \u2014 how many months you could pay the bills if jobs dried up tomorrow</div>' +
          '</div>' +
          '<div class="bs-hero ' + runwayCls + '">' +
            (runway != null ? runway.toFixed(1) + '<span class="bs-hero-unit">mo</span>' : '\u2014') +
          '</div>' +
        '</div>' +
        // Runway bar (6 months = full)
        '<div class="bs-bar-wrap">' +
          '<div class="bs-bar-track">' +
            '<div class="bs-bar-fill ' + runwayCls + '" style="width:' + runwayW + '%"></div>' +
            '<div class="bs-bar-mark" style="left:50%" title="3 months"><span class="bs-bar-mark-lbl">3 mo</span></div>' +
          '</div>' +
          '<div class="bs-bar-scale"><span>0</span><span>3 months</span><span>6 months</span></div>' +
        '</div>' +
        '<div class="bs-insight ' + runwayCls + '">' + runwayMsg + '</div>' +
        // Expandable account breakdown
        (bankAccts.length > 0 ?
          '<button class="bs-expand-btn" onclick="bsToggle(\'bsBankDetail\')">' +
            '<span>See all ' + bankAccts.length + ' bank accounts</span>' +
            '<span class="bs-chev" id="bsBankChev">\u25be</span>' +
          '</button>' +
          '<div id="bsBankDetail" class="bs-expand-body" hidden>' + bankRows + '</div>'
        : '') +
        // Key stat tiles
        '<div class="bs-tiles">' +
          bsTile('Cash in the bank', fmtDollar(cash), 'bs-tile--cash', 'Business accounts') +
          bsTile('Monthly overhead', monthlyBurn ? fmtDollar(monthlyBurn) : '\u2014', '', 'Fixed running costs') +
          bsTile('Short-term assets', fmtDollar(curAssets), '', 'All current assets') +
        '</div>' +
      '</div>';

    // ── CARD 2: Debt Load ───────────────────────────────────────
    var debtTotalW = totalAssets > 0 ? Math.min(totalLiab / totalAssets * 100, 100).toFixed(1) : '0';
    var cardRows   = cardAccts.map(function(a) {
      return '<div class="bs-acct-row">' +
        '<span class="bs-acct-name">' + esc(a.name) + '</span>' +
        '<span class="bs-acct-val">' + fmtDollar(a.balance) + '</span>' +
      '</div>';
    }).join('');
    var noteRows = notesAccts.map(function(a) {
      return '<div class="bs-acct-row">' +
        '<span class="bs-acct-name">' + esc(a.name) + '</span>' +
        '<span class="bs-acct-val">' + fmtDollar(a.balance) + '</span>' +
      '</div>';
    }).join('');

    var debtCard =
      '<div class="bs-card">' +
        '<div class="bs-card-hd">' +
          '<div>' +
            '<div class="bs-card-title">What Are We Paying Interest On?</div>' +
            '<div class="bs-card-sub">Not all debt is equal \u2014 credit cards cost ~20%+ per year, vehicle loans are structured and predictable</div>' +
          '</div>' +
          '<div class="bs-hero bs-red">' + fmtDollar(totalLiab) + '</div>' +
        '</div>' +
        // Stacked debt bars
        '<div class="bs-debt-bars">' +
          (debtUrgent > 0 ?
            '<div class="bs-debt-row">' +
              '<div class="bs-debt-label">' +
                '<span class="bs-debt-tag bs-debt-tag--urgent">Pay first</span>' +
                'Credit cards' +
              '</div>' +
              '<div class="bs-debt-bar-wrap">' +
                '<div class="bs-debt-bar bs-debt-bar--urgent" style="width:' + Math.min(debtUrgent/totalLiab*100,100).toFixed(1) + '%"></div>' +
              '</div>' +
              '<span class="bs-debt-amt">' + fmtDollar(debtUrgent) + '</span>' +
            '</div>' +
            (cardAccts.length > 0 ?
              '<button class="bs-expand-btn" style="margin-top:-4px" onclick="bsToggle(\'bsCardDetail\')">' +
                '<span>See card breakdown</span><span class="bs-chev" id="bsCardChev">\u25be</span></button>' +
              '<div id="bsCardDetail" class="bs-expand-body" hidden>' + cardRows + '</div>'
            : '')
          : '') +
          (payrollLiabs > 0 ?
            '<div class="bs-debt-row">' +
              '<div class="bs-debt-label">' +
                '<span class="bs-debt-tag bs-debt-tag--payroll">Payroll</span>' +
                'Payroll liabilities' +
              '</div>' +
              '<div class="bs-debt-bar-wrap">' +
                '<div class="bs-debt-bar bs-debt-bar--payroll" style="width:' + Math.min(payrollLiabs/totalLiab*100,100).toFixed(1) + '%"></div>' +
              '</div>' +
              '<span class="bs-debt-amt">' + fmtDollar(payrollLiabs) + '</span>' +
            '</div>'
          : '') +
          (debtStructured > 0 ?
            '<div class="bs-debt-row">' +
              '<div class="bs-debt-label">' +
                '<span class="bs-debt-tag bs-debt-tag--structured">Structured</span>' +
                'Vehicle &amp; equipment loans' +
              '</div>' +
              '<div class="bs-debt-bar-wrap">' +
                '<div class="bs-debt-bar bs-debt-bar--structured" style="width:' + Math.min(debtStructured/totalLiab*100,100).toFixed(1) + '%"></div>' +
              '</div>' +
              '<span class="bs-debt-amt">' + fmtDollar(debtStructured) + '</span>' +
            '</div>' +
            (noteRows ?
              '<button class="bs-expand-btn" style="margin-top:-4px" onclick="bsToggle(\'bsNoteDetail\')">' +
                '<span>See loan breakdown</span><span class="bs-chev" id="bsNoteChev">\u25be</span></button>' +
              '<div id="bsNoteDetail" class="bs-expand-body" hidden>' + noteRows + '</div>'
            : '')
          : '') +
        '</div>' +
        // Decision insight
        (debtUrgent > 0 ?
          '<div class="bs-insight bs-red">Credit cards cost ~20% per year in interest. ' +
          'Paying off ' + fmtDollar(debtUrgent) + ' would save roughly ' +
          fmtDollar(Math.round(debtUrgent * 0.20)) + ' per year.</div>'
        : '<div class="bs-insight bs-green">No high-interest credit card debt \u2014 great position.</div>') +
      '</div>';

    // ── CARD 3: Business Net Worth ──────────────────────────────
    var assetBarW = 100;
    var debtBarW  = totalAssets > 0 ? Math.min(totalLiab / totalAssets * 100, 100).toFixed(1) : 0;
    var equityBarW = totalAssets > 0 ? Math.max((equity / totalAssets * 100), 0).toFixed(1) : 0;

    var worthCard =
      '<div class="bs-card bs-card--worth">' +
        '<div class="bs-card-hd">' +
          '<div>' +
            '<div class="bs-card-title">What the Business Is Actually Worth</div>' +
            '<div class="bs-card-sub">If you sold everything and paid off all debt today, this is what you\u2019d walk away with</div>' +
          '</div>' +
          '<div class="bs-hero ' + (equity >= 0 ? 'bs-green' : 'bs-red') + '">' + fmtDollar(equity) + '</div>' +
        '</div>' +
        // Stacked asset bar: equity + debt = total assets
        '<div class="bs-worth-bar-wrap">' +
          '<div class="bs-worth-track">' +
            '<div class="bs-worth-equity" style="width:' + equityBarW + '%"></div>' +
            '<div class="bs-worth-debt" style="width:' + debtBarW + '%"></div>' +
          '</div>' +
          '<div class="bs-worth-key">' +
            '<span><span class="bs-worth-dot bs-worth-dot--equity"></span>Owner\u2019s equity ' + fmtDollar(equity) + '</span>' +
            '<span><span class="bs-worth-dot bs-worth-dot--debt"></span>Debt ' + fmtDollar(totalLiab) + '</span>' +
            '<span style="color:#aaa;font-size:11px">= Total assets ' + fmtDollar(totalAssets) + '</span>' +
          '</div>' +
        '</div>' +
        // Leverage insight
        (leverage != null ?
          '<div class="bs-insight ' + levCls + '">' +
            '<strong>' + leverage.toFixed(0) + '% of assets are financed by debt.</strong> ' + levMsg +
          '</div>'
        : '') +
        // Formula row
        '<div class="bs-formula">' +
          '<div class="bs-formula-item">' +
            '<div class="bs-formula-label">Total Assets</div>' +
            '<div class="bs-formula-val">' + fmtDollar(totalAssets) + '</div>' +
          '</div>' +
          '<div class="bs-formula-op">\u2212</div>' +
          '<div class="bs-formula-item">' +
            '<div class="bs-formula-label">Total Debt</div>' +
            '<div class="bs-formula-val" style="color:#E5484D">' + fmtDollar(totalLiab) + '</div>' +
          '</div>' +
          '<div class="bs-formula-op">=</div>' +
          '<div class="bs-formula-item bs-formula-item--result">' +
            '<div class="bs-formula-label">Owner\u2019s Equity</div>' +
            '<div class="bs-formula-val ' + (equity >= 0 ? 'bs-green' : 'bs-red') + '">' + fmtDollar(equity) + '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.getElementById('finCash').innerHTML = runwayCard + debtCard + worthCard;
    document.getElementById('cashSubtitle').textContent = 'as of ' + b.asOf;
  } else {
    document.getElementById('finCash').innerHTML =
      '<div style="padding:2rem;text-align:center;color:#aaa;font-size:15px">Balance sheet data unavailable.</div>';
    document.getElementById('cashSubtitle').textContent = '';
  }

  // ── Trend lines ──────────────────────────────────────────────
  var TREND_SERIES = [
    { key: 'gm',    label: 'Gross Margin %',    color: '#12A071', data: gmArr,    goal: 50 },
    { key: 'tl',    label: 'Tech Labor %',       color: '#FF9500', data: tlArr,    goal: 25 },
    { key: 'parts', label: 'Parts %',            color: '#FF6B35', data: partsArr, goal: 25 },
    { key: 'admin', label: 'Admin & Office %',   color: '#8b5cf6', data: adminArr, goal: null },
    { key: 'om',    label: 'Operating Margin %', color: '#4A90D9', data: noiArr,   goal: 15 }
  ];
  _trendSeries = TREND_SERIES; // cache for selectTrendLine

  // Build trend toggle buttons (single-select)
  var togHtml = TREND_SERIES.map(function(s) {
    var on = trendActive === s.key ? ' on' : '';
    return '<button class="fin-trend-btn' + on + '" data-key="' + s.key + '" style="color:' + s.color + '" onclick="selectTrendLine(this)">' + esc(s.label) + '</button>';
  }).join('');
  document.getElementById('trendToggles').innerHTML = togHtml;

  if (trendChartInst) trendChartInst.destroy();
  var tCtx = document.getElementById('trendChart').getContext('2d');
  var mLabels = months.map(function(mk) {
    var p = mk.split('-'); return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(p[1])-1] + ' ' + p[0].slice(2);
  });
  var tDatasets = [];
  TREND_SERIES.forEach(function(s) {
    tDatasets.push({
      label: s.label, data: s.data, borderColor: s.color,
      backgroundColor: s.color + '18',
      borderWidth: 2, pointRadius: 3, pointHoverRadius: 5,
      tension: 0.3, hidden: trendActive !== s.key,
      fill: false
    });
  });
  // Goal-line datasets — solid slate, no dash, one per series
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

    // Colour each bar: highlighted blue for the most recent month, teal for history
    var cfColors = cfBal.map(function(v, i) {
      return (bsStart + i) === bsEnd ? '#1d4ed8' : '#3b82f6';
    });

    if (cfBarChartInst) cfBarChartInst.destroy();
    var cfCtx = document.getElementById('cfBarChart').getContext('2d');
    cfBarChartInst = new Chart(cfCtx, {
      type: 'bar',
      data: {
        labels: cfLabels,
        datasets: [{
          data: cfBal,
          backgroundColor: cfColors,
          borderRadius: 4,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: function(items) { return items[0].label; },
              label: function(ctx) {
                return 'Bank balance: ' + fmtDollar(ctx.parsed.y);
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, maxRotation: 45 } },
          y: {
            ticks: { callback: function(v) { return fmtDollar(v); }, font: { size: 10 } },
            grid: { color: '#f0f0f0' }
          }
        }
      }
    });
    document.getElementById('cfSubtitle').textContent = cfMonths.length + ' months';

    // ── Drivers: trailing 12 vs prior 12 (P&L based) ────────────
    var dr12End   = months.length - 1;
    var dr12Start = Math.max(0, dr12End - 11);
    var drPrEnd   = dr12Start - 1;
    var drPrStart = Math.max(0, drPrEnd - 11);
    var hasPrior  = drPrEnd >= 0 && drPrEnd >= drPrStart;

    function sumSlice(arr, s, e) {
      var t = 0;
      for (var i = s; i <= e && i < arr.length; i++) t += arr[i] || 0;
      return t;
    }

    var cfDriversEl = document.getElementById('cfDrivers');
    if (hasPrior) {
      var lastLabel  = fmtMkShort(months[dr12Start]) + '\u2013' + fmtMkShort(months[dr12End]);
      var priorLabel = fmtMkShort(months[drPrStart]) + '\u2013' + fmtMkShort(months[drPrEnd]);

      var drvRows = [
        { label: 'Revenue',          arr: revenue,  inv: false },
        { label: 'Cost of Goods Sold', arr: cogs,   inv: true  },
        { label: 'Overhead',         arr: totalExp, inv: true  },
        { label: 'Operating Profit', arr: noi,      inv: false, highlight: true }
      ];

      var drHeadHtml =
        '<div class="cf-drivers-head">' +
          '<span></span>' +
          '<span>' + lastLabel + '</span>' +
          '<span class="cf-hide-mobile">' + priorLabel + '</span>' +
          '<span>Change</span>' +
        '</div>';

      var drRowsHtml = drvRows.map(function(dr) {
        var last12  = sumSlice(dr.arr, dr12Start, dr12End);
        var prior12 = sumSlice(dr.arr, drPrStart, drPrEnd);
        var d       = last12 - prior12;
        var pct     = prior12 !== 0 ? d / Math.abs(prior12) * 100 : 0;
        var isGood  = dr.inv ? d <= 0 : d >= 0;
        var cls     = isGood ? 'pos' : 'neg';
        var arrow   = d >= 0 ? '\u25b2' : '\u25bc';
        var sign    = d >= 0 ? '+' : '';
        return '<div class="cf-driver-row' + (dr.highlight ? ' highlight' : '') + '">' +
          '<span class="cf-drv-label">' + esc(dr.label) + '</span>' +
          '<span class="cf-drv-val">' + fmtDollar(last12) + '</span>' +
          '<span class="cf-drv-val muted cf-hide-mobile">' + fmtDollar(prior12) + '</span>' +
          '<span class="cf-drv-chg ' + cls + '">' + arrow + ' ' + sign + fmtDollar(Math.abs(d)) +
            (prior12 !== 0 ? ' (' + sign + pct.toFixed(0) + '%)' : '') + '</span>' +
        '</div>';
      }).join('');

      cfDriversEl.innerHTML =
        '<div class="cf-drivers-title">What\u2019s Moving Operating Profit \u2014 Trailing 12 vs. Prior 12 months</div>' +
        drHeadHtml + drRowsHtml;
    } else if (months.length > 1) {
      cfDriversEl.innerHTML =
        '<div style="font-size:13px;color:#aaa;padding:14px 0">Not enough P&amp;L history for a year-over-year comparison &mdash; need at least 24 months of data.</div>';
    } else {
      cfDriversEl.innerHTML = '';
    }
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
    html +=
      '<div class="tcl-item">' +
        '<span class="tcl-swatch tcl-swatch--target"></span>' +
        '<span class="tcl-label" style="color:#94a3b8">Target ' + active.goal + '%</span>' +
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

// ════════════════════════════════════════════════════════════════════════════
// ── GROWTH DECISION CARDS
// ════════════════════════════════════════════════════════════════════════════

// Fetch growth metrics from API
async function fetchGrowthMetrics() {
  try {
    var response = await fetch('/api/growth-metrics');
    var data = await response.json();
    if (!response.ok) {
      console.error('Growth metrics error:', data);
      return false;
    }
    growthMetrics = data;
    renderGrowthCards();
    return true;
  } catch (err) {
    console.error('Failed to fetch growth metrics:', err);
    return false;
  }
}

// Main rendering function for all growth cards
function renderGrowthCards() {
  if (!growthMetrics) return;

  var section = document.getElementById('growthSection');
  if (!section) return;

  // Only show if we have some data connected
  if (!growthMetrics.connected || !growthMetrics.monthlyRevenue.length) {
    section.style.display = 'none';
    return;
  }

  section.style.display = '';

  // Render each section
  renderGrowthKpiRow();
  renderGrowthReadiness();
  renderGrowthHiring();
  renderGrowthVan();
  renderGrowthTool();
  renderGrowthForecast();
}

// KPI Row — top metrics
function renderGrowthKpiRow() {
  var el = document.getElementById('growthKpiRow');
  if (!el || !growthMetrics) return;

  var cash = (ownersBalance && ownersBalance.cash) || 0;
  var agc = growthMetrics.availableGrowthCash || 0;
  var emergencyReserve = Math.round((ownersBalance && ownersBalance.currentAssets) * 0.25 || 0);
  var monthlyOverhead = 0;

  // Extract monthly overhead from ownersData
  if (ownersData && ownersData.accounts && ownersData.accounts['Operating Expenses']) {
    var expenseData = ownersData.accounts['Operating Expenses'];
    var lastMonth = (ownersData.months || [])[ownersData.months.length - 1];
    if (lastMonth && expenseData[lastMonth]) {
      monthlyOverhead = Math.round(expenseData[lastMonth]);
    }
  }

  var monthsPayroll = monthlyOverhead > 0 ? Math.round(cash / monthlyOverhead * 10) / 10 : 0;
  var gcs = growthMetrics.growthCapacityScore || 0;

  var kpis = [
    { label: 'Cash on Hand', value: fmtDollar(cash), icon: '💰' },
    { label: 'Available to Invest', value: fmtDollar(agc), icon: '📈' },
    { label: 'Emergency Reserve', value: fmtDollar(emergencyReserve), icon: '🛡️' },
    { label: 'Months Payroll', value: monthsPayroll + 'mo', icon: '⏱️' },
    { label: 'Growth Capacity Score', value: gcs + '/100', icon: '⭐' }
  ];

  el.innerHTML = '<div class="growth-kpi-items">' +
    kpis.map(function(k) {
      return '<div class="growth-kpi-item">' +
        '<span class="growth-kpi-icon">' + k.icon + '</span>' +
        '<div class="growth-kpi-content">' +
          '<div class="growth-kpi-label">' + k.label + '</div>' +
          '<div class="growth-kpi-value">' + k.value + '</div>' +
        '</div>' +
      '</div>';
    }).join('') +
    '</div>';
}

// Growth Readiness Meter
function renderGrowthReadiness() {
  var el = document.getElementById('growthReadinessContent');
  if (!el || !growthMetrics) return;

  var agc = growthMetrics.availableGrowthCash || 0;
  var score = growthMetrics.growthCapacityScore || 0;

  var readyCls = score >= 70 ? 'growth-ready-excellent' : score >= 50 ? 'growth-ready-good' : 'growth-ready-building';
  var readyMsg = score >= 70 ? '🚀 Ready to scale' : score >= 50 ? '📈 Good momentum' : '🌱 Building foundation';

  el.innerHTML =
    '<div class="growth-readiness-header">' +
      '<div class="fin-chart-title">Growth Readiness Meter</div>' +
      '<div style="font-size:11px;color:#888">Your capacity to add capacity — hiring, equipment, vans.</div>' +
    '</div>' +
    '<div class="growth-readiness-body">' +
      '<div class="growth-readiness-meter">' +
        '<div class="growth-readiness-bar">' +
          '<div class="growth-readiness-fill" style="width:' + score + '%"></div>' +
          '<div class="growth-readiness-labels">' +
            '<span>Building</span>' +
            '<span>Scaling</span>' +
            '<span>Firing</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="growth-readiness-score ' + readyCls + '">' +
        '<div class="growth-readiness-big">' + score + '/100</div>' +
        '<div class="growth-readiness-msg">' + readyMsg + '</div>' +
      '</div>' +
      '<div class="growth-readiness-facts">' +
        '<div class="growth-readiness-fact">' +
          '<span class="growth-readiness-fact-label">Available to invest:</span>' +
          '<span class="growth-readiness-fact-value">' + fmtDollar(agc) + '/month</span>' +
        '</div>' +
        '<div class="growth-readiness-fact">' +
          '<span class="growth-readiness-fact-label">Active technicians:</span>' +
          '<span class="growth-readiness-fact-value">' + (growthMetrics.technicians.length || 0) + '</span>' +
        '</div>' +
        '<div class="growth-readiness-fact">' +
          '<span class="growth-readiness-fact-label">Revenue per tech:</span>' +
          '<span class="growth-readiness-fact-value">' + fmtDollar(growthMetrics.revenuePerTech || 0) + '/mo</span>' +
        '</div>' +
      '</div>' +
    '</div>';
}

// Technician Hiring Card
function renderGrowthHiring() {
  var el = document.getElementById('growthHiringContent');
  if (!el || !growthMetrics) return;

  var revPerTech = growthMetrics.revenuePerTech || 35000;
  var techSalaryRate = 0.30; // 30% of revenue
  var avgTechSalary = revPerTech * techSalaryRate;
  var rampMonths = 8;
  var avgMonthlyCost = avgTechSalary / 12;

  var newTechCount = growthInteractiveData.newTechCount || 1;
  var totalNewCost = avgMonthlyCost * newTechCount;
  var paybackMonths = revPerTech > 0 ? (totalNewCost * rampMonths / revPerTech) : 0;

  el.innerHTML =
    '<div class="growth-card-title">Technician Hiring</div>' +
    '<div class="growth-card-sub">How many new techs can you afford?</div>' +
    '<div class="growth-card-form">' +
      '<label>New technicians to hire:' +
        '<input type="number" min="1" max="5" value="' + newTechCount + '" ' +
          'onchange="growthInteractiveData.newTechCount = parseInt(this.value); renderGrowthCards()">' +
      '</label>' +
    '</div>' +
    '<div class="growth-card-metrics">' +
      '<div class="growth-card-metric">' +
        '<span class="growth-card-metric-label">Avg tech salary (ramp):</span>' +
        '<span class="growth-card-metric-value">' + fmtDollar(avgMonthlyCost) + '/mo</span>' +
      '</div>' +
      '<div class="growth-card-metric">' +
        '<span class="growth-card-metric-label">Cost for ' + newTechCount + ' new tech' + (newTechCount !== 1 ? 's' : '') + ':</span>' +
        '<span class="growth-card-metric-value">' + fmtDollar(totalNewCost) + '/mo</span>' +
      '</div>' +
      '<div class="growth-card-metric">' +
        '<span class="growth-card-metric-label">Payback period:</span>' +
        '<span class="growth-card-metric-value">' + paybackMonths.toFixed(1) + ' months</span>' +
      '</div>' +
      '<div class="growth-card-metric">' +
        '<span class="growth-card-metric-label">Revenue potential:</span>' +
        '<span class="growth-card-metric-value">' + fmtDollar(revPerTech * newTechCount) + '/mo</span>' +
      '</div>' +
    '</div>' +
    '<div class="growth-card-insight">' +
      'New techs take ~8 months to ramp to full productivity. ' +
      'You\'ll break even in ' + paybackMonths.toFixed(0) + ' months if they hit targets.' +
    '</div>';
}

// Van Readiness Card
function renderGrowthVan() {
  var el = document.getElementById('growthVanContent');
  if (!el || !growthMetrics) return;

  var curTechs = growthMetrics.technicians.length || 1;
  var curVans = growthMetrics.vans || 1;
  var newVanCount = growthInteractiveData.newVanCount || 1;
  var techsPerVan = 2.5;
  var vanCost = 35000; // Rough estimate
  var monthlyVanExpense = vanCost / 60; // 5-year depreciation + insurance + maintenance

  var techsAfterHire = curTechs + (growthInteractiveData.newTechCount || 0);
  var optimalVans = Math.ceil(techsAfterHire / techsPerVan);
  var vanGap = Math.max(0, optimalVans - curVans);

  el.innerHTML =
    '<div class="growth-card-title">Van Readiness</div>' +
    '<div class="growth-card-sub">Do you need another van?</div>' +
    '<div class="growth-card-metrics">' +
      '<div class="growth-card-metric">' +
        '<span class="growth-card-metric-label">Current techs:</span>' +
        '<span class="growth-card-metric-value">' + curTechs + '</span>' +
      '</div>' +
      '<div class="growth-card-metric">' +
        '<span class="growth-card-metric-label">Current vans:</span>' +
        '<span class="growth-card-metric-value">' +  curVans + '</span>' +
      '</div>' +
      '<div class="growth-card-metric">' +
        '<span class="growth-card-metric-label">Techs per van:</span>' +
        '<span class="growth-card-metric-value">' + techsPerVan.toFixed(1) + '</span>' +
      '</div>' +
      '<div class="growth-card-metric ' + (vanGap > 0 ? 'growth-card-metric-warn' : '') + '">' +
        '<span class="growth-card-metric-label">Capacity gap:</span>' +
        '<span class="growth-card-metric-value">' + vanGap + ' van' + (vanGap !== 1 ? 's' : '') + ' needed</span>' +
      '</div>' +
    '</div>' +
    '<div class="growth-card-insight">' +
      'At ' + techsAfterHire + ' techs, you need ~' + optimalVans + ' vans. ' +
      (vanGap > 0 ? 'Consider adding ' + vanGap + ' van' + (vanGap !== 1 ? 's' : '') + ' as you scale.' : 'You\'re well-equipped for current team.') +
    '</div>';
}

// Tool Purchase Card
function renderGrowthTool() {
  var el = document.getElementById('growthToolContent');
  if (!el || !growthMetrics) return;

  var tools = [
    { name: 'Sewer Camera', cost: 8000, monthlyROI: 1200, desc: 'Early problem detection' },
    { name: 'Jetter Machine', cost: 15000, monthlyROI: 2000, desc: 'Upsell drain cleaning' },
    { name: 'Water Heater Tools', cost: 5000, monthlyROI: 800, desc: 'Faster installs' }
  ];

  var selectedTool = tools[0];
  var payback = selectedTool.cost / selectedTool.monthlyROI;

  el.innerHTML =
    '<div class="growth-card-title">Tool Investment</div>' +
    '<div class="growth-card-sub">Which tool boosts your revenue fastest?</div>' +
    '<div class="growth-card-tools">' +
      tools.map(function(t, idx) {
        return '<button class="growth-card-tool-btn' + (idx === 0 ? ' active' : '') + '" onclick="selectGrowthTool(this)" data-tool="' + esc(t.name) + '" data-cost="' + t.cost + '">' +
          '<div class="growth-card-tool-name">' + t.name + '</div>' +
          '<div class="growth-card-tool-cost">' + fmtDollar(t.cost) + '</div>' +
          '<div class="growth-card-tool-desc">' + t.desc + '</div>' +
        '</button>';
      }).join('') +
    '</div>' +
    '<div class="growth-card-metrics">' +
      '<div class="growth-card-metric">' +
        '<span class="growth-card-metric-label">Investment:</span>' +
        '<span class="growth-card-metric-value">' + fmtDollar(selectedTool.cost) + '</span>' +
      '</div>' +
      '<div class="growth-card-metric">' +
        '<span class="growth-card-metric-label">Est. monthly revenue:</span>' +
        '<span class="growth-card-metric-value">' + fmtDollar(selectedTool.monthlyROI) + '</span>' +
      '</div>' +
      '<div class="growth-card-metric">' +
        '<span class="growth-card-metric-label">Payback period:</span>' +
        '<span class="growth-card-metric-value">' + payback.toFixed(1) + ' months</span>' +
      '</div>' +
    '</div>' +
    '<div class="growth-card-insight">' +
      'Payoff in ' + payback.toFixed(0) + ' months if you hit estimated revenue targets.' +
    '</div>';
}

// Toggle tool selection
function selectGrowthTool(btn) {
  var btns = btn.parentElement.querySelectorAll('.growth-card-tool-btn');
  btns.forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  growthInteractiveData.toolInvestment = parseInt(btn.dataset.cost) || 5000;
  renderGrowthCards();
}

// 6-Month Cash Forecast
function renderGrowthForecast() {
  var el = document.getElementById('growthForecastControls');
  var chartEl = document.getElementById('growthForecastChart');
  if (!el || !chartEl || !growthMetrics) return;

  // Build scenario toggles
  var scenarios = [
    { key: 'doNothing', label: 'Do Nothing', color: '#94a3b8' },
    { key: 'hireTech', label: 'Hire 1 Tech', color: '#10b981' },
    { key: 'buyVan', label: 'Buy 1 Van', color: '#3b82f6' },
    { key: 'buyTool', label: 'Buy a Tool', color: '#f59e0b' }
  ];

  el.innerHTML = '<div class="growth-forecast-toggle-group">' +
    scenarios.map(function(s) {
      var isActive = growthInteractiveData.selectedScenarios[s.key];
      return '<button class="growth-forecast-toggle ' + (isActive ? 'active' : '') + '" ' +
        'onclick="toggleGrowthScenario(\'' + s.key + '\')" ' +
        'style="border-color:' + s.color + ';' + (isActive ? 'background:' + s.color + ';color:#fff' : 'color:' + s.color) + '">' +
        s.label +
      '</button>';
    }).join('') +
    '</div>';

  // Build forecast data for each active scenario
  var months = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'];
  var baseMonthly = (growthMetrics.monthlyRevenue && growthMetrics.monthlyRevenue.slice(-1)[0]) || 100000;

  function buildScenarioData(scenario) {
    var data = [];
    for (var i = 0; i < 6; i++) {
      var revenue = baseMonthly;
      if (scenario === 'doNothing') {
        revenue = baseMonthly * (1 + i * 0.02); // 2%/month organic
      } else if (scenario === 'hireTech') {
        // New tech takes 8 months to ramp; partial contribution
        var ramped = Math.min(1, (i + 1) / 8);
        revenue = baseMonthly * (1 + (i + 1) * 0.02 + ramped * 0.15); // 15% potential from new tech
      } else if (scenario === 'buyVan') {
        revenue = baseMonthly * (1 + (i + 1) * 0.03); // Van enables dispatching = 3% boost
      } else if (scenario === 'buyTool') {
        revenue = baseMonthly * (1 + (i + 1) * 0.08); // Tool upsells = 8% boost
      }
      data.push(Math.round(revenue));
    }
    return data;
  }

  var datasets = scenarios.filter(function(s) {
    return growthInteractiveData.selectedScenarios[s.key];
  }).map(function(s) {
    return {
      label: s.label,
      data: buildScenarioData(s.key),
      borderColor: s.color,
      backgroundColor: 'transparent',
      borderWidth: 3,
      pointRadius: 3,
      pointBackgroundColor: s.color,
      tension: 0.3
    };
  });

  if (growthForecastChartInst) growthForecastChartInst.destroy();
  growthForecastChartInst = new Chart(chartEl, {
    type: 'line',
    data: { labels: months, datasets: datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { usePointStyle: true, padding: 15 } },
        tooltip: {
          callbacks: {
            label: function(ctx) { return ctx.dataset.label + ': ' + fmtDollar(ctx.parsed.y); }
          }
        }
      },
      scales: {
        x: { grid: { display: false } },
        y: { ticks: { callback: function(v) { return fmtDollar(v); } } }
      }
    }
  });
}

// Toggle scenario in forecast
function toggleGrowthScenario(key) {
  growthInteractiveData.selectedScenarios[key] = !growthInteractiveData.selectedScenarios[key];
  // Ensure at least one is selected
  if (!Object.values(growthInteractiveData.selectedScenarios).some(v => v)) {
    growthInteractiveData.selectedScenarios.doNothing = true;
  }
  renderGrowthCards();
}
