(function() {
  var form = document.getElementById('diagForm');
  var statusEl = document.getElementById('status');
  var resultsEl = document.getElementById('results');
  var tokenEl = document.getElementById('token');
  var startEl = document.getElementById('start');
  var endEl = document.getElementById('end');

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
    var cls = kind === 'counted_by_completed_job' ? 'good'
      : kind === 'could_be_covered_by_paid_invoice_pass' ? 'warn'
      : 'bad';
    return '<span class="pill ' + cls + '">' + esc(kind.replace(/_/g, ' ')) + '</span>';
  }

  function renderCandidate(job) {
    var reasons = (job.diagnostic.skipReasons || []).map(function(r) {
      return '<span class="pill bad">' + esc(r) + '</span>';
    }).join('');
    var employees = (job.assignedEmployees || []).map(function(e) {
      return '<span class="pill">' + esc(e.name || e.id) + '</span>';
    }).join('') || '<span class="pill bad">No assigned employees</span>';
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
        '<div><div class="label">KPI Status</div><div class="value">' + statusPill(job.diagnostic.dashboardStatus) + '</div></div>' +
      '</div>' +
      '<div class="candidate-body">' +
        '<div>' +
          '<div class="label">Job</div><div class="value">' + esc(job.id) + '</div>' +
          '<div class="label" style="margin-top:10px">Description</div><div>' + esc(job.description || '-') + '</div>' +
          '<div class="label" style="margin-top:10px">Employees</div><div>' + employees + '</div>' +
          '<div class="label" style="margin-top:10px">Skip Reasons</div><div>' + (reasons || '<span class="pill good">No obvious skip reason</span>') + '</div>' +
        '</div>' +
        '<div>' +
          '<table>' +
            '<tbody>' +
              '<tr><th>Work Status</th><td>' + esc(job.workStatus || '-') + '</td></tr>' +
              '<tr><th>Completed At</th><td>' + date(job.completedAt) + '</td></tr>' +
              '<tr><th>Scheduled Start</th><td>' + date(job.scheduledStart) + '</td></tr>' +
              '<tr><th>Outstanding</th><td>' + money(job.outstandingBalance) + '</td></tr>' +
              '<tr><th>Paid In Period</th><td>' + money(job.diagnostic.paidInPeriod) + '</td></tr>' +
              '<tr><th>Estimate ID</th><td>' + esc(job.originalEstimateId || '-') + '</td></tr>' +
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

  function render(data) {
    var candidates = data.candidates || [];
    var unattached = data.unattachedInvoices || [];
    var likelySkipped = candidates.filter(function(j) {
      return j.diagnostic && j.diagnostic.dashboardStatus === 'likely_skipped';
    }).length;
    resultsEl.innerHTML =
      '<section class="summary">' +
        '<div class="metric"><span class="label">Candidate Jobs</span><b>' + candidates.length + '</b></div>' +
        '<div class="metric"><span class="label">Likely Skipped</span><b>' + likelySkipped + '</b></div>' +
        '<div class="metric"><span class="label">Unattached Invoices</span><b>' + unattached.length + '</b></div>' +
        '<div class="metric"><span class="label">Period</span><b style="font-size:15px">' + esc(data.period.start.slice(0, 10)) + ' to ' + esc(data.period.end.slice(0, 10)) + '</b></div>' +
      '</section>' +
      candidates.map(renderCandidate).join('') +
      (unattached.length ? renderUnattached(unattached) : '') +
      '<details><summary>API search details</summary><pre>' + esc(JSON.stringify(data.searches, null, 2)) + '</pre></details>';
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
    var token = tokenEl.value.trim();
    if (token) sessionStorage.setItem('diagnosticsToken', token);
    var fd = new FormData(form);
    var params = new URLSearchParams();
    fd.forEach(function(value, key) {
      if (key === 'token') return;
      if (String(value).trim()) params.set(key, String(value).trim());
    });
    showStatus('Pulling HCP diagnostics...');
    resultsEl.innerHTML = '';
    try {
      var res = await fetch('/api/diagnostics/kpi?' + params.toString(), {
        headers: { 'X-Diagnostics-Token': token }
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Diagnostics failed.');
      showStatus('Diagnostics loaded.');
      render(data);
    } catch (err) {
      showStatus(err.message, true);
    }
  }

  document.getElementById('lastMonth').addEventListener('click', setLastMonth);
  form.addEventListener('submit', function(e) {
    e.preventDefault();
    run();
  });

  tokenEl.value = sessionStorage.getItem('diagnosticsToken') || '';
  setThisMonth();
})();
