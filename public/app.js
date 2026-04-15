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

var AVATAR_COLORS = ['#FF9500','#007AFF','#34C759','#AF52DE','#FF3B30','#5AC8FA','#FF6B35','#30B0C7'];
function avatarColor(name) {
  var h = 0;
  for (var i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function initials(name) {
  var p = name.trim().split(/\s+/);
  if (p.length >= 2) return (p[0][0] + p[p.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}
function fmt(n) { return '$' + Math.round(n).toLocaleString(); }
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

function createDateBtn(range) {
  var btn = document.createElement('button');
  btn.className = 'date-btn' + (range.key === 'mtd' ? ' active' : '');
  btn.textContent = range.label;
  btn.dataset.range = range.key;
  btn.addEventListener('click', function() {
    if (isFetching) return;
    currentTimeRange = this.dataset.range;
    document.querySelectorAll('.date-btn').forEach(function(b) { b.classList.remove('active'); });
    this.classList.add('active');
    fetchData();
  });
  return btn;
}

if (window.innerWidth <= 768) {
  var primaryRow = document.createElement('div');
  primaryRow.className = 'sidebar-primary';
  var morePanel = document.createElement('div');
  morePanel.className = 'sidebar-more-panel';

  dateRanges.forEach(function(range) {
    if (commonKeys.indexOf(range.key) !== -1) {
      primaryRow.appendChild(createDateBtn(range));
    } else {
      morePanel.appendChild(createDateBtn(range));
    }
  });

  var moreToggle = document.createElement('button');
  moreToggle.className = 'sidebar-more-toggle';
  moreToggle.textContent = 'More date ranges \u25be';
  moreToggle.addEventListener('click', function() {
    var open = morePanel.classList.toggle('open');
    this.textContent = open ? 'Fewer options \u25b4' : 'More date ranges \u25be';
  });

  sidebar.appendChild(primaryRow);
  sidebar.appendChild(moreToggle);
  sidebar.appendChild(morePanel);
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

  // Desktop: table rows
  var rows = jobs.map(function(job) {
    var desc = job.description ? esc(job.description) : (job.invoice ? 'Invoice #' + esc(job.invoice) : '\u2014');
    var roleBadge = job.role ? '<span class="role-badge ' + roleClass(job.role) + '">' + esc(job.role) + '</span>' : '';
    var splitNote = (job.splitWith && job.splitWith.length > 0)
      ? '<div style="font-size:11px;color:#aaa;margin-top:2px">w/ ' + job.splitWith.map(function(s){ return esc(s.name || s) + (s.creditPct != null ? ' <span style="color:#ccc">(' + s.creditPct + '%)</span>' : ''); }).join(', ') + '</div>' : '';
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
      ? ' <span style="font-size:11px;color:#bbb">w/ ' + job.splitWith.map(function(s){ return esc(s.name || s) + (s.creditPct != null ? ' (' + s.creditPct + '%)' : ''); }).join(', ') + '</span>' : '';
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
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modalBackdrop').classList.remove('open');
  document.body.style.overflow = '';
}

// ── Tab navigation with hash-based URLs ────────────────────────
// URLs: /#technicians  /#marketing  /#owners
var marketingLoaded = false;
var ownersLoaded = false;

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
  // Sidebar only on Technicians
  var isTech = tab === 'technicians';
  document.getElementById('dateSidebar').style.display = isTech ? '' : 'none';
  document.getElementById('mainWrapper').classList.toggle('no-sidebar', !isTech);
  // Lazy-load tab data
  if (tab === 'marketing' && !marketingLoaded) {
    marketingLoaded = true;
    fetchMarketing();
    fetchQBOMarketing();
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
  activateTab(tab);
  fetchData();
  setInterval(fetchData, 5 * 60 * 1000);
}
