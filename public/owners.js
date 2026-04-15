// ── Location Owners / Financial Tab ────────────────────────────
var ownersData = null;
var finMode = 'dollar'; // 'dollar' | 'pct'
var finMonth = null;    // YYYY-MM currently selected
var finCompare = 'prior_year_month'; // prior_month | prior_year_month | prior_year_avg | none
var ownersBalance = null;
var donutChartInst = null;
var trendChartInst = null;
var cfBarChartInst = null;
var cbLineChartInst = null;
var ownersCashHistory = null;
var trendActive = 'gm'; // single-select key-ratio trend line

// Toggle expandable detail panel in the money-flow card
function mfToggle(panelId, btn) {
  var panel = document.getElementById(panelId);
  if (!panel) return;
  var nowOpen = panel.hidden;
  panel.hidden = !nowOpen;
  var chev = btn && btn.querySelector('.mf-op-chev');
  if (chev) chev.textContent = nowOpen ? '\u25b4' : '\u25be';
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

async function fetchOwnersData(force) {
  if (ownersData && !force) return;
  document.getElementById('finCards').innerHTML =
    '<div style="text-align:center;padding:3rem;color:#aaa;font-size:14px;grid-column:1/-1">Loading financial data\u2026</div>';
  document.getElementById('finPnlCard').style.display = 'none';
  document.getElementById('finRow2').style.display = 'none';
  document.getElementById('finRow3').style.display = 'none';
  document.getElementById('finTrendCard').style.display = 'none';
  document.getElementById('finCashFlowCard').style.display = 'none';
  document.getElementById('finCashBalCard').style.display = 'none';
  try {
    var [finResp, balResp, cashHistResp] = await Promise.all([
      fetch('/api/owners-financial').then(function(r){return r.json();}).catch(function(){return{connected:false,reason:'error'};}),
      fetch('/api/qbo-balance').then(function(r){return r.json();}).catch(function(){return{connected:false};}),
      fetch('/api/qbo-cash-history').then(function(r){return r.json();}).catch(function(){return{connected:false};})
    ]);
    ownersData = finResp;
    ownersBalance = balResp;
    ownersCashHistory = cashHistResp;
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
    document.getElementById('finCashBalCard').style.display = 'none';
    return;
  }

  var months = ownersData.months || [];
  if (!months.length) return;

  // ── Populate month picker (most-recent first) ───────────────
  var sel = document.getElementById('finMonthSel');
  if (sel.children.length !== months.length) {
    sel.innerHTML = months.slice().reverse().map(function(m) {
      return '<option value="' + m + '">' + fmtMk(m) + '</option>';
    }).join('');
  }
  if (!finMonth || months.indexOf(finMonth) === -1) {
    finMonth = months[months.length - 1];
  }
  sel.value = finMonth;

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
  function mfProgressBar(pct, targetPct) {
    var fillPct = Math.max(0, Math.min(pct, 100));
    var pinPos  = Math.min(targetPct || 0, 100);
    return '<div class="mf-target-wrap">' +
      '<div class="mf-target-track">' +
        '<div class="mf-target-fill" style="width:' + fillPct.toFixed(1) + '%"></div>' +
        (targetPct ? '<div class="mf-target-pin" style="left:' + pinPos + '%"></div>' : '') +
      '</div>' +
      '<div class="mf-target-legend">' +
        fmtPct(pct) + ' of revenue' +
        (targetPct ? ' &nbsp;<span class="gold">&#9475; Target: ' + targetPct + '%</span>' : '') +
      '</div>' +
    '</div>';
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
        mfDelta(curRev, revenue) +
      '</div>' +

      // ── − Job Costs ───────────────────────────────────────────
      '<div class="mf-op">' +
        '<div class="mf-op-head">' +
          '<div class="mf-op-label"><span class="mf-op-sign">\u2212</span> Job Costs</div>' +
          '<button class="mf-op-btn" onclick="mfToggle(\'mfCogsDetail\',this)">' +
            'details <span class="mf-op-chev">\u25be</span>' +
          '</button>' +
        '</div>' +
        '<div class="mf-op-total">\u2212' + fmtDollar(curCOGS) +
          '<span class="mf-op-total-sub">' + fmtPct(cogsPct) + ' of rev</span></div>' +
        '<div class="mf-op-items" id="mfCogsDetail" hidden>' +
          cogsItems.filter(function(r){return r.val>0;}).map(function(r){return mfCostItem(r.label,r.val,curRev);}).join('') +
        '</div>' +
      '</div>' +

      // ── = Gross Profit ────────────────────────────────────────
      '<div class="mf-step mf-step--gp">' +
        '<div class="mf-step-label"><span class="mf-step-eq">=</span> Gross Profit ' + mfPill('gp', gmPct) + '</div>' +
        '<div class="mf-step-num">' + fmtDollar(curGP) + '</div>' +
        mfProgressBar(gmPct, 50) +
        mfDelta(curGP, gp) +
      '</div>' +

      // ── − Overhead ────────────────────────────────────────────
      '<div class="mf-op">' +
        '<div class="mf-op-head">' +
          '<div class="mf-op-label"><span class="mf-op-sign">\u2212</span> Overhead</div>' +
          '<button class="mf-op-btn" onclick="mfToggle(\'mfOvhdDetail\',this)">' +
            'details <span class="mf-op-chev">\u25be</span>' +
          '</button>' +
        '</div>' +
        '<div class="mf-op-total">\u2212' + fmtDollar(curOvhd) +
          '<span class="mf-op-total-sub">' + fmtPct(ovhdPct) + ' of rev</span></div>' +
        '<div class="mf-op-items" id="mfOvhdDetail" hidden>' +
          ovhdItems.filter(function(r){return r.val>0;}).map(function(r){return mfCostItem(r.label,r.val,curRev);}).join('') +
        '</div>' +
      '</div>' +

      // ── = Operating Profit ────────────────────────────────────
      '<div class="mf-step mf-step--noi">' +
        '<div class="mf-step-label"><span class="mf-step-eq">=</span> Operating Profit ' + mfPill('op', noiPct) + '</div>' +
        '<div class="mf-step-num">' + fmtDollar(curNOI) + '</div>' +
        mfProgressBar(noiPct, 15) +
        mfDelta(curNOI, noi) +
      '</div>' +

    '</div>'; // .mf-card

  document.getElementById('finCards').innerHTML = formulaHtml;

  // Efficiency tiles — share of revenue
  var pctTiles = [
    { label: 'Gross Margin', val: fmtPct(gmPct), sub: 'Healthy: 50% or higher',
      cls: colorClass('gm', gmPct), delta: pctCompare(gmPct, gmArr),
      hint: 'Share of revenue you keep after paying for the work itself.' },
    { label: 'Tech Labor',   val: fmtPct(tlPct), sub: 'Healthy: under 25%',
      cls: colorClass('tl', tlPct), delta: pctCompare(tlPct, tlArr),
      hint: 'Share of every dollar that went to crew wages.' },
    { label: 'Parts',        val: fmtPct(partsPct), sub: 'Healthy: under 25%',
      cls: colorClass('parts', partsPct), delta: pctCompare(partsPct, partsArr),
      hint: 'Share of every dollar that went to materials.' }
  ];
  document.getElementById('finCards2').innerHTML = pctTiles.map(function(c) {
    return '<div class="fin-pct-tile">' +
      '<div class="fin-pct-tile-label">' + esc(c.label) + '</div>' +
      '<div class="fin-pct-tile-value ' + c.cls + '">' + c.val + '</div>' +
      '<div class="fin-pct-tile-sub">' + c.sub + '</div>' +
      (c.delta || '').replace(/fin-card-delta/g, 'fin-pct-tile-delta').replace(/fin-compare-line/g, 'fin-pct-tile-sub') +
      '<div class="fin-pct-tile-hint">' + c.hint + '</div>' +
      '</div>';
  }).join('');
  document.getElementById('finCardsTitle2').style.display = '';

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

  // ── Variance vs. prior year (selected month vs. same month last year) ─
  var pyIdx = curIdx - 12;
  if (pyIdx < 0) {
    document.getElementById('finVariance').innerHTML =
      '<div style="padding:2rem;text-align:center;color:#aaa;font-size:15px">Not enough history — need data from 12 months before ' + fmtMk(finMonth) + '.</div>';
    document.getElementById('varSubtitle').textContent = '';
  } else {
    var pyMonth = months[pyIdx];
    var varLines = [
      { label: 'Revenue', cur: revenue[curIdx], py: revenue[pyIdx], good: 'up', kind: 'top', op: '' },
      { label: 'Cost of Goods Sold', cur: cogs[curIdx], py: cogs[pyIdx], good: 'down', kind: 'indent', op: '\u2212' },
      { label: 'Gross Profit', cur: gp[curIdx], py: gp[pyIdx], good: 'up', kind: 'sub', op: '=' },
      { label: 'Operating Expenses', cur: totalExp[curIdx], py: totalExp[pyIdx], good: 'down', kind: 'indent', op: '\u2212' },
      { label: 'Operating Profit', cur: noi[curIdx], py: noi[pyIdx], good: 'up', kind: 'noi', op: '=' }
    ];
    function deltaParts(l) {
      var d = (l.cur||0) - (l.py||0);
      var pct = l.py ? (d / Math.abs(l.py) * 100) : 0;
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
        '<td>' + fmtDollar(l.py || 0) + '</td>' +
        '<td class="' + p.cls + '">' + p.signStr + fmtDollar(p.d) + '</td>' +
        '<td class="' + p.cls + '">' + (l.py ? p.signStr + p.pct.toFixed(1) + '%' : '—') + '</td>' +
        '</tr>';
    }).join('');
    // Mobile flow — P&L order with big NOI payload
    var varFlow = varLines.map(function(l) {
      var p = deltaParts(l);
      if (l.kind === 'noi') {
        return '<div class="var-flow-row noi">' +
          '<div class="var-noi-lbl">' + (l.op ? l.op + ' ' : '') + 'Operating Profit</div>' +
          '<div class="var-noi-val">' + fmtDollar(l.cur || 0) + '</div>' +
          '<div class="var-noi-vs">vs ' + fmtDollar(l.py || 0) + ' in ' + fmtMkShort(pyMonth) + '</div>' +
          '<div class="var-noi-change ' + p.cls + '">' + (p.d >= 0 ? '▲' : '▼') + ' ' + p.signStr + fmtDollar(p.d) +
            (l.py ? ' (' + p.signStr + p.pct.toFixed(0) + '%)' : '') + '</div>' +
          '</div>';
      }
      var rowCls = l.kind === 'indent' ? 'indent' : (l.kind === 'sub' ? 'sub' : '');
      return '<div class="var-flow-row ' + rowCls + '">' +
        '<span>' + (l.op ? l.op + ' ' : '') + esc(l.label) + ' <span class="var-row-amt">' + fmtDollar(l.cur||0) + '</span></span>' +
        '<span class="var-chg ' + p.cls + '">' + (l.py ? p.signStr + p.pct.toFixed(0) + '%' : '—') + '</span>' +
        '</div>';
    }).join('');
    document.getElementById('finVariance').innerHTML =
      '<div class="var-flow">' + varFlow + '</div>' +
      '<div class="var-table-wrap">' +
      '<table class="var-table"><thead><tr>' +
      '<th>Line item</th><th>This year (' + fmtMkShort(finMonth) + ')</th><th>Last year (' + fmtMkShort(pyMonth) + ')</th>' +
      '<th>Change ($)</th><th>Change (%)</th></tr></thead><tbody>' + varBody + '</tbody></table></div>';
    document.getElementById('varSubtitle').textContent = fmtMkShort(finMonth) + ' vs. ' + fmtMkShort(pyMonth);
  }

  // ── Cash / Working Capital ───────────────────────────────────
  if (ownersBalance && ownersBalance.connected) {
    var b = ownersBalance;
    var cr = b.currentRatio;
    var crCls = cr == null ? '' : (cr >= 1.5 ? 'ok' : cr >= 1.0 ? 'warn' : 'bad');
    var crText = cr == null ? '—' : cr.toFixed(2) + '\u00d7';
    var cash = b.cash || 0;
    var curAssets = b.currentAssets || 0;
    var otherCurAssets = Math.max(curAssets - cash, 0);
    var ap = b.accountsPayable || 0;
    var curLiab = b.currentLiabilities || 0;
    var otherCurLiab = Math.max(curLiab - ap, 0);
    var ltDebt = b.longTermLiabilities || 0;
    var totalLiab = (b.totalLiabilities != null) ? b.totalLiabilities : (curLiab + ltDebt);

    function row(label, sub, value, opts) {
      opts = opts || {};
      var cls = opts.cls ? ' ' + opts.cls : '';
      var op = opts.op ? '<span class="op">' + opts.op + '</span>' : '';
      return '<div class="cash-flow-row' + cls + '">' +
        '<div class="lbl">' + op + '<span>' + label + '</span>' +
        (sub ? '<span class="lbl-sub">' + sub + '</span>' : '') + '</div>' +
        '<div class="val">' + fmtDollar(value) + '</div>' +
        '</div>';
    }

    var haveHtml = '<div class="cash-flow-section">' +
      '<div class="cash-flow-head">What we have</div>' +
      row('Cash in the bank', 'Across all business accounts', cash) +
      row('Other short-term assets', 'Stuff that turns into cash within a year', otherCurAssets, { op: '+' }) +
      row('Short-term assets', 'Total we could pull from in a pinch', curAssets, { op: '=', cls: 'subtotal' }) +
    '</div>';

    var oweHtml = '<div class="cash-flow-section">' +
      '<div class="cash-flow-head">What we owe</div>' +
      row('Bills we owe', 'Unpaid supplier / vendor bills', ap) +
      row('Other due within a year', 'Credit cards, short-term loan payments', otherCurLiab, { op: '+' }) +
      row('Due within a year', 'Everything that has to be paid in 12 months', curLiab, { op: '=', cls: 'subtotal' }) +
      row('Long-term debt', 'Vehicle loans, equipment notes, mortgages', ltDebt, { op: '+' }) +
      row('Everything we owe', 'All debt combined, short + long-term', totalLiab, { op: '=', cls: 'total' }) +
    '</div>';

    var cushionHtml = '<div class="cash-cushion">' +
      '<div class="lbl"><span class="lbl-top">Short-term cushion</span>' +
      '<span class="lbl-sub">Short-term assets \u00f7 Due within a year. Above 1.5\u00d7 = comfortable. Under 1\u00d7 = tight.</span></div>' +
      '<div class="val ' + crCls + '">' + crText + '</div>' +
    '</div>';

    document.getElementById('finCash').innerHTML =
      '<div class="cash-flow">' + haveHtml + oweHtml + '</div>' + cushionHtml;
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
  // Secondary goal-line datasets (dashed, grey) synced 1:1 with main series.
  TREND_SERIES.forEach(function(s) {
    tDatasets.push({
      label: s.label + ' target',
      data: s.goal == null ? [] : months.map(function() { return s.goal; }),
      borderColor: '#D4A017',
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

  // ── Cash Flow over time ──────────────────────────────────────
  var cfCard = document.getElementById('finCashFlowCard');
  if (cfCard && multiMonth) {
    cfCard.style.display = '';

    // Up to 18 months ending at the most recent available month
    var cfEnd   = months.length - 1;
    var cfStart = Math.max(0, cfEnd - 17);
    var cfMonths = months.slice(cfStart, cfEnd + 1);
    var cfNoi    = noi.slice(cfStart, cfEnd + 1);
    var cfLabels = cfMonths.map(function(mk) { return fmtMkShort(mk); });

    // Green for profit, red for loss; highlighted shade for selected month
    var cfColors = cfNoi.map(function(v, i) {
      var isCur = (cfStart + i) === curIdx;
      if (v >= 0) return isCur ? '#0a7a55' : '#12A071';
      return isCur ? '#b91c1c' : '#E5484D';
    });

    if (cfBarChartInst) cfBarChartInst.destroy();
    var cfCtx = document.getElementById('cfBarChart').getContext('2d');
    cfBarChartInst = new Chart(cfCtx, {
      type: 'bar',
      data: {
        labels: cfLabels,
        datasets: [{
          data: cfNoi,
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
                var v = ctx.parsed.y;
                var rev = revenue[cfStart + ctx.dataIndex] || 0;
                var pct = rev > 0 ? ' (' + (v / rev * 100).toFixed(1) + '% of rev)' : '';
                return (v >= 0 ? 'Profit: ' : 'Loss: ') + fmtDollar(v) + pct;
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

    // ── Drivers: trailing 12 vs prior 12 ────────────────────────
    // Use the full data range, not the currently selected month, so it
    // always reflects the most recent full-year picture.
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
        { label: 'Job Costs',        arr: cogs,     inv: true  },
        { label: 'Overhead',         arr: totalExp, inv: true  },
        { label: 'Operating Profit', arr: noi,      inv: false, highlight: true }
      ];

      var headHtml =
        '<div class="cf-drivers-head">' +
          '<span></span>' +
          '<span>' + lastLabel + '</span>' +
          '<span class="cf-hide-mobile">' + priorLabel + '</span>' +
          '<span>Change</span>' +
        '</div>';

      var rowsHtml = drvRows.map(function(row) {
        var last12  = sumSlice(row.arr, dr12Start, dr12End);
        var prior12 = sumSlice(row.arr, drPrStart, drPrEnd);
        var d       = last12 - prior12;
        var pct     = prior12 !== 0 ? d / Math.abs(prior12) * 100 : 0;
        var isGood  = row.inv ? d <= 0 : d >= 0;
        var cls     = isGood ? 'pos' : 'neg';
        var arrow   = d >= 0 ? '\u25b2' : '\u25bc';
        var sign    = d >= 0 ? '+' : '';
        return '<div class="cf-driver-row' + (row.highlight ? ' highlight' : '') + '">' +
          '<span class="cf-drv-label">' + esc(row.label) + '</span>' +
          '<span class="cf-drv-val">' + fmtDollar(last12) + '</span>' +
          '<span class="cf-drv-val muted cf-hide-mobile">' + fmtDollar(prior12) + '</span>' +
          '<span class="cf-drv-chg ' + cls + '">' + arrow + ' ' + sign + fmtDollar(Math.abs(d)) +
            (prior12 !== 0 ? ' (' + sign + pct.toFixed(0) + '%)' : '') + '</span>' +
        '</div>';
      }).join('');

      cfDriversEl.innerHTML =
        '<div class="cf-drivers-title">What\u2019s Moving It \u2014 Trailing 12 vs. Prior 12 months</div>' +
        headHtml + rowsHtml;
    } else {
      cfDriversEl.innerHTML =
        '<div style="font-size:13px;color:#aaa;padding:14px 0">Not enough history for a year-over-year comparison &mdash; need at least 24 months of data.</div>';
    }
  } else if (cfCard) {
    cfCard.style.display = 'none';
  }

  // ── Cash in the Bank over time ───────────────────────────────
  var cbCard = document.getElementById('finCashBalCard');
  var hasHistory = ownersCashHistory && ownersCashHistory.connected &&
                   ownersCashHistory.history && ownersCashHistory.history.length > 1;

  if (cbCard && hasHistory) {
    cbCard.style.display = '';

    var hist = ownersCashHistory.history.filter(function(h) { return h.cash !== null; });
    var cbLabels = hist.map(function(h) { return fmtMkShort(h.mk); });
    var cbCash   = hist.map(function(h) { return h.cash; });

    // Color the line: green if cash is above the first recorded month, blue otherwise
    var cbColor = '#3b82f6'; // blue baseline

    if (cbLineChartInst) cbLineChartInst.destroy();
    var cbCtx = document.getElementById('cbLineChart').getContext('2d');
    // Gradient fill
    var grad = cbCtx.createLinearGradient(0, 0, 0, 200);
    grad.addColorStop(0, 'rgba(59,130,246,0.25)');
    grad.addColorStop(1, 'rgba(59,130,246,0)');
    cbLineChartInst = new Chart(cbCtx, {
      type: 'line',
      data: {
        labels: cbLabels,
        datasets: [{
          data: cbCash,
          borderColor: cbColor,
          backgroundColor: grad,
          borderWidth: 2.5,
          pointRadius: 4,
          pointBackgroundColor: cbColor,
          pointHoverRadius: 6,
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: function(items) { return items[0].label; },
              label: function(ctx) { return 'Cash: ' + fmtDollar(ctx.parsed.y); }
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
    document.getElementById('cbSubtitle').textContent = hist.length + ' months';

    // ── What's Moving Cash (month-over-month breakdown) ──────────
    // Align cash history months with P&L noi array using month keys.
    var noiByMk = {};
    months.forEach(function(mk, i) { noiByMk[mk] = noi[i] || 0; });

    // Build rows for months where we have consecutive cash readings
    var cbRows = [];
    for (var ci = 1; ci < hist.length; ci++) {
      var mk = hist[ci].mk;
      var cashNow  = hist[ci].cash;
      var cashPrev = hist[ci - 1].cash;
      var delta    = cashNow - cashPrev;
      var ops      = noiByMk[mk] != null ? noiByMk[mk] : null;
      var other    = ops !== null ? delta - ops : null;
      cbRows.push({ mk: mk, cash: cashNow, delta: delta, ops: ops, other: other });
    }

    // Show last 6 on phone, all on desktop
    var cbIsPhone = window.innerWidth < 700;
    var cbShow = cbIsPhone ? cbRows.slice(-6) : cbRows;

    var moversHtml =
      '<div class="cb-movers-title">What\u2019s Moving Cash &mdash; Month-over-Month Breakdown</div>' +
      '<div style="font-size:11px;color:#aaa;margin-bottom:10px">Cash change = Operating Profit &plus; non-operating (owner draws, loan payments, equipment purchases, etc.)</div>' +
      '<div class="cb-movers-head">' +
        '<span>Month</span>' +
        '<span>Balance</span>' +
        '<span>Change</span>' +
        '<span class="cb-hide-mobile">Ops Profit</span>' +
        '<span class="cb-hide-mobile">Non-Operating</span>' +
      '</div>' +
      cbShow.map(function(r) {
        var dCls   = r.delta >= 0 ? 'pos' : 'neg';
        var dArrow = r.delta >= 0 ? '\u25b2' : '\u25bc';
        var opCell = r.ops !== null
          ? '<span class="cb-hide-mobile cb-mover-val ' + (r.ops >= 0 ? 'pos' : 'neg') + '">' + fmtDollar(r.ops) + '</span>'
          : '<span class="cb-hide-mobile cb-mover-val muted">\u2014</span>';
        var otherCell = r.other !== null
          ? (function() {
              var cls = Math.abs(r.other) < 500 ? 'muted'   // near-zero, irrelevant
                      : r.other > 0  ? 'pos'   // money came in (loan proceeds, etc.)
                      : 'neg';                  // money went out (draws, debt payments, capex)
              var hint = r.other > 500  ? ' \u2191loan/other'
                       : r.other < -500 ? ' \u2193draw/debt'
                       : '';
              return '<span class="cb-hide-mobile cb-mover-val ' + cls + '">' + fmtDollar(r.other) + '<span class="cb-mover-hint">' + hint + '</span></span>';
            })()
          : '<span class="cb-hide-mobile cb-mover-val muted">\u2014</span>';
        return '<div class="cb-mover-row">' +
          '<span class="cb-mover-lbl">' + fmtMkShort(r.mk) + '</span>' +
          '<span class="cb-mover-val">' + fmtDollar(r.cash) + '</span>' +
          '<span class="cb-mover-chg ' + dCls + '">' + dArrow + ' ' + fmtDollar(Math.abs(r.delta)) + '</span>' +
          opCell + otherCell +
        '</div>';
      }).join('');

    document.getElementById('cbMovers').innerHTML = moversHtml;
  } else if (cbCard) {
    cbCard.style.display = 'none';
  }

}

function selectTrendLine(btn) {
  var key = btn.dataset.key;
  trendActive = key;
  var btns = document.querySelectorAll('#trendToggles .fin-trend-btn');
  btns.forEach(function(b) { b.classList.toggle('on', b.dataset.key === key); });
  if (trendChartInst) {
    var keys = ['gm','tl','parts','admin','om'];
    var goals = { gm:50, tl:25, parts:25, admin:null, om:15 };
    keys.forEach(function(k, idx) {
      // main series at idx, goal series at idx + keys.length
      trendChartInst.data.datasets[idx].hidden = k !== key;
      if (trendChartInst.data.datasets[idx + keys.length]) {
        trendChartInst.data.datasets[idx + keys.length].hidden = k !== key || goals[k] == null;
      }
    });
    trendChartInst.update();
  }
}
