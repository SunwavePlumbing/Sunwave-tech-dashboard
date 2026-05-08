(function() {
  var form = document.getElementById('diagForm');
  var statusEl = document.getElementById('status');
  var resultsEl = document.getElementById('results');
  var copyReportEl = document.getElementById('copyReport');
  var passwordEl = document.getElementById('password');
  var startEl = document.getElementById('start');
  var endEl = document.getElementById('end');
  var lastData = null;

  function ymd(d) {
    return d.toISOString().slice(0, 10);
  }

  function setThisMonth() {
    var now = new Date();
    startEl.value = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
    endEl.value = ymd(now);
  }

  function setLastMonth() {
    var now = new Date();
    var first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    var last = new Date(now.getFullYear(), now.getMonth(), 0);
    startEl.value = ymd(first);
    endEl.value = ymd(last);
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function money(value) {
    var n = Number(value || 0);
    return '$' + Math.round(n).toLocaleString();
  }

  function date(value) {
    if (!value) return '-';
    var d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleString();
  }

  function showStatus(text, isError) {
    statusEl.textContent = text;
    statusEl.className = 'status show';
    statusEl.style.borderColor = isError ? '#f3b6b0' : '';
    statusEl.style.background = isError ? '#fff4f2' : '';
  }

  function statusPill(kind) {
    kind = kind || 'unknown';
    var cls = kind === 'counted_by_completed_job' || kind === 'found_in_dashboard' ? 'good'
      : kind === 'could_be_covered_by_paid_invoice_pass' || kind === 'not_compared' ? 'warn'
      : 'bad';
    return '<span class="pill ' + cls + '">' + esc(kind.replace(/_/g, ' ')) + '</span>';
  }

  function renderCandidate(job) {
    var comparison = job.diagnostic.dashboardComparison || { status: 'not_compared' };
    var reasons = (job.diagnostic.skipReasons || []).map(function(r) {
      return '<span class="pill bad">' + esc(r) + '</span>';
    }).join('');
    var employees = (job.assignedEmployees || []).map(function(e) {
      return '<span class="pill">' + esc(e.name || e.id) + '</span>';
    }).join('') || '<span class="pill bad">No assigned employees</span>';
    var estimate = job.estimate || null;
    var estimateSellers = estimate && (estimate.assignedEmployees || []).length
      ? estimate.assignedEmployees.map(function(e) { return '<span class="pill good">' + esc(e.name || e.id) + '</span>'; }).join('')
      : '<span class="pill warn">No linked estimate seller found</span>';
    var relatedEstimates = (job.relatedEstimates || []).map(function(est) {
      var sellers = (est.assignedEmployees || []).map(function(e) { return e.name || e.id; }).join(', ') || 'no sellers';
      return '<span class="pill">' + esc((est.estimateNumber || est.id || 'estimate') + ' · ' + sellers) + '</span>';
    }).join('');
    var preview = job.attributionPreview || {};
    var previewRows = (preview.rows || []).map(function(row) {
      return '<span class="pill ' + (preview.status === 'using_estimate_seller' ? 'good' : 'warn') + '">' +
        esc((row.name || row.id || 'Unknown') + ': ' + money(row.credit) + ' (' + (row.percent || 0) + '%) · ' + (row.roles || []).join(' + ')) +
      '</span>';
    }).join('') || '<span class="pill warn">' + esc(preview.reason || 'No attribution preview') + '</span>';
    var override = job.attributionOverride || null;
    var invoices = (job.invoices || []).map(function(inv) {
      return '<tr>' +
        '<td>' + esc(inv.invoiceNumber || inv.id || '-') + '</td>' +
        '<td>' + esc(inv.status || '-') + '</td>' +
        '<td>' + money(inv.amount) + '</td>' +
        '<td>' + money(inv.dueAmount) + '</td>' +
        '<td>' + esc(inv.paymentMethod || (inv.paymentMethods || []).join(', ') || '-') + '</td>' +
        '<td>' + date(inv.paidAt) + '</td>' +
      '</tr>';
    }).join('');

    return '<article class="candidate">' +
      '<div class="candidate-head">' +
        '<div><div class="label">Invoice</div><div class="value">' + esc(job.invoiceNumber || '-') + '</div></div>' +
        '<div><div class="label">Customer</div><div class="value">' + esc(job.customer || '-') + '</div></div>' +
        '<div><div class="label">Job Total</div><div class="value">' + money(job.jobTotal) + '</div></div>' +
        '<div><div class="label">Dashboard Check</div><div class="value">' + statusPill(comparison.status) + '</div></div>' +
      '</div>' +
      '<div class="candidate-body">' +
        '<div>' +
          '<div class="label">Job</div><div class="value">' + esc(job.id) + '</div>' +
          '<div class="label" style="margin-top:10px">Description</div><div>' + esc(job.description || '-') + '</div>' +
          '<div class="label" style="margin-top:10px">Employees</div><div>' + employees + '</div>' +
          '<div class="label" style="margin-top:10px">Estimate Sellers</div><div>' + estimateSellers + '</div>' +
          '<div class="label" style="margin-top:10px">Manual Override</div><div>' + (override ? '<span class="pill good">' + esc((override.sellerNames || []).join(', ') || 'override active') + '</span>' : '<span class="pill">None</span>') + '</div>' +
          '<div class="label" style="margin-top:10px">Seller Source</div><div><span class="pill ' + (preview.sellerConfidence === 'low' ? 'warn' : preview.sellerConfidence === 'missing' ? 'bad' : 'good') + '">' + esc((preview.sellerSource || 'none') + ' · ' + (preview.sellerConfidence || 'missing')) + '</span></div>' +
          '<div class="label" style="margin-top:10px">Attribution Preview</div><div>' + previewRows + '</div>' +
          '<div class="label" style="margin-top:10px">Related Customer Estimates</div><div>' + (relatedEstimates || '<span class="pill">None found</span>') + '</div>' +
          '<div class="label" style="margin-top:10px">Rule Check</div><div>' + statusPill(job.diagnostic.dashboardStatus) + '</div>' +
          '<div class="label" style="margin-top:10px">Auto Dating</div><div>' + (job.diagnostic.autoDatedComplete ? '<span class="pill warn">Auto dated complete</span>' : '<span class="pill">Normal</span>') + '</div>' +
          '<div class="label" style="margin-top:10px">Skip Reasons</div><div>' + (reasons || '<span class="pill good">No obvious skip reason</span>') + '</div>' +
          '<div class="label" style="margin-top:10px">Dashboard Matches</div><div>' + renderDashboardMatches(comparison) + '</div>' +
        '</div>' +
        '<div>' +
          '<table>' +
            '<tbody>' +
              '<tr><th>Work Status</th><td>' + esc(job.workStatus || '-') + '</td></tr>' +
              '<tr><th>KPI Date</th><td>' + date(job.kpiDate) + '</td></tr>' +
              '<tr><th>Completed At</th><td>' + date(job.completedAt) + '</td></tr>' +
              '<tr><th>Scheduled Start</th><td>' + date(job.scheduledStart) + '</td></tr>' +
              '<tr><th>Outstanding</th><td>' + money(job.outstandingBalance) + '</td></tr>' +
              '<tr><th>Paid In Period</th><td>' + money(job.diagnostic.paidInPeriod) + '</td></tr>' +
              '<tr><th>Estimate ID</th><td>' + esc(job.originalEstimateId || '-') + '</td></tr>' +
              '<tr><th>Estimate #</th><td>' + esc(estimate && (estimate.estimateNumber || estimate.id) || '-') + '</td></tr>' +
              '<tr><th>Estimate Status</th><td>' + esc(estimate && estimate.workStatus || '-') + '</td></tr>' +
            '</tbody>' +
          '</table>' +
          '<div class="label" style="margin-top:12px">Matched Invoices</div>' +
          '<table>' +
            '<thead><tr><th>Invoice</th><th>Status</th><th>Amount</th><th>Due</th><th>Method</th><th>Paid</th></tr></thead>' +
            '<tbody>' + (invoices || '<tr><td colspan="6">No matched invoices found in the selected search.</td></tr>') + '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  function renderDashboardMatches(comparison) {
    if (!comparison || comparison.status === 'not_compared') {
      return '<span class="pill warn">' + esc((comparison && comparison.reason) || 'Not compared') + '</span>';
    }
    var rows = comparison.matchedRows || [];
    if (!rows.length) return '<span class="pill bad">No matching dashboard job row</span>';
    return rows.map(function(row) {
      return '<span class="pill good">' + esc(row.techName || 'Dashboard') + ': ' + money(row.credit) + '</span>';
    }).join('');
  }

  function render(data) {
    var candidates = data.candidates || [];
    var unattached = data.unattachedInvoices || [];
    var likelySkipped = candidates.filter(function(j) {
      return j.diagnostic && j.diagnostic.dashboardStatus === 'likely_skipped';
    }).length;
    var notFound = candidates.filter(function(j) {
      return j.diagnostic && j.diagnostic.dashboardComparison && j.diagnostic.dashboardComparison.status === 'not_found_in_dashboard';
    }).length;
    var found = candidates.filter(function(j) {
      return j.diagnostic && j.diagnostic.dashboardComparison && j.diagnostic.dashboardComparison.status === 'found_in_dashboard';
    }).length;
    var dash = data.dashboardComparison || {};
    resultsEl.innerHTML =
      '<section class="summary">' +
        '<div class="metric"><span class="label">Candidate Jobs</span><b>' + candidates.length + '</b></div>' +
        '<div class="metric"><span class="label">Found In Dashboard</span><b>' + found + '</b></div>' +
        '<div class="metric"><span class="label">Not Found</span><b>' + notFound + '</b></div>' +
        '<div class="metric"><span class="label">Rule-Likely Skipped</span><b>' + likelySkipped + '</b></div>' +
        '<div class="metric"><span class="label">Unattached Invoices</span><b>' + unattached.length + '</b></div>' +
        '<div class="metric"><span class="label">Dashboard Range</span><b style="font-size:15px">' + esc(dash.range || dash.status || '-') + '</b></div>' +
        '<div class="metric"><span class="label">Period</span><b style="font-size:15px">' + esc(data.period.start.slice(0, 10)) + ' to ' + esc(data.period.end.slice(0, 10)) + '</b></div>' +
      '</section>' +
      candidates.map(renderCandidate).join('') +
      (unattached.length ? renderUnattached(unattached) : '') +
      '<details><summary>API search details</summary><pre>' + esc(JSON.stringify(data.searches, null, 2)) + '</pre></details>';
  }

  function reportLine(label, value) {
    return label + ': ' + (value == null || value === '' ? '-' : value);
  }

  function plainTextReport(data) {
    var lines = [];
    var candidates = data.candidates || [];
    var unattached = data.unattachedInvoices || [];
    var dash = data.dashboardComparison || {};

    lines.push('Sunwave KPI Diagnostics Report');
    lines.push(reportLine('Requested At', data.requestedAt));
    lines.push(reportLine('Period', (data.period.start || '').slice(0, 10) + ' to ' + (data.period.end || '').slice(0, 10)));
    lines.push(reportLine('Dashboard Comparison', (dash.status || '-') + (dash.range ? ' (' + dash.range + ')' : '')));
    if (dash.reason) lines.push(reportLine('Dashboard Comparison Reason', dash.reason));
    if (dash.summary) {
      lines.push(reportLine('Dashboard Total Revenue', money(dash.summary.totalRevenue)));
      lines.push(reportLine('Dashboard Total Jobs', dash.summary.totalJobs));
      lines.push(reportLine('Dashboard Avg Ticket', money(dash.summary.averageTicket)));
      lines.push(reportLine('Dashboard Orphan Count', dash.summary.orphanCount));
    }
    lines.push(reportLine('Filters', JSON.stringify(data.filters || {})));
    lines.push('');

    lines.push('Candidate Jobs (' + candidates.length + ')');
    candidates.forEach(function(job, idx) {
      var comp = job.diagnostic.dashboardComparison || {};
      var estimate = job.estimate || {};
      var preview = job.attributionPreview || {};
      var override = job.attributionOverride || {};
      lines.push('');
      lines.push((idx + 1) + '. Invoice ' + (job.invoiceNumber || '-') + ' | ' + (job.customer || '-'));
      lines.push(reportLine('Job ID', job.id));
      lines.push(reportLine('Dashboard Check', comp.status));
      lines.push(reportLine('Dashboard Range', comp.range));
      if (comp.reason) lines.push(reportLine('Dashboard Reason', comp.reason));
      lines.push(reportLine('Rule Check', job.diagnostic.dashboardStatus));
      lines.push(reportLine('Auto Dated Complete', job.diagnostic.autoDatedComplete ? 'Yes' : 'No'));
      lines.push(reportLine('Skip Reasons', (job.diagnostic.skipReasons || []).join(', ') || 'None'));
      lines.push(reportLine('Job Total', money(job.jobTotal)));
      lines.push(reportLine('Outstanding', money(job.outstandingBalance)));
      lines.push(reportLine('Paid In Period', money(job.diagnostic.paidInPeriod)));
      lines.push(reportLine('Work Status', job.workStatus));
      lines.push(reportLine('KPI Date', job.kpiDate));
      lines.push(reportLine('Completed At', job.completedAt));
      lines.push(reportLine('Scheduled Start', job.scheduledStart));
      lines.push(reportLine('Employees', (job.assignedEmployees || []).map(function(e) { return e.name || e.id; }).join(', ') || 'None'));
      lines.push(reportLine('Linked Estimate ID', job.originalEstimateId));
      lines.push(reportLine('Linked Estimate Number', estimate.estimateNumber || estimate.id));
      lines.push(reportLine('Linked Estimate Status', estimate.workStatus));
      lines.push(reportLine('Estimate Sellers', (estimate.assignedEmployees || []).map(function(e) { return e.name || e.id; }).join(', ') || 'None found'));
      lines.push(reportLine('Manual Seller Override', (override.sellerNames || []).join(', ') || 'None'));
      lines.push(reportLine('Seller Source', preview.sellerSource));
      lines.push(reportLine('Seller Confidence', preview.sellerConfidence));
      lines.push(reportLine('Attribution Preview Status', preview.status));
      if (preview.reason) lines.push(reportLine('Attribution Preview Reason', preview.reason));
      if ((preview.rows || []).length) {
        lines.push('Attribution Preview Rows:');
        preview.rows.forEach(function(row) {
          lines.push('  - ' + (row.name || row.id || '-') + ' | credit ' + money(row.credit) + ' | percent ' + (row.percent || 0) + '% | roles ' + (row.roles || []).join(' + '));
        });
      }
      if ((job.relatedEstimates || []).length) {
        lines.push('Related Customer Estimates:');
        job.relatedEstimates.forEach(function(est) {
          lines.push('  - ' + (est.estimateNumber || est.id || '-') + ' | status ' + (est.workStatus || '-') + ' | sellers ' + ((est.assignedEmployees || []).map(function(e) { return e.name || e.id; }).join(', ') || 'None'));
        });
      }
      lines.push(reportLine('Description', job.description));
      if ((comp.matchedRows || []).length) {
        lines.push('Matched Dashboard Rows:');
        comp.matchedRows.forEach(function(row) {
          lines.push('  - ' + (row.techName || '-') + ' | invoice ' + (row.invoice || '-') + ' | credit ' + money(row.credit) + ' | total ' + money(row.jobTotal));
        });
      }
      if ((job.invoices || []).length) {
        lines.push('Matched HCP Invoices:');
        job.invoices.forEach(function(inv) {
          lines.push('  - ' + (inv.invoiceNumber || inv.id || '-') + ' | status ' + (inv.status || '-') + ' | amount ' + money(inv.amount) + ' | due ' + money(inv.dueAmount) + ' | paid ' + (inv.paidAt || '-'));
        });
      }
    });

    if (unattached.length) {
      lines.push('');
      lines.push('Invoices Without Job IDs (' + unattached.length + ')');
      unattached.forEach(function(inv) {
        lines.push('- ' + (inv.invoiceNumber || inv.id || '-') + ' | status ' + (inv.status || '-') + ' | amount ' + money(inv.amount) + ' | due ' + money(inv.dueAmount) + ' | paid ' + (inv.paidAt || '-'));
      });
    }

    return lines.join('\n');
  }

  async function copyReport() {
    if (!lastData) return;
    var text = plainTextReport(lastData);
    try {
      await navigator.clipboard.writeText(text);
      showStatus('Plain text report copied.');
    } catch (_) {
      var area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
      showStatus('Plain text report copied.');
    }
  }

  function renderUnattached(invoices) {
    return '<section class="panel">' +
      '<h2>Invoices Without Job IDs</h2>' +
      '<table>' +
        '<thead><tr><th>Invoice</th><th>Status</th><th>Amount</th><th>Due</th><th>Method</th><th>Paid</th></tr></thead>' +
        '<tbody>' + invoices.map(function(inv) {
          return '<tr>' +
            '<td>' + esc(inv.invoiceNumber || inv.id || '-') + '</td>' +
            '<td>' + esc(inv.status || '-') + '</td>' +
            '<td>' + money(inv.amount) + '</td>' +
            '<td>' + money(inv.dueAmount) + '</td>' +
            '<td>' + esc(inv.paymentMethod || (inv.paymentMethods || []).join(', ') || '-') + '</td>' +
            '<td>' + date(inv.paidAt) + '</td>' +
          '</tr>';
        }).join('') + '</tbody>' +
      '</table>' +
    '</section>';
  }

  async function run() {
    var password = passwordEl.value.trim();
    if (password) sessionStorage.setItem('diagnosticsPassword', password);
    var fd = new FormData(form);
    var params = new URLSearchParams();
    fd.forEach(function(value, key) {
      if (key === 'password') return;
      if (String(value).trim()) params.set(key, String(value).trim());
    });
    showStatus('Pulling HCP diagnostics...');
    resultsEl.innerHTML = '';
    lastData = null;
    copyReportEl.disabled = true;
    try {
      var res = await fetch('/api/diagnostics/kpi?' + params.toString(), {
        headers: { 'X-Diagnostics-Password': password }
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Diagnostics failed.');
      showStatus('Diagnostics loaded.');
      lastData = data;
      copyReportEl.disabled = false;
      render(data);
    } catch (err) {
      showStatus(err.message, true);
    }
  }

  document.getElementById('lastMonth').addEventListener('click', setLastMonth);
  copyReportEl.addEventListener('click', copyReport);
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    run();
  });

  passwordEl.value = sessionStorage.getItem('diagnosticsPassword') || sessionStorage.getItem('diagnosticsToken') || '';
  setThisMonth();
})();
