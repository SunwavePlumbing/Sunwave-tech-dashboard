const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();

const API_KEY = process.env.HOUSECALL_PRO_API_KEY;
const DIAGNOSTICS_PASSWORD = process.env.DIAGNOSTICS_PASSWORD || process.env.DIAGNOSTICS_TOKEN || '';
const PORT = process.env.PORT || 3000;
const BASE_URL = 'https://api.housecallpro.com';

// Shared axios defaults — prevents any single slow upstream from hanging the server
const HTTP_TIMEOUT = 25000;
axios.defaults.timeout = HTTP_TIMEOUT;

app.set('trust proxy', true);

app.use((req, res, next) => {
  const host = (req.get('host') || '').split(':')[0].toLowerCase();
  const proto = (req.get('x-forwarded-proto') || req.protocol || '').split(',')[0].trim().toLowerCase();

  if (host === 'kpi.sunwaveplumbing.com' && proto !== 'https') {
    return res.redirect(301, 'https://' + req.get('host') + req.originalUrl);
  }

  if (host === 'kpi.sunwaveplumbing.com') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy', 'upgrade-insecure-requests');
  }

  next();
});

// Headers for Housecall Pro requests
function hcpHeaders() {
  return { 'Authorization': 'Token ' + API_KEY, 'Accept': 'application/json' };
}

function isoDateOnly(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function inclusiveEndDateOnly(value) {
  const d = new Date(value);
  d.setMilliseconds(d.getMilliseconds() - 1);
  return isoDateOnly(d);
}

function getDayStart(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function getDayEnd(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
}

function getKpiPeriod(range, nowValue) {
  const now = nowValue ? new Date(nowValue) : new Date();
  let periodStart, periodEnd, periodLabel;

  switch (range) {
    case 'day':
      periodStart = getDayStart(now);
      periodEnd = getDayEnd(now);
      periodLabel = 'Today';
      break;
    case 'yesterday': {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      periodStart = getDayStart(yesterday);
      periodEnd = getDayEnd(yesterday);
      periodLabel = 'Yesterday';
      break;
    }
    case 'week':
      periodStart = new Date(now);
      periodStart.setDate(now.getDate() - now.getDay());
      periodEnd = new Date(periodStart);
      periodEnd.setDate(periodEnd.getDate() + 7);
      periodLabel = 'This Week';
      break;
    case 'wtd':
      periodStart = new Date(now);
      periodStart.setDate(now.getDate() - now.getDay());
      periodEnd = getDayEnd(now);
      periodLabel = 'Week to Date';
      break;
    case 'l7d':
      periodStart = new Date(now);
      periodStart.setDate(now.getDate() - 7);
      periodEnd = getDayEnd(now);
      periodLabel = 'Last 7 Days';
      break;
    case 'l14d':
      periodStart = new Date(now);
      periodStart.setDate(now.getDate() - 14);
      periodEnd = getDayEnd(now);
      periodLabel = 'Last 14 Days';
      break;
    case 'l30d':
      periodStart = new Date(now);
      periodStart.setDate(now.getDate() - 30);
      periodEnd = getDayEnd(now);
      periodLabel = 'Last 30 Days';
      break;
    case 'mtd':
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = getDayEnd(now);
      periodLabel = 'Month to Date';
      break;
    case 'lm': {
      const lastMonth = new Date(now);
      lastMonth.setMonth(now.getMonth() - 1);
      periodStart = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
      periodEnd = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 1);
      periodLabel = 'Last Month';
      break;
    }
    case 'l90d':
      periodStart = new Date(now);
      periodStart.setDate(now.getDate() - 90);
      periodEnd = getDayEnd(now);
      periodLabel = 'Last 90 Days';
      break;
    case 'qtd':
    case 'q2d': {
      const quarter = Math.floor(now.getMonth() / 3);
      periodStart = new Date(now.getFullYear(), quarter * 3, 1);
      periodEnd = getDayEnd(now);
      periodLabel = 'Quarter to Date';
      break;
    }
    case 'lq': {
      const lqQuarter = Math.floor(now.getMonth() / 3) - 1;
      const lqYear = lqQuarter < 0 ? now.getFullYear() - 1 : now.getFullYear();
      const lqQ = ((lqQuarter % 4) + 4) % 4;
      periodStart = new Date(lqYear, lqQ * 3, 1);
      periodEnd = new Date(lqYear, lqQ * 3 + 3, 1);
      periodLabel = 'Last Quarter';
      break;
    }
    case 'ytd':
      periodStart = new Date(now.getFullYear(), 0, 1);
      periodEnd = getDayEnd(now);
      periodLabel = 'Year to Date';
      break;
    case 'l365d':
      periodStart = new Date(now);
      periodStart.setDate(now.getDate() - 365);
      periodEnd = getDayEnd(now);
      periodLabel = 'Last 365 Days';
      break;
    case 'ly':
      periodStart = new Date(now.getFullYear() - 1, 0, 1);
      periodEnd = new Date(now.getFullYear(), 0, 1);
      periodLabel = 'Last Year';
      break;
    default:
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = getDayEnd(now);
      periodLabel = 'This Month';
  }

  return { range, periodStart, periodEnd, periodLabel };
}

function estimateIdForJob(job) {
  return job && (job.original_estimate_id || (job.original_estimate_uuids && job.original_estimate_uuids[0]));
}

const KPI_BACKDATE_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;
const SELLER_LOOKBACK_MS = 14 * 24 * 60 * 60 * 1000;
const HCP_KPI_WORK_STATUSES = ['completed', 'in_progress', 'scheduled'];

function jobScheduledStart(job) {
  return job && job.schedule && job.schedule.scheduled_start ? new Date(job.schedule.scheduled_start) : null;
}

function jobCompletedAt(job) {
  return job && job.work_timestamps && job.work_timestamps.completed_at ? new Date(job.work_timestamps.completed_at) : null;
}

function estimateRelevantDate(estimate) {
  if (!estimate) return null;
  const raw = estimate.schedule && (estimate.schedule.scheduled_start || estimate.schedule.start_time)
    ? (estimate.schedule.scheduled_start || estimate.schedule.start_time)
    : estimate.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function withinSellerLookback(candidateDate, jobStart) {
  if (!candidateDate || !jobStart || isNaN(candidateDate.getTime()) || isNaN(jobStart.getTime())) return false;
  const diff = jobStart.getTime() - candidateDate.getTime();
  return diff >= 0 && diff <= SELLER_LOOKBACK_MS;
}

function kpiDateForJob(job) {
  const completed = jobCompletedAt(job);
  const scheduled = jobScheduledStart(job);

  if (!completed || isNaN(completed.getTime())) {
    if (!scheduled || isNaN(scheduled.getTime())) return null;
    const autoCloseDate = new Date(scheduled.getTime() + KPI_BACKDATE_THRESHOLD_MS);
    return autoCloseDate <= new Date() ? autoCloseDate : null;
  }

  if (
    scheduled &&
    !isNaN(scheduled.getTime()) &&
    completed >= scheduled &&
    completed.getTime() - scheduled.getTime() > KPI_BACKDATE_THRESHOLD_MS
  ) {
    return scheduled;
  }

  return completed;
}

function autoCompletionKind(job) {
  const completed = jobCompletedAt(job);
  const scheduled = jobScheduledStart(job);
  if (!scheduled || isNaN(scheduled.getTime())) return null;
  if (!completed || isNaN(completed.getTime())) {
    const autoCloseDate = new Date(scheduled.getTime() + KPI_BACKDATE_THRESHOLD_MS);
    return autoCloseDate <= new Date() ? 'open_over_three_days' : null;
  }
  return completed >= scheduled && completed.getTime() - scheduled.getTime() > KPI_BACKDATE_THRESHOLD_MS
    ? 'completed_late'
    : null;
}

function isAutoDatedByCompletionLag(job) {
  return !!autoCompletionKind(job);
}

function diagnosticsAllowed(req) {
  if (!DIAGNOSTICS_PASSWORD) return false;
  const provided = req.get('X-Diagnostics-Password') || req.get('X-Diagnostics-Token') || req.query.password || req.query.token || '';
  return provided && provided === DIAGNOSTICS_PASSWORD;
}

const KPI_ATTRIBUTION_OVERRIDES_PATH = path.join(__dirname, 'kpi-attribution-overrides.json');

// ── KPI persistent data (issue reports + admin reconciliations) ──────────
// Both files live on the same persistent volume as the QBO tokens so they
// survive deploys. Reports = what techs submit when they spot an issue;
// reconciliations = the authoritative, admin-locked attribution for a job.
const KPI_DATA_DIR = process.env.QBO_TOKEN_DIR || __dirname;
const ISSUE_REPORTS_PATH    = path.join(KPI_DATA_DIR, 'kpi-issue-reports.json');
const RECONCILIATIONS_PATH  = path.join(KPI_DATA_DIR, 'kpi-reconciliations.json');

function loadIssueReports() {
  try {
    if (!fs.existsSync(ISSUE_REPORTS_PATH)) return [];
    const parsed = JSON.parse(fs.readFileSync(ISSUE_REPORTS_PATH, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('[issue-reports load]', err.message);
    return [];
  }
}
function saveIssueReports(reports) {
  try {
    fs.writeFileSync(ISSUE_REPORTS_PATH, JSON.stringify(reports, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.warn('[issue-reports save]', err.message);
    return false;
  }
}

function loadReconciliations() {
  try {
    if (!fs.existsSync(RECONCILIATIONS_PATH)) return {};
    const parsed = JSON.parse(fs.readFileSync(RECONCILIATIONS_PATH, 'utf8'));
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (err) {
    console.warn('[reconciliations load]', err.message);
    return {};
  }
}
function saveReconciliations(map) {
  try {
    fs.writeFileSync(RECONCILIATIONS_PATH, JSON.stringify(map, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.warn('[reconciliations save]', err.message);
    return false;
  }
}

// Light id helper for issue reports
function newReportId() {
  return 'rep_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

function normalizePersonName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function employeeName(emp) {
  return ((emp && emp.first_name || '') + ' ' + (emp && emp.last_name || '')).trim();
}

function employeeFromName(name) {
  const clean = String(name || '').trim().replace(/\s+/g, ' ');
  const parts = clean.split(' ');
  return {
    id: 'manual:' + normalizePersonName(clean),
    first_name: parts.shift() || clean,
    last_name: parts.join(' '),
    manual_override: true
  };
}

function loadKpiAttributionOverrides() {
  try {
    if (!fs.existsSync(KPI_ATTRIBUTION_OVERRIDES_PATH)) return { overrides: [] };
    const parsed = JSON.parse(fs.readFileSync(KPI_ATTRIBUTION_OVERRIDES_PATH, 'utf8'));
    return {
      overrides: Array.isArray(parsed.overrides) ? parsed.overrides : []
    };
  } catch (err) {
    console.warn('[kpi-attribution-overrides]', err.message);
    return { overrides: [] };
  }
}

function findKpiAttributionOverride(job, estimateId) {
  const invoice = String(job && job.invoice_number || '').trim().toLowerCase();
  const jobId = String(job && job.id || '').trim();
  const estId = String(estimateId || estimateIdForJob(job) || '').trim();
  const customer = normalizePersonName(job && job.customer ? employeeName(job.customer) : '');

  return loadKpiAttributionOverrides().overrides.find(rule => {
    if (!rule) return false;
    if (rule.jobId && String(rule.jobId).trim() === jobId) return true;
    if (rule.estimateId && String(rule.estimateId).trim() === estId) return true;
    if (rule.invoice && String(rule.invoice).trim().toLowerCase() === invoice) return true;
    if (
      rule.invoiceRoot &&
      invoice.split('-')[0] === String(rule.invoiceRoot).trim().toLowerCase() &&
      (!rule.customer || normalizePersonName(rule.customer) === customer)
    ) {
      return true;
    }
    return false;
  }) || null;
}

function fieldText(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(fieldText).filter(Boolean).join(' ');
  if (typeof value === 'object') {
    return [
      value.name,
      value.value,
      value.text,
      value.content,
      value.title,
      value.label
    ].filter(Boolean).map(String).join(' ');
  }
  return '';
}

function sellerNamesFromResource(resource) {
  const texts = [];
  toArrayish(resource && resource.tags).forEach(t => texts.push(fieldText(t)));
  toArrayish(resource && (resource.custom_fields || resource.job_fields || resource.estimate_fields)).forEach(f => texts.push(fieldText(f)));
  toArrayish(resource && resource.notes).forEach(n => texts.push(fieldText(n)));
  ['description', 'note', 'customer_notes', 'public_note'].forEach(key => {
    if (resource && resource[key]) texts.push(fieldText(resource[key]));
  });

  const sellers = [];
  const patterns = [
    /\b(?:seller|sold\s+by|quoted\s+by|estimate(?:d|r)?\s+by|sales\s+rep|sold)\s*[:=\-]\s*([a-z][a-z .'\-]+?)(?=$|[,;|/])/ig,
    /\b(?:seller|sold\s+by|quoted\s+by|estimate(?:d|r)?\s+by|sales\s+rep|sold)\s+([a-z][a-z .'\-]+?)(?=$|[,;|/])/ig
  ];

  texts.filter(Boolean).forEach(text => {
    patterns.forEach(pattern => {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const name = String(match[1] || '')
          .replace(/\b(job|estimate|invoice|sold|did|approved|complete|completed)\b.*$/i, '')
          .trim()
          .replace(/\s+/g, ' ');
        if (name && !sellers.some(existing => normalizePersonName(existing) === normalizePersonName(name))) {
          sellers.push(name);
        }
      }
    });
  });

  return sellers;
}

function jobAddressKey(job) {
  const a = job && job.address || {};
  return [
    a.street,
    a.street_line_2,
    a.city,
    a.state,
    a.zip
  ].filter(Boolean).join('|').toLowerCase();
}

function jobCustomerKey(job) {
  return job && job.customer && job.customer.id
    ? 'id:' + job.customer.id
    : 'name:' + normalizePersonName(job && job.customer ? employeeName(job.customer) : '');
}

// ── Tiny response cache (with disk persistence + stale-while-revalidate) ────
// Keyed by request URL + key; value = { at, data }. Separate TTLs per endpoint.
// On every cacheSet, a debounced disk write persists the whole map to a JSON
// file on the QBO_TOKEN_DIR volume (same persistent disk we use for QBO
// tokens). On boot, the file is read back so the cache survives Railway
// deploys instead of having to be re-warmed from scratch on every push.
const _cache = new Map();

// Cache lives on whatever volume QBO_TOKEN_DIR points at — same volume that
// holds the rotated refresh token. If unset (local dev), falls back to the
// repo dir; that's fine because local dev doesn't suffer the ephemeral-FS
// problem Railway does.
const CACHE_DIR  = process.env.QBO_TOKEN_DIR || __dirname;
const CACHE_FILE = path.join(CACHE_DIR, '.dashboard-cache.json');
let _cacheWriteTimer = null;
let _cacheEpoch = 0;

// Debounced async disk flush. cacheSet schedules; the timer fires once 5 s
// after the most-recent set, snapshotting the whole map at that moment. We
// don't await this from cacheSet — disk I/O shouldn't block hot-path
// requests. Worst case on crash: we lose up to 5 s of cache writes. Their
// next call will simply re-fetch fresh.
async function writeDiskCacheNow() {
  try {
    const obj = {};
    _cache.forEach((v, k) => { obj[k] = v; });
    await fs.promises.writeFile(CACHE_FILE, JSON.stringify(obj), 'utf8');
  } catch (e) {
    console.warn('[cache] disk write failed:', e.message);
  }
}
function scheduleDiskCacheWrite() {
  if (_cacheWriteTimer) return;
  _cacheWriteTimer = setTimeout(() => {
    _cacheWriteTimer = null;
    writeDiskCacheNow();
  }, 5000);
}

// Load cache from disk on boot. Validates each entry's shape so a corrupted
// file doesn't poison the in-memory map. Errors silently — first user just
// pays the cold-start cost (existing behavior).
function loadDiskCache() {
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    const obj = JSON.parse(raw);
    let count = 0;
    Object.entries(obj).forEach(([k, v]) => {
      if (v && typeof v === 'object' && typeof v.at === 'number' && 'data' in v) {
        _cache.set(k, v);
        count++;
      }
    });
    console.log('[cache] Loaded', count, 'entries from', CACHE_FILE);
  } catch (_) {
    // No cache file or unreadable — fresh start
  }
}
loadDiskCache();
// Invalidate metrics:* entries from the disk cache on startup. The
// metrics payload's shape evolves with each deploy (new fields like
// jobId, summary.reconciliation, etc.) so a payload computed by a
// previous code version may be missing fields the current code
// depends on. Recomputing on first request is cheap relative to
// chasing shape-drift bugs through downstream consumers.
let _bustedMetrics = 0;
Array.from(_cache.keys()).forEach(k => {
  // Bust anything whose SHAPE or FILTER LOGIC may have changed across
  // deploys. Employee-list caches are included so the tech-filter
  // rules (active-tech threshold, name dedup) take effect on the
  // first request after deploy rather than waiting out the 4-hour TTL.
  if (k.startsWith('metrics:') || k.startsWith('marketing') || k === 'qbo-marketing'
      || k === 'public-employees' || k === 'admin-employees' || k === 'active-tech-ids') {
    _cache.delete(k); _bustedMetrics++;
  }
});
if (_bustedMetrics) console.log('[cache] Busted ' + _bustedMetrics + ' shape-sensitive entries on startup');

function cacheGet(key, ttlMs) {
  const e = _cache.get(key);
  if (!e) return null;
  if (Date.now() - e.at > ttlMs) { _cache.delete(key); return null; }
  return e.data;
}
function cacheSet(key, data, expectedEpoch) {
  if (expectedEpoch != null && expectedEpoch !== _cacheEpoch) return false;
  _cache.set(key, { at: Date.now(), data });
  scheduleDiskCacheWrite();
  return true;
}

function cacheMeta(key) {
  const entry = _cache.get(key);
  return entry ? {
    key,
    cached: true,
    ageSeconds: Math.round((Date.now() - entry.at) / 1000),
    cachedAt: new Date(entry.at).toISOString()
  } : {
    key,
    cached: false,
    ageSeconds: null,
    cachedAt: null
  };
}

function invalidateCachesByPrefix(prefixes) {
  const list = Array.isArray(prefixes) ? prefixes : [prefixes];
  let count = 0;
  _cacheEpoch++;
  Array.from(_cache.keys()).forEach(k => {
    if (list.some(prefix => k === prefix || k.startsWith(prefix))) {
      _cache.delete(k);
      count++;
    }
  });
  count += invalidateInflightByPrefix(list);
  if (count) scheduleDiskCacheWrite();
  return count;
}

function invalidateKpiCaches() {
  return invalidateCachesByPrefix([
    'metrics:',
    'coverage:',
    'raw-jobs-short:',
    'raw-short',
    'public-employees',
    'admin-employees',
    'active-tech-ids'
  ]);
}

// ── In-flight promise de-dup ─────────────────────────────────────────────────
// If two requests arrive for the same fetch at once, they should share one
// network round-trip instead of each firing their own. Keyed by cache key;
// value is the pending promise that resolves to the fetched data.
const _inflight = new Map();
function inflightGet(key, factory) {
  if (_inflight.has(key)) return _inflight.get(key);
  const p = factory().finally(() => { _inflight.delete(key); });
  _inflight.set(key, p);
  return p;
}

function invalidateInflightByPrefix(prefixes) {
  const list = Array.isArray(prefixes) ? prefixes : [prefixes];
  let count = 0;
  Array.from(_inflight.keys()).forEach(k => {
    if (list.some(prefix => k === prefix || k.startsWith(prefix))) {
      _inflight.delete(k);
      count++;
    }
  });
  return count;
}

// ── withCache — stale-while-revalidate wrapper ───────────────────────────────
// Endpoint pattern:
//   const payload = await withCache(key, ttlMs, async () => {
//     // ... fetch from upstream API ... return payload;
//   });
//   res.json(payload);
//
// Behavior:
//   • Fresh cache (entry.age <= ttl)  — return cached data immediately.
//   • Stale cache (entry.age >  ttl)  — return STALE data immediately AND
//     fire the factory in the background so the next request gets fresh.
//     The user never waits on a slow upstream once the cache has been
//     warmed at least once.
//   • Cold cache (no entry)            — await the factory (deduped via
//     inflightGet), cache the result, return it. This is the only path
//     where the user waits for an upstream round-trip.
//
// Background revalidation failures are logged but don't propagate — the
// caller already got the stale data, and a transient upstream blip
// shouldn't blow up the response. Foreground (cold) failures DO propagate
// so the endpoint's try/catch can decide how to surface them.
async function withCache(key, ttlMs, factory) {
  const entry = _cache.get(key);
  if (entry) {
    const age = Date.now() - entry.at;
    if (age <= ttlMs) return entry.data;
    // Stale — kick off background revalidation (deduped) and return stale now
    if (!_inflight.has(key)) {
      const epoch = _cacheEpoch;
      inflightGet(key, async () => {
        try {
          const fresh = await factory();
          cacheSet(key, fresh, epoch);
          return fresh;
        } catch (e) {
          console.warn('[cache:bg-revalidate]', key, e.message);
          // Keep the stale entry on failure — better stale than nothing.
        }
      });
    }
    return entry.data;
  }
  // Cold — foreground fetch, deduped against any concurrent caller
  const epoch = _cacheEpoch;
  const fresh = await inflightGet(key, async () => {
    const result = await factory();
    cacheSet(key, result, epoch);
    return result;
  });
  return fresh;
}

// ── ServiceTitan migration filter ────────────────────────────────────────────
// Sunwave switched from ServiceTitan to Housecall Pro on 2026-04-01. Historical
// ST jobs were imported into HCP with migration-era `completed_at` values, so
// some show up in post-cutover ranges (e.g. month-to-date for April 2026)
// even though the underlying work was done months or years earlier in ST.
//
// Any job completed on/after the cutover AND flagged as ST-origin is treated
// as an import artifact and excluded from all post-cutover period metrics.
// ST jobs completed BEFORE cutover are left alone — they represent real ST-era
// work correctly dated in its historical period.
//
// Override the cutover via env var: ST_CUTOVER_DATE=2026-04-01
const ST_CUTOVER = new Date(process.env.ST_CUTOVER_DATE || '2026-04-01T00:00:00Z');

// Match "ServiceTitan" / "service titan" / "service-titan" / "ST Import" /
// "ST_IMPORT" / "st-import" — the common tag names HCP migration tools
// stamp onto imported records. Word boundaries stop false positives like
// "last" or "institution".
const ST_PATTERN = /\b(service[\s\-_]?titan|st[\s\-_]?import)\b/i;
const ST_INVOICE_PATTERN = /^ST\d+/i;

// Returns true if the job's tags / lead_source / notes / custom fields
// indicate a ServiceTitan origin. Tolerant of multiple shapes the HCP API
// can return (bare strings, {name}, {value}, nested arrays).
// Safely coerce any of the many shapes HCP returns (array, {data:[...]},
// {fields:[...]}, single object, string, null) into an iterable array so
// downstream `for...of` loops never blow up with "X is not iterable".
function toArrayish(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'object') {
    // Common wrapper shapes: {data: [...]}, {fields: [...]}, {items: [...]}
    if (Array.isArray(v.data))   return v.data;
    if (Array.isArray(v.fields)) return v.fields;
    if (Array.isArray(v.items))  return v.items;
    // Single field object — wrap it so the caller still gets one iteration
    return [v];
  }
  // String / number / boolean — wrap so `.value`/`.name` tests still work-ish
  return [v];
}

function isServiceTitanJob(job) {
  if (!job) return false;
  if (ST_INVOICE_PATTERN.test(String(job.invoice_number || ''))) return true;
  const tags = toArrayish(job.tags);
  for (const t of tags) {
    const v = typeof t === 'string' ? t : (t && (t.name || t.value || ''));
    if (v && ST_PATTERN.test(v)) return true;
  }
  if (job.lead_source) {
    const ls = typeof job.lead_source === 'string' ? job.lead_source : job.lead_source.name;
    if (ls && ST_PATTERN.test(ls)) return true;
  }
  for (const key of ['description', 'note', 'notes', 'customer_notes', 'public_note']) {
    const v = job[key];
    if (v && typeof v === 'string' && ST_PATTERN.test(v)) return true;
  }
  const jf = toArrayish(job.job_fields || job.custom_fields);
  for (const f of jf) {
    const v = (f && (f.value || f.text || f.name)) || '';
    if (v && typeof v === 'string' && ST_PATTERN.test(v)) return true;
  }
  return false;
}

// Returns true ONLY for ST-flagged jobs whose completed_at falls on/after
// the cutover — these are the mis-dated import artifacts we want to hide.
// ST jobs with legitimate pre-cutover completion dates pass through.
function isPostCutoverSTArtifact(job) {
  if (!isServiceTitanJob(job)) return false;
  const dates = [
    job.work_timestamps && job.work_timestamps.completed_at,
    job.schedule && job.schedule.scheduled_start
  ].filter(Boolean).map(v => new Date(v)).filter(d => !isNaN(d.getTime()));
  return dates.some(d => d >= ST_CUTOVER);
}

// Diagnostic: which field(s) triggered the ST match, for the debug endpoint.
function describeSTMatch(job) {
  const hits = [];
  if (ST_INVOICE_PATTERN.test(String(job.invoice_number || ''))) {
    hits.push('invoice_number=' + job.invoice_number);
  }
  toArrayish(job.tags).forEach((t, i) => {
    const v = typeof t === 'string' ? t : (t && (t.name || t.value || ''));
    if (v && ST_PATTERN.test(v)) hits.push('tags[' + i + ']=' + v);
  });
  if (job.lead_source) {
    const ls = typeof job.lead_source === 'string' ? job.lead_source : job.lead_source.name;
    if (ls && ST_PATTERN.test(ls)) hits.push('lead_source=' + ls);
  }
  for (const key of ['description', 'note', 'notes', 'customer_notes', 'public_note']) {
    if (job[key] && typeof job[key] === 'string' && ST_PATTERN.test(job[key])) {
      hits.push(key + '=' + job[key].slice(0, 60));
    }
  }
  return hits.join(' | ') || '(unknown)';
}

// ── QuickBooks Online ────────────────────────────────────────────────────────
const QBO_CLIENT_ID     = process.env.QBO_CLIENT_ID;
const QBO_CLIENT_SECRET = process.env.QBO_CLIENT_SECRET;
const QBO_REDIRECT_URI  = (process.env.QBO_REDIRECT_URI || 'http://localhost:' + (process.env.PORT || 3000) + '/connect-quickbooks/callback').trim();
const QBO_BASE          = 'https://quickbooks.api.intuit.com';

// ── QBO token persistence ─────────────────────────────────────────────────────
// QBO rotates refresh tokens on every use. We persist the latest token to a
// JSON file so restarts don't lose it.
//
// IMPORTANT — Railway has an EPHEMERAL filesystem. If TOKEN_FILE lives next
// to server.js (i.e. inside the deploy bundle), every git push wipes the
// rotated token and we fall back to the stale QBO_REFRESH_TOKEN env var,
// which Intuit invalidated the first time it was used. That's the "QBO
// disconnected" loop.
//
// To fix, mount a Railway Volume (e.g. at /data) and set QBO_TOKEN_DIR=/data
// so the rotated token lives on the persistent disk and survives every
// deploy. Falls back to __dirname for local dev where the file is fine.
const TOKEN_DIR  = process.env.QBO_TOKEN_DIR || __dirname;
const TOKEN_FILE = path.join(TOKEN_DIR, '.qbo-tokens.json');

function loadPersistedTokens() {
  try {
    const raw = fs.readFileSync(TOKEN_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return {};
  }
}

function persistTokens(tokens) {
  try {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2), 'utf8');
  } catch (err) {
    console.warn('[QBO] Could not persist tokens to file:', err.message);
  }
}

const _persisted = loadPersistedTokens();

// In-memory tokens + realmId — seeded from persisted file (or env vars) on startup, updated after OAuth
const qboTokens = {
  accessToken:  null,
  refreshToken: _persisted.refreshToken || process.env.QBO_REFRESH_TOKEN || null,
  expiresAt:    0,
  realmId:      _persisted.realmId      || process.env.QBO_REALM_ID      || null
};

// Startup diagnostics — visible in Railway logs. Tells you at a glance
// whether the volume is mounted (good: "from /data/.qbo-tokens.json")
// or whether we're still reading from the deploy bundle (bad: a path
// inside the app dir, which gets wiped on every deploy).
if (_persisted.refreshToken) {
  console.log('[QBO] Loaded persisted refresh token from', TOKEN_FILE);
} else if (process.env.QBO_REFRESH_TOKEN) {
  console.log('[QBO] No persisted token at', TOKEN_FILE, '\u2014 falling back to QBO_REFRESH_TOKEN env var (one-shot only; will rotate on first use)');
} else {
  console.log('[QBO] No refresh token configured \u2014 visit /connect-quickbooks to authorize');
}
if (process.env.QBO_TOKEN_DIR) {
  console.log('[QBO] Token persistence dir:', TOKEN_DIR, '(persistent volume \u2014 survives deploys)');
} else {
  console.warn('[QBO] Token persistence dir: ' + TOKEN_DIR + ' (EPHEMERAL on Railway \u2014 set QBO_TOKEN_DIR to a mounted volume path to fix the disconnect loop)');
}

function qboConfigured() {
  // Only needs client credentials — realmId is captured automatically during OAuth
  return !!(QBO_CLIENT_ID && QBO_CLIENT_SECRET);
}
function qboReady() {
  // Fully ready to make API calls
  return !!(QBO_CLIENT_ID && QBO_CLIENT_SECRET && qboTokens.realmId && qboTokens.refreshToken);
}

async function getQBOAccessToken() {
  if (!qboReady()) return null;
  if (qboTokens.accessToken && Date.now() < qboTokens.expiresAt - 60000) {
    return qboTokens.accessToken;
  }
  try {
    const resp = await axios.post(
      'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: qboTokens.refreshToken,
        client_id: QBO_CLIENT_ID,
        client_secret: QBO_CLIENT_SECRET
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        }
      }
    );
    qboTokens.accessToken  = resp.data.access_token;
    qboTokens.refreshToken = resp.data.refresh_token;   // QBO rotates refresh tokens
    qboTokens.expiresAt    = Date.now() + resp.data.expires_in * 1000;
    // Persist the rotated token immediately so restarts don't lose it
    persistTokens({ refreshToken: qboTokens.refreshToken, realmId: qboTokens.realmId });
    return qboTokens.accessToken;
  } catch (err) {
    // Refresh failed — wipe in-memory tokens so callers see "not connected" cleanly
    qboTokens.accessToken = null;
    qboTokens.expiresAt = 0;
    console.error('[QBO refresh]', err.response?.status || '', err.response?.data?.error || err.message);
    return null;
  }
}

// Parse a full QBO P&L report — extracts every named account per month
// Returns { months: ['YYYY-MM',...], accounts: { 'Account Name': { 'YYYY-MM': value } } }
function parseFinancialReport(report) {
  const cols = (report.Columns && report.Columns.Column) || [];
  const months = [];
  const colMonthMap = {}; // colIndex -> 'YYYY-MM'

  cols.forEach((col, idx) => {
    if (col.ColType !== 'Money') return;
    const startMeta = (col.MetaData || []).find(m => m.Name === 'StartDate');
    if (!startMeta) return; // skip Total column
    const d = new Date(startMeta.Value + 'T12:00:00');
    const mk = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    months.push(mk);
    colMonthMap[idx] = mk;
  });

  const accounts = {};
  // children: 'Total X' → ['Sub-account A', 'Sub-account B', ...]
  // Only leaf accounts (rows with ColData but no sub-rows of their own)
  const children = {};

  function getVals(colData) {
    const out = {};
    Object.entries(colMonthMap).forEach(([idx, mk]) => {
      const raw = ((colData[+idx] || {}).value || '0').replace(/,/g, '');
      out[mk] = parseFloat(raw) || 0;
    });
    return out;
  }

  function store(name, colData) {
    if (!name) return;
    if (!accounts[name]) accounts[name] = {};
    const vals = getVals(colData);
    Object.entries(vals).forEach(([mk, v]) => {
      accounts[name][mk] = (accounts[name][mk] || 0) + v;
    });
  }

  // Recursively collect all leaf account names (those with ColData, no sub-rows)
  function collectLeaves(rows, out) {
    if (!Array.isArray(rows)) return;
    rows.forEach(row => {
      if (row.Header && row.Rows && row.Rows.Row) {
        collectLeaves(row.Rows.Row, out); // recurse into sub-sections
      } else if (row.ColData && row.ColData[0]) {
        const n = (row.ColData[0].value || '').trim();
        if (n) out.push(n);
      }
    });
  }

  function walk(rows) {
    if (!Array.isArray(rows)) return;
    rows.forEach(row => {
      if (row.Header && row.Header.ColData) {
        if (row.Rows && row.Rows.Row) walk(row.Rows.Row);
        if (row.Summary && row.Summary.ColData) {
          const n = ((row.Summary.ColData[0] || {}).value || '').trim();
          store(n, row.Summary.ColData);
          // Build children list: all leaf accounts under this section
          if (row.Rows && row.Rows.Row) {
            const leaves = [];
            collectLeaves(row.Rows.Row, leaves);
            if (leaves.length) children[n] = leaves;
          }
        }
      }
      if (row.ColData && row.ColData[0]) {
        const n = (row.ColData[0].value || '').trim();
        store(n, row.ColData);
      }
    });
  }

  walk((report.Rows && report.Rows.Row) || []);
  return { months, accounts, children };
}

// Parse QBO ProfitAndLossDetail report — extracts individual transactions and
// buckets them by every useful key we can derive:
//   • "Total X"   — the Summary subtotal row name (what sections close with)
//   • "X"         — the bare Header account name (for leaf-account lookups)
//   • per-txn Account column value (fallback when QBO flattens leaves under
//                                   a parent section without wrapping them)
// Bucketing under all three variants means the /api/account-detail handler
// can find transactions no matter whether QBO returns a given leaf account
// as its own Header+Summary section OR as flat ColData rows under a parent.
// Returns { keyName: [{ date, type, num, name, memo, amount }, ...] }
function parsePnLDetail(report) {
  const cols = (report.Columns && report.Columns.Column) || [];

  // Identify column indices from column metadata
  const ci = {};
  cols.forEach((col, i) => {
    const t  = (col.ColTitle || '').toLowerCase().trim();
    const ct = (col.ColType  || '').toLowerCase();
    if (t === 'date' || t.includes('date')) ci.date = ci.date == null ? i : ci.date;
    else if (t === 'transaction type' || t === 'type') ci.type = i;
    else if (t === 'num' || t === 'no.' || t === 'doc. no.') ci.num = i;
    else if (t === 'name' && ci.name == null) ci.name = i;
    else if (t === 'memo' || t.includes('memo') || t.includes('description')) ci.memo = i;
    // If QBO includes an explicit "Account" column in detail rows, track it
    // so we can bucket transactions by the leaf account they actually belong
    // to — handles the case where a leaf isn't wrapped in its own section.
    else if (t === 'account' || t === 'account name' || t === 'split') ci.account = i;
    // Explicitly find the "Amount" column — QBO also returns a "Balance" (running total)
    // column which is the LAST money column and would give wildly inflated values.
    // Prefer the column explicitly titled "amount"; fall back to first money column.
    if (t === 'amount') {
      ci.amount = i;
    } else if ((ct === 'money' || ct === 'subt_nat_amount') && ci.amount == null) {
      ci.amount = i; // first money column as fallback
    }
  });

  const txnMap = {};

  function val(cd, idx) {
    return (idx != null && cd && cd[idx]) ? (cd[idx].value || '') : '';
  }
  function bucketPush(key, txn) {
    if (!key) return;
    if (!txnMap[key]) txnMap[key] = [];
    txnMap[key].push(txn);
  }

  function walkSection(rows) {
    const txns = [];
    if (!Array.isArray(rows)) return txns;
    for (const row of rows) {
      if (row.Header && row.Rows && row.Rows.Row) {
        // Sub-section — recurse first
        const childTxns = walkSection(row.Rows.Row);

        // Bucket A: Summary "Total X" subtotal name (existing behavior)
        if (row.Summary && row.Summary.ColData) {
          const sumName = ((row.Summary.ColData[0] || {}).value || '').trim();
          if (sumName.startsWith('Total ') && childTxns.length) {
            txnMap[sumName] = (txnMap[sumName] || []).concat(childTxns);
          }
        }

        // Bucket B: Header account/section name (new — enables leaf lookup
        // by the bare account name like "Cost of Goods Sold - Job Supplies"
        // or "Subcontractors" without needing to guess the "Total " prefix).
        if (row.Header.ColData && childTxns.length) {
          const headName = ((row.Header.ColData[0] || {}).value || '').trim();
          if (headName) {
            txnMap[headName] = (txnMap[headName] || []).concat(childTxns);
          }
        }

        txns.push(...childTxns);
      } else if (row.ColData && row.ColData.length > 2) {
        // Transaction row
        const cd = row.ColData;
        const dateStr = val(cd, ci.date);
        const amtStr  = val(cd, ci.amount).replace(/,/g, '');
        const amount  = parseFloat(amtStr) || 0;
        // Skip rows without a date (subtotals / blanks)
        if (!dateStr || !amount) continue;
        const txn = {
          date: dateStr,
          type: val(cd, ci.type),
          num:  val(cd, ci.num),
          name: val(cd, ci.name),
          memo: val(cd, ci.memo),
          amount
        };
        // Bucket C: per-transaction Account column (new — if QBO flattens
        // leaf accounts under a parent section without their own header,
        // each transaction still tells us which leaf it belongs to).
        if (ci.account != null) {
          const acctName = val(cd, ci.account).trim();
          if (acctName) bucketPush(acctName, txn);
        }
        txns.push(txn);
      }
    }
    return txns;
  }

  walkSection((report.Rows && report.Rows.Row) || []);
  return txnMap;
}

// Pull monthly marketing spend from a parsed report — sums every account whose
// name contains "advertising" or "marketing" (case-insensitive). Returns { 'YYYY-MM': $ }
function marketingSpendByMonth(parsed) {
  const spend = {};
  (parsed.months || []).forEach(mk => { spend[mk] = 0; });
  Object.entries(parsed.accounts || {}).forEach(([name, byMonth]) => {
    const n = name.toLowerCase();
    if (!n.startsWith('total ')) return; // use rollup lines only, avoid double counting
    if (!(n.includes('advertising') || n.includes('marketing'))) return;
    Object.entries(byMonth).forEach(([mk, v]) => {
      spend[mk] = (spend[mk] || 0) + v;
    });
  });
  // Strip zero-only entries for a cleaner response
  Object.keys(spend).forEach(k => { if (!spend[k]) delete spend[k]; });
  return spend;
}
// ────────────────────────────────────────────────────────────────────────────

// Serve static files from public/. Cache-Control: no-cache on CSS + JS
// files so browsers always revalidate with the server before using a
// cached copy (ETag-based 304s if unchanged, fresh content if edited).
// Without this, Safari/Chrome happily serve a weeks-old CSS/JS from
// the HTTP cache after a deploy, which makes loader / style changes
// appear to not land at all.
app.use(express.static('public', {
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    // Long-term cache for images/fonts — safe, they rarely change
    if (/\.(png|jpg|jpeg|gif|svg|ico|woff2?)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return;
    }
    // HTML / CSS / JS — always revalidate. The response is still
    // cacheable, but the browser MUST check ETag before reusing it,
    // so edits go live on the next page view without a hard-refresh.
    if (/\.(html|css|js)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

app.get(['/di', '/diagnostics'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'diagnostics.html'));
});

app.get('/api/metrics', async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const range = req.query.range || 'mtd';
    const forceRefresh = req.query.refresh === '1' || req.query.force === '1' || req.get('Cache-Control') === 'no-cache';

    // ── Per-range response cache (stale-while-revalidate) ───────────
    // Metrics for a given range rarely change minute-to-minute. A 2-min
    // freshness window makes repeat clicks (Today → Yesterday → Today)
    // feel instant. Once that window expires, withCache returns stale
    // data IMMEDIATELY and refreshes in the background — so users never
    // block on HCP, even if their next click happens to fall right at
    // the TTL boundary.
    const METRICS_TTL = 2 * 60 * 1000;
    const cacheKey = 'metrics:' + range;
    if (forceRefresh) {
      invalidateCachesByPrefix(['metrics:' + range, 'coverage:' + range, 'raw-jobs-short:', 'raw-short']);
    }
    const payload = await withCache(cacheKey, METRICS_TTL, async () => {

    const now = new Date();
    const period = getKpiPeriod(range, now);
    const { periodStart, periodEnd, periodLabel } = period;

    const headers = hcpHeaders();

    // ── Shared raw-jobs cache for "short" ranges ────────────────────
    // All common short ranges (day, yesterday, WTD, MTD, last month,
    // l7/14/30/90d) fit inside a 180-day window. We fetch that wider
    // window ONCE, cache it for 5 minutes, then derive every range
    // from the same cached array via in-memory filtering. Result:
    // switching Today → Yesterday → WTD → MTD is near-instant after
    // the first load.
    //
    // Longer ranges (ytd, l365d, ly, quarter-to-date variants) fall
    // through to a per-range fetch below.
    const RAW_WINDOW_DAYS = 180;
    const SHORT_RANGES = new Set([
      'day','yesterday','week','wtd','l7d','l14d','l30d','mtd','lm','l90d'
    ]);

    // Builds the raw cache by fetching the wide window + all estimates.
    // De-duped via inflightGet() so concurrent requests share one fetch.
    const fetchRawShort = () => inflightGet('raw-short', async () => {
      const rawEpoch = _cacheEpoch;
      const RAW_TTL = 5 * 60 * 1000;
      const ck = 'raw-jobs-short:' + RAW_WINDOW_DAYS;
      const cached = cacheGet(ck, RAW_TTL);
      if (cached) return cached;

      const rawStart = new Date(now);
      rawStart.setDate(rawStart.getDate() - RAW_WINDOW_DAYS - 90); // +90d lookback
      const rawEnd = new Date(now);
      rawEnd.setDate(rawEnd.getDate() + 1);

      const pageSize = 200;
      const jobsParams = {
        work_status: HCP_KPI_WORK_STATUSES,
        scheduled_start_min: rawStart.toISOString(),
        scheduled_start_max: rawEnd.toISOString(),
        page_size: pageSize
      };
      const firstPageRes = await axios.get(BASE_URL + '/jobs', {
        headers, params: { ...jobsParams, page: 1 }
      });
      const jobs = firstPageRes.data.jobs || [];
      const totalPages = firstPageRes.data.total_pages || 1;
      if (totalPages > 1) {
        const pagePromises = [];
        for (let p = 2; p <= totalPages; p++) {
          pagePromises.push(axios.get(BASE_URL + '/jobs', {
            headers, params: { ...jobsParams, page: p }
          }));
        }
        const pageResults = await Promise.all(pagePromises);
        pageResults.forEach(r => jobs.push(...(r.data.jobs || [])));
      }

      // Pre-fetch estimate seller map for EVERY job in the window so
      // downstream per-range filters never need another round-trip.
      const estimateIds = [...new Set(
        jobs
          .map(j => estimateIdForJob(j))
          .filter(Boolean)
      )];
      const sellerMap = {};
      if (estimateIds.length > 0) {
        const BATCH = 10;
        for (let i = 0; i < estimateIds.length; i += BATCH) {
          const batch = estimateIds.slice(i, i + BATCH);
          const results = await Promise.all(
            batch.map(id =>
              axios.get(BASE_URL + '/estimates/' + id, { headers })
                .then(r => {
                  const d = r.data;
                  const employees = d.assigned_employees
                    || (d.assigned_employee ? [d.assigned_employee] : []);
                  return { id, employees, estimate: d };
                })
                .catch(() => ({ id, employees: [], estimate: null }))
          ));
          results.forEach(r => { sellerMap[r.id] = { employees: r.employees, estimate: r.estimate }; });
        }
      }

      const result = { jobs, sellerMap };
      cacheSet(ck, result, rawEpoch);
      return result;
    });

    let allJobs, estimateSellerMap;

    if (SHORT_RANGES.has(range)) {
      // Share the cached wide-window fetch
      const raw = await fetchRawShort();
      allJobs = raw.jobs;
      estimateSellerMap = raw.sellerMap;
    } else {
      // Per-range fetch for longer windows that outgrow the shared cache
      const COMPLETION_LOOKBACK_DAYS = 90;
      const fetchStart = new Date(periodStart);
      fetchStart.setDate(fetchStart.getDate() - COMPLETION_LOOKBACK_DAYS);

      const pageSize = 200;
      const jobsParams = {
        work_status: HCP_KPI_WORK_STATUSES,
        scheduled_start_min: fetchStart.toISOString(),
        scheduled_start_max: periodEnd.toISOString(),
        page_size: pageSize
      };
      const firstPageRes = await axios.get(BASE_URL + '/jobs', {
        headers, params: { ...jobsParams, page: 1 }
      });
      allJobs = firstPageRes.data.jobs || [];
      const totalPages = firstPageRes.data.total_pages || 1;

      if (totalPages > 1) {
        const pagePromises = [];
        for (let p = 2; p <= totalPages; p++) {
          pagePromises.push(
            axios.get(BASE_URL + '/jobs', { headers, params: { ...jobsParams, page: p } })
          );
        }
        const pageResults = await Promise.all(pagePromises);
        pageResults.forEach(r => allJobs.push(...(r.data.jobs || [])));
      }

      // Fetch estimate seller data for all jobs in the fetched window.
      // KPI month is based on service date later, and HCP completed_at can
      // move after the month closes, so filtering here can miss sellers.
      const estimateIds = [...new Set(
        allJobs
          .map(j => estimateIdForJob(j))
          .filter(Boolean)
      )];
      estimateSellerMap = {};
      if (estimateIds.length > 0) {
        const BATCH = 10;
        for (let i = 0; i < estimateIds.length; i += BATCH) {
          const batch = estimateIds.slice(i, i + BATCH);
          const results = await Promise.all(
            batch.map(id =>
              axios.get(BASE_URL + '/estimates/' + id, { headers })
                .then(r => {
                  const d = r.data;
                  const employees = d.assigned_employees
                    || (d.assigned_employee ? [d.assigned_employee] : []);
                  return { id, employees, estimate: d };
                })
                .catch(() => ({ id, employees: [], estimate: null }))
          ));
          results.forEach(r => { estimateSellerMap[r.id] = { employees: r.employees, estimate: r.estimate }; });
        }
      }
    }

    // Filter jobs by KPI date. Normally this is completed_at, but if
    // HCP completion happened more than 3 days after the scheduled
    // start, use the scheduled date so late admin updates don't move
    // finished work into the wrong month. If HCP never marks a job
    // complete, auto-close it after 3 days and post it on that auto-close
    // date. Also
    // drops post-cutover ServiceTitan import artifacts so MTD / this-week /
    // etc. don't show legacy ST work as though it were done this month.
    const isJobCompleted = (job) => {
      if (isPostCutoverSTArtifact(job)) return false;
      const kpiDate = kpiDateForJob(job);
      return kpiDate && kpiDate >= periodStart && kpiDate < periodEnd;
    };
    const completedJobs = allJobs.filter(isJobCompleted);

    async function ensureEstimateSellersForJobs(jobs) {
      const ids = [...new Set(
        (jobs || [])
          .map(j => estimateIdForJob(j))
          .filter(id => id && !estimateSellerMap[id])
      )];
      if (ids.length === 0) return;

      const BATCH = 10;
      for (let i = 0; i < ids.length; i += BATCH) {
        const batch = ids.slice(i, i + BATCH);
        const results = await Promise.all(
          batch.map(id =>
            axios.get(BASE_URL + '/estimates/' + id, { headers })
              .then(r => {
                const d = r.data;
                const employees = d.assigned_employees
                  || (d.assigned_employee ? [d.assigned_employee] : []);
                return { id, employees, estimate: d };
              })
              .catch(() => ({ id, employees: [], estimate: null }))
          )
        );
        results.forEach(r => { estimateSellerMap[r.id] = { employees: r.employees, estimate: r.estimate }; });
      }
    }

    await ensureEstimateSellersForJobs(completedJobs);

    const techMetrics = {};
    const invoiceRoot = (invoice) => String(invoice || '').split('-')[0].trim();
    const jobCustomerName = (job) => job.customer
      ? ((job.customer.first_name || '') + ' ' + (job.customer.last_name || '')).trim()
      : '';
    const normalizedCustomer = (job) => jobCustomerName(job).toLowerCase();

    function ensureTech(emp) {
      if (!techMetrics[emp.id]) {
        const name = ((emp.first_name || '') + ' ' + (emp.last_name || '')).trim() || 'Unknown';
        techMetrics[emp.id] = {
          id: emp.id, name,
          revenue: 0, jobs: 0,
          // Credited share of outstanding balances on the tech's jobs in
          // this period — same split rules as revenue (seller 1/3, doers
          // split 2/3) so the column reads consistently with Value Created.
          unpaid: 0, unpaidJobs: 0,
          jobList: []
        };
      }
    }

    function uniqueEmployees(employees) {
      const seen = new Set();
      return (employees || []).filter(emp => {
        if (!emp || !emp.id || seen.has(emp.id)) return false;
        seen.add(emp.id);
        return true;
      });
    }

    const creditedJobIds = new Set();
    const creditedInvoiceKeys = new Set();

    function creditedInvoiceKey(job) {
      const invoice = String(job && job.invoice_number || '').trim().toLowerCase();
      if (!invoice) return null;
      return invoice + '|' + normalizedCustomer(job);
    }

    const employeeByName = {};
    allJobs.forEach(job => {
      (job.assigned_employees || []).forEach(emp => {
        const key = normalizePersonName(employeeName(emp));
        if (key && !employeeByName[key]) employeeByName[key] = emp;
      });
    });

    function resolveEmployeesFromNames(names, doers) {
      return (names || [])
        .map(name => {
          const key = normalizePersonName(name);
          return (doers || []).find(emp => normalizePersonName(employeeName(emp)) === key)
            || employeeByName[key]
            || employeeFromName(name);
        })
        .filter(Boolean);
    }

    function estimateEntry(estimateId) {
      const entry = estimateId ? estimateSellerMap[estimateId] : null;
      if (!entry) return { employees: [], estimate: null };
      if (Array.isArray(entry)) return { employees: entry, estimate: null };
      return {
        employees: entry.employees || [],
        estimate: entry.estimate || null
      };
    }

    const relatedEstimatesByCustomer = {};

    async function fetchRelatedEstimatesForJobs(jobs) {
      const missingSellerCustomerIds = [...new Set((jobs || [])
        .filter(job => {
          if (!job || parseFloat(job.total_amount || 0) <= 0) return false;
          if ((job.assigned_employees || []).length <= 1) return false;
          const estimateId = estimateIdForJob(job);
          const linked = estimateEntry(estimateId);
          if (findKpiAttributionOverride(job, estimateId)) return false;
          if (sellerNamesFromResource(job).length) return false;
          if ((linked.employees || []).length) return false;
          if (linked.estimate && sellerNamesFromResource(linked.estimate).length) return false;
          return job.customer && job.customer.id;
        })
        .map(job => job.customer.id))]
        .slice(0, 40);

      if (!missingSellerCustomerIds.length) return;

      const relatedStart = new Date(periodStart);
      relatedStart.setDate(relatedStart.getDate() - 30);
      const relatedEnd = new Date(periodEnd);
      relatedEnd.setDate(relatedEnd.getDate() + 7);

      for (const customerId of missingSellerCustomerIds) {
        if (relatedEstimatesByCustomer[customerId]) continue;
        try {
          const first = await axios.get(BASE_URL + '/estimates', {
            headers,
            params: {
              customer_id: customerId,
              scheduled_start_min: relatedStart.toISOString(),
              scheduled_start_max: relatedEnd.toISOString(),
              page_size: 100,
              page: 1
            }
          });
          relatedEstimatesByCustomer[customerId] = first.data.estimates || [];
        } catch (_) {
          relatedEstimatesByCustomer[customerId] = [];
        }
      }
    }

    await fetchRelatedEstimatesForJobs(completedJobs);

    function overrideSellerEmployees(job, estimateId) {
      const override = findKpiAttributionOverride(job, estimateId);
      if (!override || !Array.isArray(override.sellerNames) || override.sellerNames.length === 0) return [];
      return resolveEmployeesFromNames(override.sellerNames, job.assigned_employees || []);
    }

    function relatedEstimateSellerEmployees(job) {
      if ((job.assigned_employees || []).length <= 1) return [];
      const jobStart = jobScheduledStart(job) || kpiDateForJob(job);
      const related = relatedEstimatesByCustomer[job.customer && job.customer.id] || [];
      const linkedId = estimateIdForJob(job);
      const sameCustomerEstimates = related
        .filter(est => est && (est.id || est.uuid) !== linkedId)
        .map(est => {
          const estStart = estimateRelevantDate(est);
          const employees = est.assigned_employees || (est.assigned_employee ? [est.assigned_employee] : []);
          const names = sellerNamesFromResource(est);
          const tagEmployees = resolveEmployeesFromNames(names, job.assigned_employees || []);
          return {
            est,
            estStart,
            employees: employees.length ? employees : tagEmployees,
            approved: (est.options || []).some(o => /approved/i.test(String(o.approval_status || o.status || '')))
              || /approved|completed/i.test(String(est.work_status || est.approval_status || ''))
          };
        })
        .filter(item => item.employees.length > 0)
        .filter(item => withinSellerLookback(item.estStart, jobStart))
        .sort((a, b) => {
          if (a.approved !== b.approved) return a.approved ? -1 : 1;
          return (b.estStart ? b.estStart.getTime() : 0) - (a.estStart ? a.estStart.getTime() : 0);
        });

      return sameCustomerEstimates.length ? sameCustomerEstimates[0].employees : [];
    }

    function previousScheduledSellerEmployees(job) {
      if ((job.assigned_employees || []).length <= 1) return [];
      const jobStart = jobScheduledStart(job) || kpiDateForJob(job);
      if (!jobStart) return [];
      const customerKey = jobCustomerKey(job);
      const addressKey = jobAddressKey(job);

      const previous = allJobs
        .filter(candidate => candidate && candidate.id !== job.id)
        .filter(candidate => (candidate.assigned_employees || []).length > 0)
        .map(candidate => ({ job: candidate, start: jobScheduledStart(candidate) || jobCompletedAt(candidate) }))
        .filter(item => item.start && !isNaN(item.start.getTime()) && withinSellerLookback(item.start, jobStart))
        .filter(item => jobCustomerKey(item.job) === customerKey || (addressKey && jobAddressKey(item.job) === addressKey))
        .sort((a, b) => b.start.getTime() - a.start.getTime())[0];

      return previous ? previous.job.assigned_employees || [] : [];
    }

    function sellerAttribution(job) {
      const estimateId = estimateIdForJob(job);
      const doers = job.assigned_employees || [];
      const manual = overrideSellerEmployees(job, estimateId);
      if (manual.length) return { employees: manual, source: 'manual_override', confidence: 'confirmed' };

      const jobTagNames = sellerNamesFromResource(job);
      const jobTagEmployees = resolveEmployeesFromNames(jobTagNames, doers);
      if (jobTagEmployees.length) return { employees: jobTagEmployees, source: 'job_tag_or_field', confidence: 'high' };

      const linked = estimateEntry(estimateId);
      const estimateTagNames = sellerNamesFromResource(linked.estimate);
      const estimateTagEmployees = resolveEmployeesFromNames(estimateTagNames, doers);
      if (estimateTagEmployees.length) return { employees: estimateTagEmployees, source: 'estimate_tag_or_field', confidence: 'high' };
      if ((linked.employees || []).length) return { employees: linked.employees, source: 'linked_estimate_assigned_employee', confidence: 'high' };

      const related = relatedEstimateSellerEmployees(job);
      if (related.length) return { employees: related, source: 'related_customer_estimate', confidence: 'medium' };

      const previous = previousScheduledSellerEmployees(job);
      if (previous.length) return { employees: previous, source: 'previous_scheduled_visit', confidence: 'low' };

      return { employees: [], source: 'none', confidence: 'missing' };
    }

    /* Per-job credit attribution. Returns true if the job was credited
       to at least one tech, false if it had no assigned_employees and
       therefore got skipped (caller can collect those as orphans).

       opts.revenue (dollars) — override for `job.total_amount/100`. Used
         by the supplemental flow to pass "sum of paid invoices in this
         period" for jobs whose `total_amount` is unreliable (e.g. split
         across multiple invoices, or where the job is still in_progress
         in HCP because of a residual customer credit).
       opts.date (ISO string) — override for the job-row's date. Used
         when `completed_at` isn't set but we know a paid_at on an
         invoice tied to this job in the period. */
    // Admin reconciliations are loaded once per request — they're the
    // authoritative attribution for any job they cover. If a job_id has
    // a reconciliation record, we use it verbatim and skip every other
    // attribution path (no estimate lookup, no 1/3-2/3 split, no gap
    // pass logic). Reconciled jobs are locked.
    const RECONCILIATIONS = loadReconciliations();

    function creditJob(job, opts) {
      opts = opts || {};

      // ── Reconciliation short-circuit ──────────────────────────────
      // Wrapped in try/catch so a malformed reconciliation record
      // can't crash the entire credit pass. On failure, fall through
      // to the normal HCP-driven attribution.
      try {
        const recon = job && job.id && RECONCILIATIONS && RECONCILIATIONS[job.id]
          ? RECONCILIATIONS[job.id] : null;

        // Excluded reconciliations: the admin has chosen to hide this
        // job entirely. Mark as credited so neither the gap pass nor
        // the unattributed safety net surfaces it.
        if (recon && recon.excluded) {
          if (job.id) creditedJobIds.add(job.id);
          const ikey0 = creditedInvoiceKey(job);
          if (ikey0) creditedInvoiceKeys.add(ikey0);
          return true;
        }

        if (recon && Array.isArray(recon.assignments) && recon.assignments.length > 0) {
        const reconAmount = (recon.totalAmount != null
          ? Number(recon.totalAmount)
          : (opts.revenue != null ? opts.revenue : parseFloat(job.total_amount || 0) / 100)) || 0;
        const reconDate = recon.kpiDate
          || opts.date
          || (job.work_timestamps && job.work_timestamps.completed_at)
          || (job.schedule && job.schedule.scheduled_start)
          || null;
        // Skip if reconciled job's date is outside the period.
        if (reconDate) {
          const rd = new Date(reconDate);
          if (rd < periodStart || rd >= periodEnd) return true;
        }
        const customer = jobCustomerName(job);
        // Admin-marked-as-paid forces the outstanding to zero; otherwise
        // we use HCP's outstanding_balance directly. This is the escape
        // hatch for jobs that have been paid in cash/elsewhere and not
        // yet synced through HCP — admin can mark them paid via the
        // reconciliation editor and the unpaid column updates.
        const jobOutstandingGross = recon.markedPaid
          ? 0
          : Math.max(0, parseFloat(job.outstanding_balance || 0) / 100);
        const allInvolvedNames = recon.assignments.map(a => a.employeeName).filter(Boolean);
        const totalPct = recon.assignments.reduce((s, a) => s + (Number(a.creditPct) || 0), 0) || 100;

        recon.assignments.forEach(a => {
          // Resolve to the REAL HCP employee record first — otherwise
          // every reconciled credit goes to a synthetic `manual:name`
          // ID and the same tech shows up TWICE on the leaderboard
          // (once from their auto-attributed jobs under their real
          // HCP id, once from this reconciliation under the synthetic
          // one). The employeeByName map is built from every job in
          // the wide HCP window, so any real tech who's appeared on
          // any recent job is in there. Synthetic fallback only for
          // names that aren't in HCP (e.g. a tech who left, or one
          // an admin typed by hand that doesn't match a roster name).
          const lookupKey = normalizePersonName(a.employeeName || '');
          const emp = (lookupKey && employeeByName[lookupKey])
            || employeeFromName(a.employeeName || '');
          if (!emp.first_name && !emp.last_name) return;
          ensureTech(emp);
          const myName = ((emp.first_name || '') + ' ' + (emp.last_name || '')).trim();
          const pct = (Number(a.creditPct) || 0) / totalPct;
          const credit = reconAmount * pct;
          const role = a.role || 'Did';
          const outstandingShare = reconAmount > 0 ? jobOutstandingGross * pct : 0;
          const splitWith = allInvolvedNames
            .filter(n => n && n !== myName)
            .map(n => {
              const other = recon.assignments.find(x => x.employeeName === n);
              return { name: n, creditPct: other ? Number(other.creditPct) || 0 : 0 };
            });
          techMetrics[emp.id].revenue += credit;
          techMetrics[emp.id].jobs += 1;
          techMetrics[emp.id].unpaid += outstandingShare;
          if (jobOutstandingGross > 0) techMetrics[emp.id].unpaidJobs += 1;
          techMetrics[emp.id].jobList.push({
            jobId: job.id || null,
            invoice: job.invoice_number || null,
            description: job.description || null,
            customer,
            date: reconDate,
            jobTotal: reconAmount,
            credit,
            creditPct: Math.round((Number(a.creditPct) || 0)),
            role,
            splitWith,
            sellerSource: 'manual_reconciliation',
            sellerConfidence: 'confirmed',
            outstanding: jobOutstandingGross,
            outstandingShare,
            reconciled: true,
            reconciledAt: recon.reconciledAt || null,
            reconciledBy: recon.reconciledBy || null
          });
        });
        if (job.id) creditedJobIds.add(job.id);
        const ikey = creditedInvoiceKey(job);
        if (ikey) creditedInvoiceKeys.add(ikey);
        return true;
      }
      } catch (reconErr) {
        // Malformed reconciliation record — log and fall through to
        // the normal HCP-driven attribution. We never want a bad row
        // in kpi-reconciliations.json to take down the leaderboard.
        console.warn('[creditJob recon]', job && job.id, reconErr.message);
      }

      const doers = uniqueEmployees(opts.assignedEmployees || job.assigned_employees || []);
      if (doers.length === 0) return false;

      const invoiceKey = creditedInvoiceKey(job);
      if ((job.id && creditedJobIds.has(job.id)) || (invoiceKey && creditedInvoiceKeys.has(invoiceKey))) {
        return true;
      }

      const jobRevenue = opts.revenue != null
        ? opts.revenue
        : parseFloat(job.total_amount || 0) / 100;
      // Outstanding balance (HCP returns this directly on the Job object).
      // Negative balances (overpayments / credits) clamp to 0 — they're not
      // "unpaid" in any meaningful sense for this column.
      const jobOutstandingGross = Math.max(0, parseFloat(job.outstanding_balance || 0) / 100);
      const customer = jobCustomerName(job);
      const kpiDate = kpiDateForJob(job);
      const jobDate = opts.date
        || (kpiDate && kpiDate.toISOString())
        || (job.schedule && job.schedule.scheduled_start)
        || null;

      const estimateId = estimateIdForJob(job);
      const sellerInfo = sellerAttribution(job);
      const sellers = uniqueEmployees(sellerInfo.employees);

      // Build a credit map: techId -> credit amount
      // Rule: estimate seller(s) split 1/3, assigned doer(s) split 2/3.
      // If there is no estimate/seller data, do not guess a seller from
      // assigned tech order; split 100% across the assigned doers.
      const creditMap = {};
      const effectiveSellers = sellers;
      const sellPool = jobRevenue / 3;
      const doPool = jobRevenue * 2 / 3;

      if (effectiveSellers.length === 0) {
        doers.forEach(emp => {
          creditMap[emp.id] = (creditMap[emp.id] || 0) + jobRevenue / doers.length;
        });
      } else {
        effectiveSellers.forEach(emp => {
          creditMap[emp.id] = (creditMap[emp.id] || 0) + sellPool / effectiveSellers.length;
        });
        doers.forEach(emp => {
          creditMap[emp.id] = (creditMap[emp.id] || 0) + doPool / doers.length;
        });
      }

      // Collect all unique techs involved (sellers + doers)
      const allInvolved = [...doers];
      effectiveSellers.forEach(s => { if (!allInvolved.find(d => d.id === s.id)) allInvolved.push(s); });

      // Build display names for co-workers so each tech can see who they split with
      const allInvolvedNames = allInvolved.map(e => ((e.first_name || '') + ' ' + (e.last_name || '')).trim()).filter(Boolean);

      allInvolved.forEach(emp => {
        const credit = creditMap[emp.id];
        if (credit == null) return;

        ensureTech(emp);

        const isSeller = effectiveSellers.some(s => s.id === emp.id);
        const isDoer = doers.some(d => d.id === emp.id);
        const role = (isSeller && isDoer) ? 'Sold & Did' : isSeller ? 'Sold' : 'Did';
        const creditPct = jobRevenue > 0 ? Math.round(credit / jobRevenue * 100) : 0;
        const myName = ((emp.first_name || '') + ' ' + (emp.last_name || '')).trim();
        const splitWith = allInvolved
          .filter(e => e.id !== emp.id)
          .map(e => {
            const n = ((e.first_name || '') + ' ' + (e.last_name || '')).trim();
            const c = creditMap[e.id] || 0;
            const p = jobRevenue > 0 ? Math.round(c / jobRevenue * 100) : 0;
            return { name: n, creditPct: p };
          })
          .filter(x => x.name);

        // Per-tech share of this job's outstanding balance, using the
        // same split proportion as their revenue credit. If the job is
        // fully paid (outstanding == 0) this is just 0 — no special-case
        // needed.
        const outstandingShare = jobRevenue > 0
          ? jobOutstandingGross * (credit / jobRevenue)
          : 0;

        techMetrics[emp.id].revenue += credit;
        techMetrics[emp.id].jobs += 1;
        techMetrics[emp.id].unpaid += outstandingShare;
        if (jobOutstandingGross > 0) techMetrics[emp.id].unpaidJobs += 1;
        techMetrics[emp.id].jobList.push({
          // jobId is what makes credited rows clickable in the admin
          // period-jobs editor list. Without it, the row renders but
          // can't be opened for reconciliation. The reconciliation
          // path above already includes this.
          jobId: job.id || null,
          invoice: job.invoice_number || null,
          description: job.description || null,
          customer,
          date: jobDate,
          jobTotal: jobRevenue,
          credit,
          creditPct,
          role,
          splitWith,
          sellerSource: sellerInfo.source,
          sellerConfidence: sellerInfo.confidence,
          // Outstanding balance — gross (jobs total still owed) + the
          // tech's credited share. Modal can show whichever is more
          // useful (the gross dollar number tends to read more clearly
          // on a single-job row).
          outstanding: jobOutstandingGross,
          outstandingShare: outstandingShare,
          autoDatedComplete: isAutoDatedByCompletionLag(job),
          autoCompletionKind: autoCompletionKind(job)
        });
      });

      if (job.id) creditedJobIds.add(job.id);
      if (invoiceKey) creditedInvoiceKeys.add(invoiceKey);
      return true;
    }

    completedJobs.forEach(job => creditJob(job));

    /* ── Coverage gap pass ───────────────────────────────────────
       The pass above credits jobs that HCP returned via
       work_status=completed AND that have a `completed_at` inside
       the period. Two real-world patterns slip through:

       1. SPLIT INVOICES — a job whose customer paid a lump sum that
          got allocated across multiple invoices, leaving a residual
          credit on one invoice. HCP keeps the JOB at work_status=
          'in progress' until the credit is consumed by future work,
          so it's never returned by our completed-only query. The
          tech who did the paid portion still deserves credit.

       2. ORPHAN JOBS — work was done, an invoice got paid, but the
          job has no `assigned_employees` set in HCP (financing flows
          and admin-created jobs sometimes do this). We can't guess
          who did it, but we surface them in the response so an
          admin can fix the assignment in HCP.

       Strategy: query /invoices?paid_at_min/max for everything paid
       in the period. Any job_id we DIDN'T already credit gets a
       targeted /jobs/{id} fetch to figure out whether to credit it
       supplementally, surface as orphan, or ignore. */
    /* ── COVERAGE GAP + MANDATORY UNATTRIBUTED SAFETY NET ─────────
       Major reliability rewrite.

       Goal: every paid invoice in the period appears SOMEWHERE on the
       dashboard. No silent drops, ever. If we can't credit a job to a
       specific tech, it goes into the Unattributed bucket which is
       always rendered, so techs and admins can see what's pending.

       Failure-mode hardening:
       • Each /invoices page fetch wrapped in its own try/catch with
         retry. A single 429/500 can't kill the whole pass.
       • Each /jobs/{id} fetch wrapped in its own try/catch with
         retry. A 404 on one job can't drop the other 13.
       • If a job's details can't be fetched at all, we STILL surface
         the invoice in Unattributed using whatever data the invoice
         object carries directly — better an incomplete row than a
         silent drop.
       • Counters logged at the end so Railway logs show exactly what
         the pass found vs. credited. */
    const orphans = [];           // legacy bucket — kept for the existing modal
    const unattributed = [];      // new: every uncredited paid invoice in period
    let gapStats = {
      invoicesEnumerated: 0,
      pagesFailed: 0,
      jobsAttempted: 0,
      jobsFetched: 0,
      jobsFetchFailed: 0,
      gapCreditedCount: 0,
      gapCreditedDollars: 0,
      stripedAsST: 0,
      filteredOutByKpiDate: 0
    };

    // Tiny retry helper for transient HCP failures (5xx / 429). Returns
    // null on permanent failure so callers can handle gracefully.
    async function hcpGetWithRetry(url, params, label, maxAttempts = 3) {
      let lastErr;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await axios.get(url, { headers, params });
        } catch (err) {
          lastErr = err;
          const status = err.response?.status;
          const transient = !status || status === 429 || status >= 500;
          if (!transient || attempt === maxAttempts) {
            console.warn('[gap] ' + label + ' final-fail', status || err.message);
            return null;
          }
          // Exponential backoff: 250ms, 750ms, 1500ms
          await new Promise(r => setTimeout(r, 250 * Math.pow(3, attempt - 1)));
        }
      }
      return null;
    }

    // ── 1. ENUMERATE: every paid invoice in the period ─────────────
    const invParams = {
      paid_at_min: isoDateOnly(periodStart),
      paid_at_max: inclusiveEndDateOnly(periodEnd),
      page_size: 200
    };
    const allPaidInvoices = [];
    let invPage = 1;
    while (invPage <= 100) {  // hard cap to prevent runaway loops
      const r = await hcpGetWithRetry(BASE_URL + '/invoices',
        { ...invParams, page: invPage }, 'invoices p' + invPage);
      if (!r) {
        gapStats.pagesFailed++;
        // Keep going — next page might succeed. If we lose pages, the
        // unattributed bucket may undercount, but we won't crash.
        invPage++;
        continue;
      }
      const invs = r.data.invoices || [];
      invs.forEach(inv => {
        if (!inv.paid_at) return;
        const paidAt = new Date(inv.paid_at);
        if (paidAt >= periodStart && paidAt < periodEnd) allPaidInvoices.push(inv);
      });
      if (invPage >= (r.data.total_pages || 1)) break;
      invPage++;
    }
    gapStats.invoicesEnumerated = allPaidInvoices.length;

    // Group by job id. Standalone invoices (no job_id) go to a separate
    // bucket because we can't fetch a job for them.
    const invoicesByJob = {};
    const standaloneInvoices = [];
    allPaidInvoices.forEach(inv => {
      if (inv.job_id) {
        if (!invoicesByJob[inv.job_id]) invoicesByJob[inv.job_id] = [];
        invoicesByJob[inv.job_id].push(inv);
      } else {
        standaloneInvoices.push(inv);
      }
    });

    // ── 2. FETCH job details for every paid-invoice job ────────────
    // Critically: we fetch EVERY paid job's details, not just gaps.
    // This way even if the primary pass already credited a job, we
    // have its fresh data to cross-check amounts. AND if the primary
    // pass somehow missed a job that should have been included, the
    // safety-net pass at the bottom will catch it.
    const gapJobs = [];
    const failedJobFetches = new Set();
    const allPaidJobIds = Object.keys(invoicesByJob);
    gapStats.jobsAttempted = allPaidJobIds.length;
    const BATCH = 10;
    for (let i = 0; i < allPaidJobIds.length; i += BATCH) {
      const batch = allPaidJobIds.slice(i, i + BATCH);
      const results = await Promise.all(batch.map(async id => {
        const r = await hcpGetWithRetry(BASE_URL + '/jobs/' + id, {}, 'job ' + id);
        return r ? r.data : { _failed: true, id };
      }));
      results.forEach(j => {
        if (j._failed) { failedJobFetches.add(j.id); gapStats.jobsFetchFailed++; }
        else if (j && j.id) { gapJobs.push(j); gapStats.jobsFetched++; }
      });
    }

    await ensureEstimateSellersForJobs(gapJobs);

    function findSplitSiblingWithEmployees(job) {
      const root = invoiceRoot(job.invoice_number);
      if (!root) return null;
      const customer = normalizedCustomer(job);
      return [...completedJobs, ...gapJobs].find(candidate => {
        if (!candidate || candidate.id === job.id) return false;
        if (invoiceRoot(candidate.invoice_number) !== root) return false;
        if (customer && normalizedCustomer(candidate) !== customer) return false;
        return (candidate.assigned_employees || []).length > 0;
      }) || null;
    }

    // ── 3. CREDIT each gap job (only those not already credited) ───
    gapJobs.forEach(job => {
      // Skip jobs the primary pass already credited — don't double-count.
      if (creditedJobIds.has(job.id)) return;

      if (periodStart >= ST_CUTOVER && isServiceTitanJob(job)) {
        gapStats.stripedAsST++;
        return;
      }

      const gapKpiDate = kpiDateForJob(job);
      // If the job has a service date that's outside this period,
      // don't credit here — it belongs to a different period.
      if (gapKpiDate && (gapKpiDate < periodStart || gapKpiDate >= periodEnd)) {
        gapStats.filteredOutByKpiDate++;
        return;
      }

      const invs = invoicesByJob[job.id] || [];
      const paidInPeriod = invs.reduce((s, inv) =>
        s + parseFloat(inv.amount || 0) / 100, 0);
      if (paidInPeriod <= 0) return;

      const latestPaidAt = invs.map(i => i.paid_at).filter(Boolean).sort().pop() || null;

      const splitSibling = (job.assigned_employees || []).length === 0
        ? findSplitSiblingWithEmployees(job)
        : null;

      try {
        const credited = creditJob(job, {
          revenue: paidInPeriod,
          date: gapKpiDate ? gapKpiDate.toISOString() : latestPaidAt,
          assignedEmployees: splitSibling ? splitSibling.assigned_employees : undefined
        });
        if (credited) {
          gapStats.gapCreditedCount++;
          gapStats.gapCreditedDollars += paidInPeriod;
        } else {
          // No assigned_employees and no salvageable split sibling.
          // Push to orphans (back-compat) AND unattributed (new path).
          orphans.push({
            jobId: job.id,
            invoice: job.invoice_number || null,
            customer: job.customer
              ? ((job.customer.first_name || '') + ' ' + (job.customer.last_name || '')).trim() : '',
            amount: Math.round(paidInPeriod),
            paidAt: latestPaidAt,
            workStatus: job.work_status || null,
            completedAt: (job.work_timestamps && job.work_timestamps.completed_at) || null,
            reason: 'no_assigned_employees',
            description: job.description || null
          });
        }
      } catch (e) {
        // Per-job credit failure can't kill the whole pass.
        console.warn('[gap] credit-failed', job.id, e.message);
      }
    });

    // ── 4. MANDATORY SAFETY NET ─────────────────────────────────────
    // After ALL credit paths have run, walk every paid invoice in the
    // period one more time. If its job's id isn't in creditedJobIds,
    // the dollars haven't been counted anywhere — surface them in the
    // unattributed bucket. This is the guarantee that every paid
    // dollar appears on the dashboard.
    //
    // What lands here:
    //   • Jobs where /jobs/{id} fetch failed entirely (use invoice data)
    //   • Jobs with no assigned_employees and no split sibling
    //   • Jobs filtered out by kpiDate (paid in this period but
    //     completed in a different period — surface with a flag)
    //   • Standalone invoices (no job_id at all)
    for (const jobId of allPaidJobIds) {
      if (creditedJobIds.has(jobId)) continue;
      // Honor admin-excluded reconciliations even in the safety-net
      // pass — if an admin has chosen to exclude a job, it must not
      // appear anywhere on the dashboard, including this fallback.
      const reconForGap = RECONCILIATIONS[jobId];
      if (reconForGap && reconForGap.excluded) continue;
      const invs = invoicesByJob[jobId];
      const paidInPeriod = invs.reduce((s, inv) =>
        s + parseFloat(inv.amount || 0) / 100, 0);
      if (paidInPeriod <= 0) continue;
      const job = gapJobs.find(j => j && j.id === jobId);
      const latestPaidAt = invs.map(i => i.paid_at).filter(Boolean).sort().pop() || null;
      const invNumbers = invs.map(i => i.invoice_number).filter(Boolean);
      const customerFromInv = invs[0].customer
        ? ((invs[0].customer.first_name || '') + ' ' + (invs[0].customer.last_name || '')).trim()
        : '';

      // Determine why this landed here so the UI can show a useful
      // reason chip without the tech/admin having to guess.
      let reason;
      // kpiDate carries the actual service date (completed_at, or
      // scheduled_start if auto-dated). When the reason is
      // "completed_in_different_period", this is the field the UI
      // shows so the user knows where the job was *actually* credited.
      const kdRaw = job ? kpiDateForJob(job) : null;
      const kpiDateIso = kdRaw && !isNaN(kdRaw.getTime()) ? kdRaw.toISOString() : null;

      // Skip rows that aren't actually uncredited. A job paid in this
      // period but whose service date is in another period IS already
      // counted on that other period's leaderboard — so it shouldn't
      // appear in the "unattributed" list here. Used to surface for
      // transparency; the noise outweighed the value.
      if (job && (job.assigned_employees || []).length > 0
          && kdRaw && (kdRaw < periodStart || kdRaw >= periodEnd)) {
        continue;
      }

      if (failedJobFetches.has(jobId)) {
        reason = 'job_details_unavailable';
      } else if (!job) {
        reason = 'job_details_unavailable';
      } else if (periodStart >= ST_CUTOVER && isServiceTitanJob(job)) {
        reason = 'servicetitan_artifact';
      } else if ((job.assigned_employees || []).length === 0) {
        reason = 'no_assigned_employees';
      } else {
        reason = 'pipeline_unknown';  // shouldn't happen — flags a bug
      }

      unattributed.push({
        jobId,
        invoice: invNumbers.join(', ') || null,
        customer: (job && job.customer
          ? ((job.customer.first_name || '') + ' ' + (job.customer.last_name || '')).trim()
          : '') || customerFromInv,
        amount: Math.round(paidInPeriod),
        paidAt: latestPaidAt,
        workStatus: job ? job.work_status : null,
        completedAt: job && job.work_timestamps ? job.work_timestamps.completed_at : null,
        kpiDate: kpiDateIso, // service date the job actually counts for
        assignedEmployees: job && job.assigned_employees
          ? job.assigned_employees.map(e => ((e.first_name || '') + ' ' + (e.last_name || '')).trim()).filter(Boolean)
          : [],
        description: job ? job.description : null,
        reason
      });
    }

    // Also push standalone invoices (no job_id) so even those appear.
    standaloneInvoices.forEach(inv => {
      const paidAmount = parseFloat(inv.amount || 0) / 100;
      if (paidAmount <= 0) return;
      unattributed.push({
        jobId: null,
        invoice: inv.invoice_number || null,
        customer: inv.customer
          ? ((inv.customer.first_name || '') + ' ' + (inv.customer.last_name || '')).trim() : '',
        amount: Math.round(paidAmount),
        paidAt: inv.paid_at,
        workStatus: null,
        completedAt: null,
        assignedEmployees: [],
        description: null,
        reason: 'standalone_invoice_no_job'
      });
    });

    // Operational visibility — shows up in Railway logs.
    console.log('[/api/tech gap-stats range=' + range + ']',
      'enum=' + gapStats.invoicesEnumerated,
      'jobsAttempt=' + gapStats.jobsAttempted,
      'jobsFetched=' + gapStats.jobsFetched,
      'jobsFailed=' + gapStats.jobsFetchFailed,
      'gapCredited=' + gapStats.gapCreditedCount,
      'gapDollars=$' + Math.round(gapStats.gapCreditedDollars),
      'unattributed=' + unattributed.length);

    const leaderboard = Object.values(techMetrics)
      .map(tech => ({
        id: tech.id,
        name: tech.name,
        monthlyRevenue: Math.round(tech.revenue),
        jobsCompleted: tech.jobs,
        averageTicket: tech.jobs > 0 ? Math.round(tech.revenue / tech.jobs) : 0,
        unpaid: Math.round(tech.unpaid),
        unpaidJobs: tech.unpaidJobs,
        jobList: tech.jobList
      }))
      .sort((a, b) => b.monthlyRevenue - a.monthlyRevenue);

    const totalRevenue = leaderboard.reduce((sum, t) => sum + t.monthlyRevenue, 0);
    // Keep the technician KPI cards on the same basis as the visible
    // leaderboard/footer. Raw completed jobs can include non-credited
    // entries, which made the top "Total Jobs" and "Avg Ticket" cards
    // disagree with the table users were reading.
    const totalJobs = leaderboard.reduce((sum, t) => sum + t.jobsCompleted, 0);
    const avgTicket = totalJobs > 0 ? Math.round(totalRevenue / totalJobs) : 0;
    // Sum the GROSS outstanding across all completed jobs in the period
    // (not the per-tech credited share, which double-counts on splits).
    // This is what shows in the table footer's "Unpaid" totals cell.
    const totalUnpaid = Math.round(
      completedJobs.reduce((sum, job) =>
        sum + Math.max(0, parseFloat(job.outstanding_balance || 0) / 100),
      0)
    );

    const unattributedTotal = Math.round(
      unattributed.reduce((s, u) => s + (u.amount || 0), 0)
    );

    // ── Reconciliation coverage for this period ────────────────────
    // Defensive: any failure in this aggregation block must not crash
    // /api/metrics. The leaderboard is the primary thing techs see; if
    // the "fully reconciled" badge calculation has a bug, log and ship
    // an empty status rather than 500-ing the whole dashboard.
    let reconciliationStatus = { totalJobs: 0, reconciledJobs: 0, unattributedJobs: 0, fullyReconciled: false };
    try {
      // Dedupe reconciliation counting by invoice number — the same job
      // can appear in multiple techs' jobLists for split credit.
      const countedInvoices = new Set();
      let reconciledJobs = 0;
      let totalJobsForRecon = 0;
      (leaderboard || []).forEach(t => {
        (t.jobList || []).forEach(row => {
          const key = row && row.invoice ? String(row.invoice) : null;
          if (!key) return;
          if (countedInvoices.has(key)) return;
          countedInvoices.add(key);
          totalJobsForRecon++;
          if (row.reconciled) reconciledJobs++;
        });
      });
      // Plus excluded reconciliations whose kpiDate falls in period
      const psI = periodStart.toISOString().slice(0, 10);
      const peI = periodEnd.toISOString().slice(0, 10);
      Object.values(RECONCILIATIONS || {}).forEach(r => {
        if (!r || !r.excluded) return;
        const kd = typeof r.kpiDate === 'string' ? r.kpiDate.slice(0, 10) : null;
        if (!kd) return;
        if (kd >= psI && kd < peI) {
          totalJobsForRecon++;
          reconciledJobs++;
        }
      });
      const blockingReasons = new Set(['no_assigned_employees', 'pipeline_unknown', 'job_details_unavailable']);
      const blockingCount = (unattributed || []).filter(u => u && blockingReasons.has(u.reason)).length;
      reconciliationStatus = {
        totalJobs: totalJobsForRecon,
        reconciledJobs,
        unattributedJobs: (unattributed || []).length,
        fullyReconciled: totalJobsForRecon > 0 &&
          reconciledJobs === totalJobsForRecon &&
          blockingCount === 0
      };
    } catch (reconErr) {
      console.warn('[/api/tech reconciliation-summary]', reconErr.message);
    }

    return {
      generatedAt: new Date().toISOString(),
      leaderboard,
      // periodStart/periodEnd are ISO date strings (YYYY-MM-DD) so the
      // client can compare against data-quality cutoffs without having
      // to re-derive the range from the key — e.g. showing a warning
      // banner when any part of the range predates the HCP migration.
      summary: {
        totalRevenue, totalJobs, averageTicket: avgTicket, period: periodLabel,
        totalUnpaid,
        periodStart: periodStart.toISOString().slice(0, 10),
        periodEnd:   periodEnd.toISOString().slice(0, 10),
        orphanCount: orphans.length,
        unattributedCount: unattributed.length,
        unattributedTotal,
        reconciliation: reconciliationStatus
      },
      // Legacy: jobs paid in the period but not credited to a tech (no
      // assigned_employees in HCP). Surfaced in the existing orphan
      // modal so the admin-fix workflow keeps working.
      orphans,
      // NEW: every paid invoice in the period whose dollars didn't make
      // it onto a specific tech's row. By construction this guarantees
      // the dashboard never silently drops money — anything that can't
      // be attributed lands here, with a reason code telling the user
      // what to do about it. Reason codes:
      //   no_assigned_employees       — add an assigned tech in HCP
      //   completed_in_different_period — paid here but service date elsewhere
      //   servicetitan_artifact       — legacy ST data (excluded by design)
      //   job_details_unavailable     — HCP couldn't return the job's details
      //   standalone_invoice_no_job   — invoice with no linked service job
      //   pipeline_unknown            — bug flag; check server logs
      unattributed
    };
    });  // ── end withCache factory ──
    const meta = cacheMeta(cacheKey);
    res.json({
      ...payload,
      cache: meta,
      summary: {
        ...(payload.summary || {}),
        dataFreshness: {
          generatedAt: payload.generatedAt || meta.cachedAt || new Date().toISOString(),
          cacheAgeSeconds: meta.ageSeconds,
          forceRefreshAvailable: true
        }
      }
    });

  } catch (error) {
    console.error('[/api/tech]', error.response?.status || '', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/marketing', async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }
  // ── Per-MONTH caching with tiered TTLs ────────────────────────────
  // Each of the 12 month buckets is cached separately. Closed months
  // (everything except the current month) get a 7-day TTL because their
  // numbers are essentially fixed once the month ends — there's no
  // reason to re-fetch April 2025 on every Marketing-tab view. The
  // current month gets the original 10-min TTL since MTD changes day
  // to day. Combined with the disk-persistence layer, this means after
  // a single first-ever warm load only ONE bucket (the current month)
  // ever re-fetches; the other 11 are served from disk cache forever.
  const PAST_MONTH_TTL    = 7 * 24 * 60 * 60 * 1000;
  const CURRENT_MONTH_TTL = 10 * 60 * 1000;

  // ?refresh=1 — admin bypass. Clears every per-month entry so a fresh
  // run re-fetches all 12 from HCP. Used after manual job edits.
  if (req.query.refresh === '1') {
    for (const k of Array.from(_cache.keys())) {
      if (k.startsWith('marketing-month:')) _cache.delete(k);
    }
  }
  try {
    const headers = hcpHeaders();

    const now = new Date();
    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const MONTH_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December'];

    // Build 12 month buckets: [0] = 11 months ago, [11] = current month
    const buckets = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth();
      const isCurrent = (i === 0);
      const start = new Date(year, month, 1);
      const end   = isCurrent
        ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) // MTD
        : new Date(year, month + 1, 1);
      buckets.push({ year, month, isCurrent, start, end,
        monthKey: year + '-' + String(month + 1).padStart(2, '0'),
        label: MONTH_NAMES[month],
        fullLabel: MONTH_FULL[month] + ' ' + year
      });
    }

    // Fetches one month's worth of jobs, returns just the computed
    // numbers ({ jobs, revenue, avgTicket }) — NOT bucket metadata.
    // Bucket metadata is rebuilt each call from `now` so a cached
    // entry for "2026-05" doesn't carry stale `isCurrent` flags into
    // future months.
    const fetchMonthComputed = async (bucket) => {
      // ── CLIENT-SIDE COMPLETION DATE FILTERING ────────────────────────────────────
      // HCP's /jobs endpoint doesn't support filtering by completed_at, only
      // scheduled_start. For the oldest bucket, expand the window 90 days back to
      // catch jobs scheduled long ago but completed recently.
      const COMPLETION_LOOKBACK_DAYS = 90;
      let fetchStart = bucket.start;

      // Only expand backward on first (oldest) bucket
      if (bucket === buckets[0]) {
        fetchStart = new Date(bucket.start);
        fetchStart.setDate(fetchStart.getDate() - COMPLETION_LOOKBACK_DAYS);
      }

      const allJobs = [];
      let page = 1;
      while (true) {
        const r = await axios.get(BASE_URL + '/jobs', {
          headers,
          params: {
            work_status: ['completed'],
            scheduled_start_min: fetchStart.toISOString(),
            scheduled_start_max: bucket.end.toISOString(),
            page,
            page_size: 200
          }
        });
        const jobs = r.data.jobs || [];
        allJobs.push(...jobs);
        if (page >= (r.data.total_pages || 1)) break;
        page++;
      }

      // Filter jobs by actual completion date within this bucket.
      // Excludes post-cutover ST import artifacts so the marketing
      // monthly history + projection don't double-count legacy ST jobs
      // as if they happened after the HCP migration.
      const completedInBucket = allJobs.filter(job => {
        if (!job.work_timestamps?.completed_at) return false;
        if (isPostCutoverSTArtifact(job)) return false;
        const completedDate = new Date(job.work_timestamps.completed_at);
        return completedDate >= bucket.start && completedDate < bucket.end;
      });

      const revenue = completedInBucket.reduce((s, j) => s + parseFloat(j.total_amount || 0) / 100, 0);
      return {
        jobs: completedInBucket.length,
        revenue: Math.round(revenue),
        avgTicket: completedInBucket.length > 0 ? Math.round(revenue / completedInBucket.length) : 0
      };
    };

    // Each month flows through withCache independently. SWR means a
    // stale historical month returns instantly while the (rare) bg
    // refresh checks for late-completion edits.
    const computedPerMonth = await Promise.all(buckets.map(bucket => {
      const ttl = bucket.isCurrent ? CURRENT_MONTH_TTL : PAST_MONTH_TTL;
      const cacheKey = 'marketing-month:' + bucket.monthKey;
      return withCache(cacheKey, ttl, () => fetchMonthComputed(bucket));
    }));

    // Stitch bucket metadata (rebuilt every call) onto cached numbers.
    const history = buckets.map((b, i) => ({ ...b, ...computedPerMonth[i] }));

    // Projection for current month — workday-based (Mon–Fri only)
    const cur = history[history.length - 1];
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysElapsed = now.getDate();
    const daysLeft = daysInMonth - daysElapsed;

    // Count Mon–Fri days in a range [fromDay, toDay] inclusive
    const countWorkdays = (yr, mo, from, to) => {
      let n = 0;
      for (let d = from; d <= to; d++) {
        const dow = new Date(yr, mo, d).getDay();
        if (dow !== 0 && dow !== 6) n++;
      }
      return n;
    };
    const yr = now.getFullYear(), mo = now.getMonth();
    const wdElapsed = countWorkdays(yr, mo, 1, daysElapsed);
    const wdTotal   = countWorkdays(yr, mo, 1, daysInMonth);
    const wdLeft    = wdTotal - wdElapsed;

    const dailyRate    = wdElapsed > 0 ? cur.jobs / wdElapsed : 0;
    const projectedJobs = wdElapsed > 0 ? Math.round(dailyRate * wdTotal) : 0;

    res.json({
      history,
      projection: {
        jobsMtd: cur.jobs,
        projectedJobs,
        dailyRate,
        daysElapsed,
        daysLeft,
        totalDays: daysInMonth,
        wdElapsed,
        wdLeft,
        wdTotal
      }
    });
  } catch (error) {
    console.error('[/api/marketing]', error.response?.status || '', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── QuickBooks OAuth ─────────────────────────────────────────────────────────
// Safe debug — shows credential shape without exposing full values
app.get('/connect-quickbooks', (req, res) => {
  if (!qboConfigured()) {
    return res.send('<h2>QBO not configured</h2><p>Set QBO_CLIENT_ID and QBO_CLIENT_SECRET environment variables in Railway, then visit this page again.</p>');
  }
  const params = new URLSearchParams({
    client_id: QBO_CLIENT_ID,
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    redirect_uri: QBO_REDIRECT_URI,
    state: 'sunwave'
  });
  res.redirect('https://appcenter.intuit.com/connect/oauth2?' + params.toString());
});

app.get('/connect-quickbooks/callback', async (req, res) => {
  try {
    const { code, realmId } = req.query;
    if (!code) return res.status(400).send('Missing authorization code');
    const tokenBody = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: QBO_REDIRECT_URI,
      client_id: QBO_CLIENT_ID,
      client_secret: QBO_CLIENT_SECRET
    });
    const resp = await axios.post(
      'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
      tokenBody.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        }
      }
    );
    qboTokens.accessToken  = resp.data.access_token;
    qboTokens.refreshToken = resp.data.refresh_token;
    qboTokens.expiresAt    = Date.now() + resp.data.expires_in * 1000;
    // Save realmId in memory so API calls work immediately (no restart needed)
    if (realmId) qboTokens.realmId = realmId;
    // Persist tokens to file so server restarts don't lose the rotated refresh token
    persistTokens({ refreshToken: qboTokens.refreshToken, realmId: qboTokens.realmId });
    // Show success page — both values ready to copy into Railway
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>QuickBooks Connected</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:620px;margin:60px auto;padding:0 20px;color:#333}
  h2{color:#12A071;margin-bottom:6px}
  p{color:#666;margin-bottom:20px;font-size:14px}
  .step{background:#fffbf5;border:1px solid #FFE0B2;border-radius:10px;padding:18px 20px;margin:12px 0}
  .step strong{display:block;font-size:13px;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px}
  .var-name{font-family:monospace;font-size:13px;background:#f0f0f0;padding:3px 8px;border-radius:4px;color:#333}
  .var-val{font-family:monospace;font-size:12px;background:#1a2d3a;color:#7dd3a8;padding:12px 16px;border-radius:8px;margin-top:8px;word-break:break-all;display:block;line-height:1.5}
  .copy-btn{display:inline-block;margin-top:8px;background:#f0f0f0;border:none;padding:6px 14px;border-radius:6px;font-size:12px;cursor:pointer;color:#555}
  .copy-btn:hover{background:#e0e0e0}
  .instructions{background:#f8f8f8;border-radius:10px;padding:18px 20px;margin:20px 0;font-size:13px;color:#666;line-height:1.8}
  .instructions ol{padding-left:18px;margin:0}
  .btn{display:inline-block;background:#FF9500;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:4px}
</style>
</head><body>
<h2>✅ QuickBooks Connected!</h2>
<p>QuickBooks data will load immediately. To keep this connection after Railway restarts, add these two variables to your Railway project:</p>

<div class="step">
  <strong>Variable 1 — Realm ID</strong>
  <span class="var-name">QBO_REALM_ID</span>
  <code class="var-val" id="v1">${qboTokens.realmId}</code>
  <button class="copy-btn" onclick="navigator.clipboard.writeText('${qboTokens.realmId}');this.textContent='Copied!'">Copy</button>
</div>

<div class="step">
  <strong>Variable 2 — Refresh Token</strong>
  <span class="var-name">QBO_REFRESH_TOKEN</span>
  <code class="var-val" id="v2">${qboTokens.refreshToken}</code>
  <button class="copy-btn" onclick="navigator.clipboard.writeText('${qboTokens.refreshToken}');this.textContent='Copied!'">Copy</button>
</div>

<div class="instructions">
  <ol>
    <li>Go to your <strong>Railway project → Variables</strong></li>
    <li>Add <code>QBO_REALM_ID</code> and <code>QBO_REFRESH_TOKEN</code> using the values above</li>
    <li>Railway will redeploy automatically — no need to connect again</li>
  </ol>
  <br>⚠️ The refresh token rotates every ~100 days. If the marketing tab stops loading QBO data, just visit <code>/auth/quickbooks</code> again to reconnect.
</div>

<a href="/" class="btn">← Go to Dashboard</a>
</body></html>`);
  } catch (err) {
    const detail = err.response?.data;
    console.error('[QBO OAuth callback]', err.response?.status || '', detail?.error || err.message);
    res.status(500).send(
      '<h3>QuickBooks authorization failed</h3>' +
      '<p><strong>Error:</strong> ' + (detail?.error || err.message) + '</p>' +
      '<p><strong>Detail:</strong> ' + (detail?.error_description || 'none') + '</p>' +
      '<p><strong>Redirect URI sent:</strong> <code>' + QBO_REDIRECT_URI + '</code></p>' +
      '<p>Make sure this URI is listed exactly in your Intuit app\'s Redirect URIs.</p>' +
      '<p><a href="/connect-quickbooks">Try again</a></p>'
    );
  }
});

// ── /api/qbo-marketing ───────────────────────────────────────────────────────
app.get('/api/qbo-marketing', async (req, res) => {
  if (!qboReady()) {
    return res.json({ connected: false, reason: 'not_configured' });
  }
  // 4-hour TTL — QBO P&L data only changes meaningfully once a month.
  // Cached separately from /api/owners-financial because the response
  // shape differs (this returns a derived monthlyMarketing array, not
  // the raw P&L), and the windows don't fully overlap (12 vs 24 mo).
  const QBO_MKT_TTL = 4 * 60 * 60 * 1000;
  try {
    const payload = await withCache('qbo-marketing', QBO_MKT_TTL, async () => {
      const token = await getQBOAccessToken();
      if (!token) {
        const err = new Error('no_token');
        err._qboNoToken = true;
        throw err;
      }
      // Same 12-month window as /api/marketing
      const now = new Date();
      const endDate   = now.toISOString().slice(0, 10);
      const startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().slice(0, 10);

      const pnlRes = await axios.get(
        QBO_BASE + '/v3/company/' + qboTokens.realmId + '/reports/ProfitAndLoss',
        {
          headers: {
            Authorization: 'Bearer ' + token,
            Accept: 'application/json'
          },
          params: {
            start_date: startDate,
            end_date: endDate,
            summarize_column_by: 'Month',
            minorversion: 65
          }
        }
      );

      const monthlyMarketing = marketingSpendByMonth(parseFinancialReport(pnlRes.data));
      return { connected: true, monthlyMarketing };
    });
    res.json(payload);
  } catch (err) {
    if (err._qboNoToken) return res.json({ connected: false, reason: 'no_token' });
    console.error('[/api/qbo-marketing]', err.response?.status || '', err.message);
    const status = err.response?.status;
    if (status === 401) {
      qboTokens.accessToken = null; // force refresh next time
      return res.json({ connected: false, reason: 'token_expired' });
    }
    res.status(500).json({ connected: false, reason: 'error', error: err.message });
  }
});
// ────────────────────────────────────────────────────────────────────────────

// ── /api/owners-financial ────────────────────────────────────────────────────
// Financial reports should show the most recently completed calendar month.
// Reconciliation status is surfaced separately when QBO exposes it.
function getReliableEndDate(now) {
  return new Date(now.getFullYear(), now.getMonth(), 0);
}

app.get('/api/owners-financial', async (req, res) => {
  if (!qboReady()) {
    return res.json({ connected: false, reason: qboConfigured() ? 'not_connected' : 'not_configured' });
  }
  // 4-hour cache — QBO P&L data only changes meaningfully once a month.
  // SWR means once warmed, the user never blocks on QBO again.
  const FIN_TTL = 4 * 60 * 60 * 1000;
  try {
    const payload = await withCache('owners-financial:v2', FIN_TTL, async () => {
      const token = await getQBOAccessToken();
      if (!token) {
        // Throw so the endpoint catch can map to the right response shape.
        const err = new Error('no_token');
        err._qboNoToken = true;
        throw err;
      }

      // Always return 24 months ending at latest reliable month — client
      // picks which single month to display and computes comparisons from
      // this range (prior month, same month last year, etc.)
      const now = new Date();
      const reliableEnd = getReliableEndDate(now);
      const start = new Date(reliableEnd.getFullYear(), reliableEnd.getMonth() - 23, 1);
      const startDate = start.toISOString().slice(0, 10);
      const endDate = reliableEnd.toISOString().slice(0, 10);

      const pnlRes = await axios.get(
        QBO_BASE + '/v3/company/' + qboTokens.realmId + '/reports/ProfitAndLoss',
        {
          headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
          params: {
            start_date: startDate,
            end_date: endDate,
            accounting_method: 'Cash',
            summarize_column_by: 'Month',
            minorversion: 75
          }
        }
      );

      const parsed = parseFinancialReport(pnlRes.data);
      return {
        connected: true,
        ...parsed,
        fetchedAt: new Date().toISOString(),
        startDate,
        endDate,
        latestReliableMonth: parsed.months[parsed.months.length - 1]
      };
    });
    res.json(payload);
  } catch (err) {
    if (err._qboNoToken) return res.json({ connected: false, reason: 'no_token' });
    console.error('[/api/owners-financial]', err.response?.status || '', err.message);
    if (err.response?.status === 401) {
      qboTokens.accessToken = null;
      return res.json({ connected: false, reason: 'token_expired' });
    }
    res.status(500).json({ connected: false, reason: 'error', error: err.message });
  }
});
// ── /api/account-detail — individual transactions for a P&L section ─────────
// Fetches QBO ProfitAndLossDetail for the given month (cached 4 h),
// then returns every individual transaction under the requested "Total X" key.
app.get('/api/account-detail', async (req, res) => {
  const { acct, month } = req.query;
  if (!acct || !month) return res.status(400).json({ error: 'acct and month are required' });
  if (!qboReady()) return res.json({ connected: false, transactions: [] });

  try {
    const ck = 'pnl-detail:' + month;
    const PNL_DETAIL_TTL = 4 * 60 * 60 * 1000;
    const txnMap = await withCache(ck, PNL_DETAIL_TTL, async () => {
      const token = await getQBOAccessToken();
      if (!token) {
        const err = new Error('no_token');
        err._qboNoToken = true;
        throw err;
      }
      const [y, m] = month.split('-').map(Number);
      const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
      const endDate = new Date(y, m, 0).toISOString().slice(0, 10);

      console.log('[account-detail] Fetching PnLDetail', startDate, '→', endDate);
      const resp = await axios.get(
        QBO_BASE + '/v3/company/' + qboTokens.realmId + '/reports/ProfitAndLossDetail',
        {
          headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
          params: {
            start_date: startDate,
            end_date: endDate,
            accounting_method: 'Cash',
            minorversion: 75
          }
        }
      );

      const parsed = parsePnLDetail(resp.data);
      console.log('[account-detail] Parsed', Object.keys(parsed).length, 'sections for', month);
      return parsed;
    });

    let transactions = (txnMap[acct] || []).slice();

    // Case-insensitive exact fallback
    if (!transactions.length) {
      const lower = acct.toLowerCase();
      const match = Object.keys(txnMap).find(k => k.toLowerCase() === lower);
      if (match) transactions = txnMap[match].slice();
    }

    // "Total X" prefix fallback — most P&L-summary account names are the
    // LEAF name (e.g. "Cost of Goods Sold - Job Supplies"), but the P&L
    // Detail report keys those sections under the subtotal row name
    // ("Total Cost of Goods Sold - Job Supplies"). Try the prefixed form.
    if (!transactions.length && !/^total\s+/i.test(acct)) {
      const prefixed = 'Total ' + acct;
      if (txnMap[prefixed]) {
        transactions = txnMap[prefixed].slice();
      } else {
        const pl = prefixed.toLowerCase();
        const m = Object.keys(txnMap).find(k => k.toLowerCase() === pl);
        if (m) transactions = txnMap[m].slice();
      }
    }

    // Base-name match: strip "Total " from both sides and compare. Handles
    // cases where the client sends "Total X" but detail keys it as just "X",
    // or vice-versa with different casing/whitespace variations.
    if (!transactions.length) {
      const base = acct.replace(/^Total\s+/i, '').toLowerCase().trim();
      const m = Object.keys(txnMap).find(k => {
        const kb = k.replace(/^Total\s+/i, '').toLowerCase().trim();
        return kb === base;
      });
      if (m) transactions = txnMap[m].slice();
    }

    if (!transactions.length) {
      console.log('[account-detail] Miss for', JSON.stringify(acct),
        '— available keys:', Object.keys(txnMap).join(' | '));
    }

    // Sort newest-first
    transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({ connected: true, acct, month, transactions,
      // Include available keys on a miss so the client can detect the right name
      availableKeys: transactions.length ? undefined : Object.keys(txnMap) });
  } catch (err) {
    if (err._qboNoToken) return res.json({ connected: false, transactions: [] });
    console.error('[/api/account-detail]', err.response?.status || '', err.message);
    if (err.response?.status === 401) {
      qboTokens.accessToken = null;
    }
    res.json({ connected: false, transactions: [], error: err.message });
  }
});

// Returns the list of QBO account/section labels found in the most recent P&L.
// Use /api/qbo-accounts to verify mapping when a card shows $0.
app.get('/api/qbo-accounts', async (req, res) => {
  if (!qboReady()) return res.json({ connected: false });
  try {
    const token = await getQBOAccessToken();
    if (!token) return res.json({ connected: false });
    const now = new Date();
    const end = getReliableEndDate(now);
    const start = new Date(end.getFullYear(), end.getMonth() - 2, 1);
    const pnlRes = await axios.get(
      QBO_BASE + '/v3/company/' + qboTokens.realmId + '/reports/ProfitAndLoss',
      {
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
        params: {
          start_date: start.toISOString().slice(0, 10),
          end_date: end.toISOString().slice(0, 10),
          accounting_method: 'Cash',
          summarize_column_by: 'Month',
          minorversion: 75
        }
      }
    );
    const parsed = parseFinancialReport(pnlRes.data);
    res.json({ connected: true, months: parsed.months, accounts: Object.keys(parsed.accounts).sort() });
  } catch (err) {
    res.status(500).json({ connected: false, error: err.message });
  }
});

function parseQBOReconciliationStatus(report) {
  const cols = ((report.Columns && report.Columns.Column) || []).map(c => {
    const title = String(c.ColTitle || c.MetaData?.find(m => m.Name === 'ColKey')?.Value || '').trim();
    return title.toLowerCase();
  });
  const clrIdx = cols.findIndex(t => t === 'clr' || t === 'cleared' || t.includes('cleared'));
  if (clrIdx < 0) {
    return { available: false, reconciled: null, totalRows: 0, unreconciledRows: 0 };
  }

  let totalRows = 0;
  let unreconciledRows = 0;
  const statuses = {};

  function walk(rows) {
    if (!Array.isArray(rows)) return;
    rows.forEach(row => {
      if (row.ColData && row.ColData[clrIdx]) {
        const status = String(row.ColData[clrIdx].value || '').trim().toUpperCase();
        if (status) {
          totalRows += 1;
          statuses[status] = (statuses[status] || 0) + 1;
          if (status !== 'R') unreconciledRows += 1;
        }
      }
      if (row.Rows && row.Rows.Row) walk(row.Rows.Row);
    });
  }

  walk(report.Rows && report.Rows.Row);
  return {
    available: totalRows > 0,
    reconciled: totalRows > 0 ? unreconciledRows === 0 : null,
    totalRows,
    unreconciledRows,
    statuses
  };
}

app.get('/api/qbo-reconciliation', async (req, res) => {
  const month = String(req.query.month || '').trim();
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ connected: false, available: false, error: 'month must be YYYY-MM' });
  }
  if (!qboReady()) return res.json({ connected: false, available: false });

  try {
    const payload = await withCache('qbo-reconciliation:' + month, 4 * 60 * 60 * 1000, async () => {
      const token = await getQBOAccessToken();
      if (!token) {
        const err = new Error('no_token');
        err._qboNoToken = true;
        throw err;
      }

      const [year, monthNum] = month.split('-').map(Number);
      const startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`;
      const endDate = new Date(year, monthNum, 0).toISOString().slice(0, 10);
      const glRes = await axios.get(
        QBO_BASE + '/v3/company/' + qboTokens.realmId + '/reports/GeneralLedger',
        {
          headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
          params: {
            start_date: startDate,
            end_date: endDate,
            accounting_method: 'Cash',
            columns: 'date,txn_type,doc_num,name,memo,clr,account_name,split_acc,subt_nat_amount',
            minorversion: 75
          }
        }
      );

      return {
        connected: true,
        month,
        ...parseQBOReconciliationStatus(glRes.data)
      };
    });
    res.json(payload);
  } catch (err) {
    if (err._qboNoToken) return res.json({ connected: false, available: false });
    console.error('[/api/qbo-reconciliation]', err.response?.status || '', err.message);
    if (err.response?.status === 401) qboTokens.accessToken = null;
    res.json({ connected: false, available: false, error: err.message });
  }
});
// Balance Sheet — multi-month history + detailed account breakdown.
// Uses summarize_column_by=Month for a 13-month window so we get both
// historical bank-balance trend data and the current snapshot in one call.
// Returns: months[], bankHistory[], bankAccounts[], creditCardAccts[],
//          notesPayable[], plus all the summary snapshot fields.
app.get('/api/qbo-balance', async (req, res) => {
  if (!qboReady()) return res.json({ connected: false });
  const BAL_TTL = 4 * 60 * 60 * 1000;
  try {
    const payload = await withCache('qbo-balance', BAL_TTL, async () => {
    const token = await getQBOAccessToken();
    if (!token) {
      const err = new Error('no_token');
      err._qboNoToken = true;
      throw err;
    }

    // Balance sheet: end = today (we want the live current snapshot),
    // start = 12 months back (for the bank-balance history chart).
    const endDate   = new Date();
    const startDate = new Date(endDate);
    startDate.setMonth(startDate.getMonth() - 12);

    const bsRes = await axios.get(
      QBO_BASE + '/v3/company/' + qboTokens.realmId + '/reports/BalanceSheet',
      {
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
        params: {
          start_date:           startDate.toISOString().slice(0, 10),
          end_date:             endDate.toISOString().slice(0, 10),
          summarize_column_by:  'Month',
          accounting_method:    'Cash',
          minorversion:         75
        }
      }
    );

    // ── Parse column headers ─────────────────────────────────────
    // Col 0 = account label; remaining cols = one Money col per month.
    const rawCols   = (bsRes.data.Columns && bsRes.data.Columns.Column) || [];
    const moneyIdx  = [];   // positions in ColData that hold Money values
    const colTitles = [];   // human-readable month labels from QBO, e.g. "Jan 2026"
    rawCols.forEach((c, i) => {
      if (c.ColType === 'Money') { moneyIdx.push(i); colTitles.push(c.ColTitle || ''); }
    });

    // Convert "Jan 2026" or "Apr 1, 2026" → "2026-01"
    const MON = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
                  Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' };
    function toMonthKey(title) {
      const p = (title || '').trim().split(/\s+/);
      if (p.length === 2 && MON[p[0]]) return p[1] + '-' + MON[p[0]];           // "Jan 2026"
      if (p.length >= 3 && MON[p[0]]) return p[p.length-1] + '-' + MON[p[0]];  // "Apr 1, 2026"
      return title;
    }

    function parseVals(colData) {
      return moneyIdx.map(i =>
        parseFloat(((colData[i] && colData[i].value) || '0').replace(/,/g, '')) || 0
      );
    }

    // byName: label → [value per month column]
    const byName = {};
    // Per-section detail account arrays (current month balance only, non-zero)
    const bankAccts      = [];
    const creditCardAccts= [];
    const notesAccts     = [];
    // Per-bank-account history — same shape as bankHistory (one value per
    // month), keyed by exact account name. Lets the client chart a single
    // account (e.g. the "Planning Ahead" savings account) instead of the
    // combined bank-accounts total.
    const bankHistoryByAccount = {};

    // Walk the tree, tracking which section we're inside
    (function walk(rows, ctx) {
      if (!Array.isArray(rows)) return;
      rows.forEach(row => {
        // Determine child context from section header
        let childCtx = ctx;
        if (row.Header && row.Header.ColData) {
          const h  = (row.Header.ColData[0].value || '').trim();
          const hl = h.toLowerCase();
          if (hl === 'bank accounts' || hl.includes('bank account'))  childCtx = 'bank';
          else if (hl === 'credit cards' || hl.includes('credit card')) childCtx = 'cards';
          else if (hl === 'notes payable')                              childCtx = 'notes';
          else if (hl.includes('payroll liabilities'))                  childCtx = 'payroll';
        }

        // Section summary / total row
        if (row.Summary && row.Summary.ColData) {
          const n = (row.Summary.ColData[0].value || '').trim();
          if (n) byName[n] = parseVals(row.Summary.ColData);
        }

        // Individual account line
        if (row.ColData && row.ColData[0]) {
          const n    = (row.ColData[0].value || '').trim();
          const vals = parseVals(row.ColData);
          const cur  = vals[vals.length - 1] || 0;
          if (n) {
            byName[n] = vals;
            if      (childCtx === 'bank'    && cur !== 0) bankAccts.push({ name: n, balance: cur });
            else if (childCtx === 'cards'   && cur !== 0) creditCardAccts.push({ name: n, balance: cur });
            else if (childCtx === 'notes'   && cur !== 0) notesAccts.push({ name: n, balance: cur });
            // Capture per-bank-account history regardless of current-month
            // balance (a savings account might legitimately be flat at $0
            // in one column but have history we want to chart).
            if (childCtx === 'bank') bankHistoryByAccount[n] = vals;
          }
        }

        if (row.Rows && row.Rows.Row) walk(row.Rows.Row, childCtx);
      });
    })((bsRes.data.Rows && bsRes.data.Rows.Row) || [], null);

    // ── Extract summary values ───────────────────────────────────
    function findArr(kws) {
      for (const k of Object.keys(byName)) {
        const kl = k.toLowerCase();
        if (kws.every(kw => kl.includes(kw.toLowerCase()))) return byName[k];
      }
      return colTitles.map(() => 0);
    }
    function findLast(kws) {
      const arr = findArr(kws);
      return arr[arr.length - 1] || 0;
    }

    const bankHistoryArr = findArr(['total', 'bank']);
    const cash           = bankHistoryArr[bankHistoryArr.length - 1] || 0;
    const currentAssets  = findLast(['total current assets']);
    const currentLiabs   = findLast(['total current liabilities']);
    const longTermLiabs  = findLast(['total long-term liabilities'])
                        || findLast(['total long term liabilities']);
    let totalLiabs       = findLast(['total liabilities']);
    if (!totalLiabs) {
      const totalLE    = findLast(['total liabilities and equity'])
                      || findLast(['liabilities and equity']);
      const totalEquity = findLast(['total equity']);
      if (totalLE && totalEquity) totalLiabs = totalLE - totalEquity;
    }
    if (!totalLiabs) totalLiabs = (currentLiabs || 0) + (longTermLiabs || 0);
    const creditCards    = findLast(['total', 'credit card']);
    const payrollLiabs   = findLast(['total', 'payroll']);
    const currentRatio   = currentLiabs > 0 ? currentAssets / currentLiabs : null;

    const payload = {
      connected:    true,
      asOf:         endDate.toISOString().slice(0, 10),
      // Current snapshot
      cash, currentAssets,
      currentLiabilities:  currentLiabs,
      longTermLiabilities: longTermLiabs,
      totalLiabilities:    totalLiabs,
      creditCards, payrollLiabilities: payrollLiabs,
      currentRatio,
      // Account-level breakdown (current month only)
      bankAccounts:    bankAccts,
      creditCardAccts: creditCardAccts,
      notesPayable:    notesAccts,
      // Multi-month history
      months:      colTitles.map(toMonthKey),
      bankHistory: bankHistoryArr,
      bankHistoryByAccount
    };
    return payload;
    });  // ── end withCache factory ──
    res.json(payload);
  } catch (err) {
    if (err._qboNoToken) return res.json({ connected: false });
    console.error('[/api/qbo-balance]', err.response?.status || '', err.message);
    if (err.response?.status === 401) {
      qboTokens.accessToken = null;
      return res.json({ connected: false, reason: 'token_expired' });
    }
    res.status(500).json({ connected: false, error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// /api/debug/techs — post-migration data audit
// ────────────────────────────────────────────────────────────────────────────
// Pulls every completed job in the last N days (default 180), groups by the
// exact HCP employee record each job is attributed to, and returns:
//   - `employees`        : every unique tech seen — id/name/jobs/revenue
//   - `gillSuspects`     : employees whose name TOKEN matches "gill" or
//                          "gil" only (ST-migration records for Thomas Gill
//                          showing up under any first/last name spelling).
//                          Does NOT flag on a "Thomas" match alone — that
//                          would sweep in Thomas Agnew, a different tech
//                          whose profile was separately renamed, and
//                          merging him into Gill would cause the inverse
//                          data error the user is trying to prevent.
//   - `unnamedProfiles`  : employees with blank / "Unknown" names — usually
//                          orphaned migration shells, worth inspecting
//                          separately from the Gill question.
//   - `orphanJobs`       : completed jobs with ZERO assigned_employees;
//                          counted in totalJobs but excluded from every
//                          tech's revenue (common ST→HCP import gap).
//
// Tech attribution in HCP is by employee UUID, not by name — so if a
// ServiceTitan technician was imported as "Thomas Gill" under employee
// id A, and later re-created in HCP as "Gill Gill" under employee id B,
// the two appear as separate rows. Compare raw counts side-by-side here.
//
// Query params:
//   ?days=180   — window size, clamped to [30, 365]
//   ?q=gill     — substring filter on employee name (case-insensitive)
// ────────────────────────────────────────────────────────────────────────────
app.get('/api/debug/techs', async (req, res) => {
  if (!API_KEY) return res.status(503).json({ error: 'HCP API key not configured' });
  try {
    const days    = Math.min(Math.max(parseInt(req.query.days || '180', 10), 30), 365);
    const needle  = (req.query.q || '').toString().trim().toLowerCase();
    const headers = hcpHeaders();

    // Wide window: `days` + 90 extra so we capture jobs scheduled long ago
    // but completed inside the window (same lookback /api/metrics uses).
    const now   = new Date();
    const start = new Date(now); start.setDate(start.getDate() - days - 90);
    const end   = new Date(now); end.setDate(end.getDate() + 1);

    const pageSize = 200;
    const params = {
      work_status: ['completed'],
      scheduled_start_min: start.toISOString(),
      scheduled_start_max: end.toISOString(),
      page_size: pageSize
    };
    const first = await axios.get(BASE_URL + '/jobs', { headers, params: { ...params, page: 1 } });
    const jobs  = first.data.jobs || [];
    const total = first.data.total_pages || 1;
    if (total > 1) {
      const pages = [];
      for (let p = 2; p <= total; p++) {
        pages.push(axios.get(BASE_URL + '/jobs', { headers, params: { ...params, page: p } }));
      }
      const results = await Promise.all(pages);
      results.forEach(r => jobs.push(...(r.data.jobs || [])));
    }

    // Keep only jobs with a real completion date inside the window
    const winStart = new Date(now); winStart.setDate(winStart.getDate() - days);
    const completed = jobs.filter(j => {
      const c = j.work_timestamps && j.work_timestamps.completed_at;
      if (!c) return false;
      const d = new Date(c);
      return d >= winStart && d < end;
    });

    // Aggregate by employee id
    const byId = {};
    const orphanJobs = [];
    completed.forEach(job => {
      const revenue  = parseFloat(job.total_amount || 0) / 100;
      const doers    = job.assigned_employees || [];
      const customer = job.customer
        ? ((job.customer.first_name || '') + ' ' + (job.customer.last_name || '')).trim()
        : '';
      const completedAt = job.work_timestamps && job.work_timestamps.completed_at;

      if (doers.length === 0) {
        orphanJobs.push({
          id: job.id,
          invoice: job.invoice_number || null,
          customer,
          completedAt,
          amount: Math.round(revenue),
          description: job.description || null
        });
        return;
      }

      // Split revenue evenly across all assigned employees for the audit
      // (the real /api/metrics uses a seller/doer 1/3-2/3 split; this
      // endpoint's job is to show attribution, not repeat that math).
      const share = revenue / doers.length;
      doers.forEach(emp => {
        const id = emp.id;
        if (!byId[id]) {
          byId[id] = {
            id,
            first_name: emp.first_name || '',
            last_name:  emp.last_name  || '',
            name: ((emp.first_name || '') + ' ' + (emp.last_name || '')).trim() || '(blank)',
            jobs: 0,
            revenue: 0,
            firstSeen: completedAt,
            lastSeen:  completedAt
          };
        }
        byId[id].jobs    += 1;
        byId[id].revenue += share;
        if (completedAt && completedAt < byId[id].firstSeen) byId[id].firstSeen = completedAt;
        if (completedAt && completedAt > byId[id].lastSeen)  byId[id].lastSeen  = completedAt;
      });
    });

    const employees = Object.values(byId)
      .map(e => ({ ...e, revenue: Math.round(e.revenue) }))
      .sort((a, b) => b.jobs - a.jobs);

    // Gill-specific suspect list. `\bgill?\b` matches "gill" OR "gil" as
    // a whole word token (case-insensitive) — catches "Gill Gill",
    // "Thomas Gill", "Gil", "T Gill", "Gill T", etc. It intentionally
    // does NOT match "gilbert", "virgil", or a bare "thomas" — so Thomas
    // Agnew (a separate tech whose profile was renamed) cannot be swept
    // into this list and accidentally merged into Gill.
    const GILL_TOKEN = /\bgill?\b/i;
    const gillSuspects = employees.filter(e =>
      GILL_TOKEN.test(e.first_name) ||
      GILL_TOKEN.test(e.last_name)  ||
      GILL_TOKEN.test(e.name)
    );

    // Separately: employees with blank or placeholder names. These are
    // usually migration shells and deserve a human look, but they are
    // not automatically "Gill" — surfacing them in their own bucket
    // prevents confusion between the two data issues.
    const UNNAMED_RE = /^(unknown|\(blank\))$/i;
    const unnamedProfiles = employees.filter(e =>
      !e.first_name.trim() && !e.last_name.trim() || UNNAMED_RE.test(e.name.trim())
    );

    const filtered = needle
      ? employees.filter(e => e.name.toLowerCase().includes(needle))
      : employees;

    // ── ServiceTitan import audit ──────────────────────────────────
    // Any job in the window flagged as ST-origin, split into:
    //   - `postCutover` : dated on/after ST_CUTOVER — MIS-DATED imports
    //                     now filtered out of /api/metrics + /api/marketing
    //   - `preCutover`  : dated before cutover — legitimate ST-era work
    //                     (not filtered — they belong in their period)
    // The `matchedOn` field shows which job field triggered the ST
    // detection so you can verify the heuristic isn't over-matching.
    const stAll = completed.filter(isServiceTitanJob);
    const stPost = stAll.filter(isPostCutoverSTArtifact);
    const stPre  = stAll.filter(j => !isPostCutoverSTArtifact(j));
    function summarizeST(list) {
      return list.map(j => ({
        id: j.id,
        invoice: j.invoice_number || null,
        completedAt: j.work_timestamps && j.work_timestamps.completed_at,
        customer: j.customer
          ? ((j.customer.first_name || '') + ' ' + (j.customer.last_name || '')).trim()
          : '',
        employees: (j.assigned_employees || []).map(e =>
          ((e.first_name || '') + ' ' + (e.last_name || '')).trim()
        ),
        amount: Math.round(parseFloat(j.total_amount || 0) / 100),
        matchedOn: describeSTMatch(j)
      })).sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
    }

    res.json({
      window:  { days, from: winStart.toISOString(), to: end.toISOString() },
      totals:  {
        completedJobs:    completed.length,
        uniqueEmployees:  employees.length,
        orphanJobCount:   orphanJobs.length,
        orphanJobRevenue: Math.round(orphanJobs.reduce((s, j) => s + j.amount, 0))
      },
      serviceTitanAudit: {
        cutoverDate:        ST_CUTOVER.toISOString(),
        totalFlagged:       stAll.length,
        postCutoverExcluded:{
          count:   stPost.length,
          revenue: Math.round(stPost.reduce((s, j) => s + parseFloat(j.total_amount || 0) / 100, 0)),
          jobs:    summarizeST(stPost)
        },
        preCutoverKept: {
          count:   stPre.length,
          revenue: Math.round(stPre.reduce((s, j) => s + parseFloat(j.total_amount || 0) / 100, 0))
        }
      },
      gillSuspects,       // strictly Gill-pattern names — never Thomas Agnew
      unnamedProfiles,    // blank / unknown-name employees (separate issue)
      employees: filtered,// full list (or filtered by ?q=)
      orphanJobs          // jobs with no assigned employee
    });
  } catch (err) {
    console.error('[/api/debug/techs]', err.response?.status || '', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// /api/diagnostics/kpi — guarded KPI investigation data
// ────────────────────────────────────────────────────────────────────────────
// Requires DIAGNOSTICS_PASSWORD and either ?password=... or X-Diagnostics-Password.
// DIAGNOSTICS_TOKEN is still accepted as a backwards-compatible env var.
// Returns only the fields needed to diagnose missing technician KPI credit.
app.get('/api/diagnostics/kpi', async (req, res) => {
  if (!API_KEY) return res.status(503).json({ error: 'HCP API key not configured' });
  if (!DIAGNOSTICS_PASSWORD) {
    return res.status(403).json({ error: 'Diagnostics are disabled. Set DIAGNOSTICS_PASSWORD to enable this page.' });
  }
  if (!diagnosticsAllowed(req)) {
    return res.status(401).json({ error: 'Diagnostics password required.' });
  }

  const asDate = (value, fallback) => {
    if (!value) return fallback;
    const d = new Date(value);
    return isNaN(d.getTime()) ? fallback : d;
  };
  const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayEnd = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  const dollars = (value) => parseFloat(value || 0) / 100;
  const roundedDollars = (value) => Math.round(dollars(value));
  const personName = (p) => ((p && p.first_name || '') + ' ' + (p && p.last_name || '')).trim();
  const customerName = (obj) => obj && obj.customer ? personName(obj.customer) : '';
  const textMatches = (parts, needle) => !needle || parts.filter(Boolean).join(' ').toLowerCase().includes(needle);
  const dateKey = (d) => d.toISOString().slice(0, 10);
  const moneyKey = (value) => Math.round(Number(value || 0));
  const invoiceRoot = (invoice) => String(invoice || '').split('-')[0].trim().toLowerCase();
  const invoiceMatchesNeedle = (invoice, needle) => {
    if (!needle) return true;
    const inv = String(invoice || '').toLowerCase();
    return inv === needle || invoiceRoot(inv) === needle;
  };

  async function fetchPages(url, params, listKey, maxPages) {
    const out = [];
    const first = await axios.get(url, { headers: hcpHeaders(), params: { ...params, page: 1 } });
    out.push(...(first.data[listKey] || []));
    const totalPages = first.data.total_pages || 1;
    const fetchedPages = Math.min(totalPages, maxPages);
    for (let page = 2; page <= fetchedPages; page++) {
      const r = await axios.get(url, { headers: hcpHeaders(), params: { ...params, page } });
      out.push(...(r.data[listKey] || []));
    }
    return { items: out, totalPages, fetchedPages };
  }

  function summarizeInvoice(inv) {
    const invoiceNumber = inv.invoice_number || inv.number || null;
    return {
      id: inv.id || inv.uuid || inv.invoice_uuid || null,
      jobId: inv.job_id || null,
      invoiceNumber,
      status: inv.status || null,
      amount: roundedDollars(inv.amount),
      dueAmount: roundedDollars(inv.due_amount),
      paidAt: inv.paid_at || null,
      dueAt: inv.due_at || null,
      createdAt: inv.created_at || null,
      serviceDate: inv.service_date || null,
      paymentMethod: inv.payment_method || null,
      paymentCount: Array.isArray(inv.payments) ? inv.payments.length : 0,
      paymentMethods: Array.isArray(inv.payments)
        ? [...new Set(inv.payments.map(p => p.payment_method || p.method || p.category).filter(Boolean))]
        : []
    };
  }

  function summarizeEstimate(est) {
    if (!est) return null;
    const assigned = est.assigned_employees || [];
    return {
      id: est.id || est.uuid || null,
      estimateNumber: est.estimate_number || est.number || null,
      workStatus: est.work_status || null,
      approvalStatus: est.approval_status || null,
      customer: customerName(est),
      createdAt: est.created_at || null,
      updatedAt: est.updated_at || null,
      scheduledStart: est.schedule && (est.schedule.scheduled_start || est.schedule.start_time) || null,
      scheduledEnd: est.schedule && (est.schedule.scheduled_end || est.schedule.end_time) || null,
      assignedEmployees: assigned.map(emp => ({ id: emp.id, name: personName(emp) })),
      options: (est.options || []).map(option => ({
        id: option.id || null,
        name: option.name || null,
        optionNumber: option.option_number || null,
        totalAmount: roundedDollars(option.total_amount),
        approvalStatus: option.approval_status || null,
        status: option.status || null
      }))
    };
  }

  function uniqueEmployees(employees) {
    const byKey = {};
    (employees || []).forEach(emp => {
      if (!emp) return;
      const name = emp.name || personName(emp);
      const key = emp.id || name;
      if (!key) return;
      byKey[key] = { id: emp.id || null, name: name || emp.id || 'Unknown' };
    });
    return Object.values(byKey);
  }

  function attributionPreview(job, estimate, relatedEstimates, scheduleCandidates) {
    relatedEstimates = relatedEstimates || [];
    scheduleCandidates = scheduleCandidates || [];
    const total = roundedDollars(job.total_amount);
    const doers = uniqueEmployees((job.assigned_employees || []).map(emp => ({ id: emp.id, name: personName(emp) })));
    const override = findKpiAttributionOverride(job, estimate && (estimate.id || estimate.uuid));
    const overrideSellerNames = override && Array.isArray(override.sellerNames) ? override.sellerNames : [];
    const namesToEmployees = (names) => uniqueEmployees((names || []).map(name => {
        const key = normalizePersonName(name);
        return doers.find(emp => normalizePersonName(emp.name) === key)
          || { id: 'manual:' + key, name: String(name || '').trim() || 'Unknown' };
      }));
    const estimateEmployees = estimate ? uniqueEmployees((estimate.assigned_employees || []).map(emp => ({ id: emp.id, name: personName(emp) }))) : [];
    const estimateTagEmployees = namesToEmployees(sellerNamesFromResource(estimate));
    const jobTagEmployees = namesToEmployees(sellerNamesFromResource(job));

    let sellers = [];
    let sellerSource = 'none';
    let sellerConfidence = 'missing';
    if (overrideSellerNames.length) {
      sellers = namesToEmployees(overrideSellerNames);
      sellerSource = 'manual_override';
      sellerConfidence = 'confirmed';
    } else if (jobTagEmployees.length) {
      sellers = jobTagEmployees;
      sellerSource = 'job_tag_or_field';
      sellerConfidence = 'high';
    } else if (estimateTagEmployees.length) {
      sellers = estimateTagEmployees;
      sellerSource = 'estimate_tag_or_field';
      sellerConfidence = 'high';
    } else if (estimateEmployees.length) {
      sellers = estimateEmployees;
      sellerSource = 'linked_estimate_assigned_employee';
      sellerConfidence = 'high';
    } else {
      const relatedWithEmployees = doers.length > 1
        ? (relatedEstimates || []).map(est => {
          const assigned = uniqueEmployees((est.assigned_employees || []).map(emp => ({ id: emp.id, name: personName(emp) })));
          const tagged = namesToEmployees(sellerNamesFromResource(est));
          return { employees: assigned.length ? assigned : tagged, date: estimateRelevantDate(est) };
        }).filter(item => withinSellerLookback(item.date, jobScheduledStart(job) || kpiDateForJob(job)))
          .find(item => item.employees.length)
        : null;
      if (relatedWithEmployees) {
          sellers = relatedWithEmployees.employees;
          sellerSource = 'related_customer_estimate';
          sellerConfidence = 'medium';
      } else {
        const jobStart = jobScheduledStart(job) || kpiDateForJob(job);
        const addressKey = jobAddressKey(job);
        const customerKey = jobCustomerKey(job);
        const previous = (scheduleCandidates || [])
          .filter(function() { return doers.length > 1; })
          .filter(candidate => candidate && candidate.id !== job.id)
          .map(candidate => ({ job: candidate, start: jobScheduledStart(candidate) || jobCompletedAt(candidate) }))
          .filter(item => item.start && jobStart && withinSellerLookback(item.start, jobStart))
          .filter(item => jobCustomerKey(item.job) === customerKey || (addressKey && jobAddressKey(item.job) === addressKey))
          .sort((a, b) => b.start.getTime() - a.start.getTime())[0];
        if (previous) {
          sellers = uniqueEmployees((previous.job.assigned_employees || []).map(emp => ({ id: emp.id, name: personName(emp) })));
          sellerSource = 'previous_scheduled_visit';
          sellerConfidence = 'low';
        }
      }
    }
    const rows = {};
    const add = (emp, amount, role) => {
      const key = emp.id || emp.name;
      if (!key) return;
      if (!rows[key]) rows[key] = { id: emp.id || null, name: emp.name || emp.id || 'Unknown', credit: 0, roles: [] };
      rows[key].credit += amount;
      if (!rows[key].roles.includes(role)) rows[key].roles.push(role);
    };

    if (!doers.length) {
      return {
        status: 'cannot_preview',
        reason: 'No assigned technicians on the job.',
        rows: []
      };
    }

    if (!sellers.length) {
      doers.forEach(emp => add(emp, total / doers.length, 'did'));
      return {
        status: 'no_estimate_seller',
        reason: 'No linked estimate seller found, so the dashboard splits 100% across assigned technicians.',
        sellerSource,
        sellerConfidence,
        rows: Object.values(rows).map(row => ({ ...row, credit: Math.round(row.credit), percent: total ? Math.round((row.credit / total) * 100) : 0 }))
      };
    }

    const sellerPool = total / 3;
    const doerPool = total - sellerPool;
    sellers.forEach(emp => add(emp, sellerPool / sellers.length, 'sold'));
    doers.forEach(emp => add(emp, doerPool / doers.length, 'did'));

    return {
      status: 'using_estimate_seller',
      reason: sellerSource === 'previous_scheduled_visit'
        ? 'Seller credit is inferred from the previous scheduled visit for the same customer/address; doer credit is two-thirds across assigned technicians.'
        : sellerSource === 'related_customer_estimate'
          ? 'Seller credit is inferred from a related customer estimate; doer credit is two-thirds across assigned technicians.'
          : sellerSource === 'manual_override'
            ? 'Seller credit is one-third from a manual attribution override; doer credit is two-thirds across assigned technicians.'
            : 'Seller credit is one-third from HCP seller data; doer credit is two-thirds across assigned technicians.',
      sellerSource,
      sellerConfidence,
      rows: Object.values(rows).map(row => ({ ...row, credit: Math.round(row.credit), percent: total ? Math.round((row.credit / total) * 100) : 0 }))
    };
  }

  function inferDashboardRange(start, end) {
    const now = new Date();
    const todayStart = dayStart(now);
    const todayEnd = dayEnd(now);
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
    const sameDay = (a, b) => dateKey(a) === dateKey(b);

    if (sameDay(start, thisMonthStart) && sameDay(end, todayEnd)) return 'mtd';
    if (sameDay(start, lastMonthStart) && sameDay(end, lastMonthEnd)) return 'lm';
    if (sameDay(start, todayStart) && sameDay(end, todayEnd)) return 'day';
    return null;
  }

  async function buildDashboardComparison(range) {
    if (!range) {
      return {
        range: null,
        status: 'not_compared',
        reason: 'Selected dates do not match a dashboard quick range.'
      };
    }

    const r = await axios.get(`http://127.0.0.1:${PORT}/api/metrics`, {
      params: { range, refresh: 1 },
      timeout: HTTP_TIMEOUT
    });
    const data = r.data || {};
    const rows = [];
    (data.leaderboard || []).forEach(tech => {
      (tech.jobList || []).forEach(job => {
        rows.push({
          techId: tech.id,
          techName: tech.name,
          invoice: job.invoice || null,
          customer: job.customer || null,
          description: job.description || null,
          date: job.date || null,
          jobTotal: moneyKey(job.jobTotal),
          credit: moneyKey(job.credit),
          role: job.role || null
        });
      });
    });

    return {
      range,
      status: 'loaded',
      summary: data.summary || null,
      rowCount: rows.length,
      rows
    };
  }

  function compareToDashboard(job, matchedInvoices, dashboard) {
    if (!dashboard || dashboard.status !== 'loaded') {
      return {
        status: 'not_compared',
        range: dashboard && dashboard.range,
        reason: dashboard && dashboard.reason || 'Dashboard comparison was unavailable.'
      };
    }

    const invoiceNumbers = [
      job.invoice_number,
      ...matchedInvoices.map(inv => inv.invoice_number || inv.number)
    ].filter(Boolean).map(v => String(v).toLowerCase());
    const customer = customerName(job).toLowerCase();
    const jobTotal = moneyKey(dollars(job.total_amount));

    const matches = dashboard.rows.filter(row => {
      const rowInvoice = String(row.invoice || '').toLowerCase();
      const invoiceMatch = rowInvoice && invoiceNumbers.some(inv => rowInvoice === inv || invoiceRoot(rowInvoice) === invoiceRoot(inv));
      const customerMatch = customer && String(row.customer || '').toLowerCase() === customer;
      const amountMatch = jobTotal > 0 && Math.abs(moneyKey(row.jobTotal) - jobTotal) <= 1;
      return invoiceMatch || (customerMatch && amountMatch);
    });

    return {
      status: matches.length ? 'found_in_dashboard' : 'not_found_in_dashboard',
      range: dashboard.range,
      matchedRows: matches
    };
  }

  function summarizeJob(job, matchedInvoices, start, end, dashboard, estimate, relatedEstimates, scheduleCandidates) {
    matchedInvoices = matchedInvoices || [];
    relatedEstimates = relatedEstimates || [];
    const completedAt = job.work_timestamps && job.work_timestamps.completed_at;
    const kpiDate = kpiDateForJob(job);
    const assigned = job.assigned_employees || [];
    const paidInPeriod = matchedInvoices
      .filter(inv => inv.paid_at && new Date(inv.paid_at) >= start && new Date(inv.paid_at) < end)
      .reduce((sum, inv) => sum + dollars(inv.amount), 0);
    const completedInPeriod = !!(kpiDate && kpiDate >= start && kpiDate < end);
    const stExcluded = isPostCutoverSTArtifact(job);

    const skipReasons = [];
    if (!completedAt && !kpiDate) skipReasons.push('missing completed_at');
    else if (!completedAt && kpiDate) skipReasons.push('auto-closed after 3 days');
    else if (!completedInPeriod) skipReasons.push('KPI date outside selected period');
    if (stExcluded) skipReasons.push('excluded as ServiceTitan import artifact');
    if (assigned.length === 0) skipReasons.push('no assigned_employees');
    if (paidInPeriod <= 0 && !completedInPeriod) skipReasons.push('no matched paid invoice in selected period');

    const dashboardStatus = completedInPeriod && !stExcluded && assigned.length > 0
      ? 'counted_by_completed_job'
      : paidInPeriod > 0 && assigned.length > 0
        ? 'could_be_covered_by_paid_invoice_pass'
        : 'likely_skipped';

    return {
      id: job.id,
      invoiceNumber: job.invoice_number || null,
      workStatus: job.work_status || null,
      completedAt,
      kpiDate: kpiDate ? kpiDate.toISOString() : null,
      scheduledStart: job.schedule && job.schedule.scheduled_start,
      customer: customerName(job),
      description: job.description || null,
      jobTotal: roundedDollars(job.total_amount),
      outstandingBalance: roundedDollars(job.outstanding_balance),
      assignedEmployees: assigned.map(emp => ({ id: emp.id, name: personName(emp) })),
      originalEstimateId: job.original_estimate_id || (job.original_estimate_uuids && job.original_estimate_uuids[0]) || null,
      estimate: summarizeEstimate(estimate),
      relatedEstimates: relatedEstimates.map(summarizeEstimate).filter(Boolean),
      attributionOverride: findKpiAttributionOverride(job, estimate && (estimate.id || estimate.uuid) || estimateIdForJob(job)),
      attributionPreview: attributionPreview(job, estimate, relatedEstimates, scheduleCandidates),
      leadSource: typeof job.lead_source === 'string' ? job.lead_source : (job.lead_source && job.lead_source.name) || null,
      tags: toArrayish(job.tags).map(t => typeof t === 'string' ? t : (t && (t.name || t.value))).filter(Boolean),
      diagnostic: {
        dashboardStatus,
        skipReasons,
        completedInPeriod,
        serviceTitanExcluded: stExcluded,
        autoDatedComplete: isAutoDatedByCompletionLag(job),
        autoCompletionKind: autoCompletionKind(job),
        paidInPeriod: Math.round(paidInPeriod),
        matchedInvoiceCount: matchedInvoices.length,
        dashboardComparison: compareToDashboard(job, matchedInvoices, dashboard)
      },
      invoices: matchedInvoices.map(summarizeInvoice)
    };
  }

  try {
    const now = new Date();
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const start = dayStart(asDate(req.query.start, defaultStart));
    const end = dayEnd(asDate(req.query.end, now));
    const lookbackStart = new Date(start);
    lookbackStart.setDate(lookbackStart.getDate() - 90);
    const q = (req.query.q || '').toString().trim();
    const needle = q.toLowerCase();
    const invoiceNeedle = (req.query.invoice || '').toString().replace(/^#/, '').trim().toLowerCase();
    const jobId = (req.query.job_id || req.query.jobId || '').toString().trim();
    const invoiceId = (req.query.invoice_id || req.query.invoiceId || '').toString().trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit || '80', 10), 10), 200);
    const dashboardRange = (req.query.dashboard_range || req.query.dashboardRange || '').toString().trim() || inferDashboardRange(start, end);

    const out = {
      requestedAt: new Date().toISOString(),
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
        scheduledLookbackStart: lookbackStart.toISOString()
      },
      filters: { q, invoice: invoiceNeedle, jobId, invoiceId, limit, dashboardRange },
      interpretation: [
        'counted_by_completed_job: dashboard should count this from /jobs completed_at.',
        'could_be_covered_by_paid_invoice_pass: dashboard may count this from paid invoices if the job was not already completed/credited.',
        'likely_skipped: HCP fields suggest the dashboard rules may skip it.',
        'dashboardComparison.not_found_in_dashboard: checked the actual dashboard job rows and did not find a match.'
      ],
      dashboardComparison: {},
      direct: {},
      searches: {},
      candidates: [],
      unattachedInvoices: []
    };

    try {
      out.dashboardComparison = await buildDashboardComparison(dashboardRange);
    } catch (e) {
      out.dashboardComparison = {
        range: dashboardRange || null,
        status: 'not_compared',
        reason: 'Could not load /api/metrics for comparison: ' + (e.response?.status || e.message)
      };
    }

    const directJobs = [];
    const directInvoices = [];

    if (jobId) {
      const jobRes = await axios.get(BASE_URL + '/jobs/' + jobId, { headers: hcpHeaders() });
      directJobs.push(jobRes.data);
      try {
        const invRes = await axios.get(BASE_URL + '/jobs/' + jobId + '/invoices', { headers: hcpHeaders() });
        directInvoices.push(...(invRes.data.invoices || []));
      } catch (e) {
        out.direct.jobInvoicesError = e.response?.status || e.message;
      }
    }

    if (invoiceId) {
      const invRes = await axios.get(BASE_URL + '/invoices/' + invoiceId, { headers: hcpHeaders() });
      directInvoices.push(invRes.data);
      if (invRes.data && invRes.data.job_id) {
        try {
          const jobRes = await axios.get(BASE_URL + '/jobs/' + invRes.data.job_id, { headers: hcpHeaders() });
          directJobs.push(jobRes.data);
        } catch (e) {
          out.direct.invoiceJobError = e.response?.status || e.message;
        }
      }
    }

    const jobParams = {
      work_status: ['completed', 'in_progress', 'scheduled', 'unscheduled'],
      scheduled_start_min: lookbackStart.toISOString(),
      scheduled_start_max: end.toISOString(),
      page_size: 200
    };
    const jobs = await fetchPages(BASE_URL + '/jobs', jobParams, 'jobs', 8);
    out.searches.jobs = { fetched: jobs.items.length, totalPages: jobs.totalPages, fetchedPages: jobs.fetchedPages, params: jobParams };

    const jobMatches = jobs.items.filter(job => {
      const employees = (job.assigned_employees || []).map(personName).join(' ');
      const inv = (job.invoice_number || '').toString().toLowerCase();
      const matchesInvoice = invoiceMatchesNeedle(inv, invoiceNeedle);
      return matchesInvoice && textMatches([
        job.id,
        job.invoice_number,
        job.description,
        customerName(job),
        employees,
        job.work_status
      ], needle);
    }).slice(0, limit);

    const paidInvoiceParams = { paid_at_min: isoDateOnly(start), paid_at_max: inclusiveEndDateOnly(end), page_size: 200 };
    let paidInvoices = { items: [], totalPages: 0, fetchedPages: 0 };
    try {
      paidInvoices = await fetchPages(BASE_URL + '/invoices', paidInvoiceParams, 'invoices', 8);
      out.searches.paidInvoices = { fetched: paidInvoices.items.length, totalPages: paidInvoices.totalPages, fetchedPages: paidInvoices.fetchedPages, params: paidInvoiceParams };
    } catch (e) {
      out.searches.paidInvoices = { fetched: 0, error: e.response?.status || e.message, params: paidInvoiceParams };
    }

    const createdInvoiceParams = { created_at_min: isoDateOnly(lookbackStart), created_at_max: inclusiveEndDateOnly(end), page_size: 200 };
    let createdInvoices = { items: [], totalPages: 0, fetchedPages: 0 };
    try {
      createdInvoices = await fetchPages(BASE_URL + '/invoices', createdInvoiceParams, 'invoices', 8);
      out.searches.createdInvoices = { fetched: createdInvoices.items.length, totalPages: createdInvoices.totalPages, fetchedPages: createdInvoices.fetchedPages, params: createdInvoiceParams };
    } catch (e) {
      out.searches.createdInvoices = { fetched: 0, error: e.response?.status || e.message, params: createdInvoiceParams };
    }

    const invoiceById = {};
    [...paidInvoices.items, ...createdInvoices.items, ...directInvoices].forEach(inv => {
      const id = inv && (inv.id || inv.uuid || inv.invoice_uuid || inv.invoice_id);
      if (id) invoiceById[id] = inv;
    });
    const invoiceMatches = Object.values(invoiceById).filter(inv => {
      const invNum = (inv.invoice_number || inv.number || '').toString().toLowerCase();
      const matchesInvoice = invoiceMatchesNeedle(invNum, invoiceNeedle);
      return matchesInvoice && textMatches([
        inv.id,
        inv.uuid,
        inv.invoice_number,
        inv.number,
        inv.status,
        inv.payment_method,
        inv.job_id
      ], needle);
    }).slice(0, limit);

    const extraJobs = [];
    for (const id of [...new Set(invoiceMatches.map(inv => inv.job_id).filter(Boolean))]) {
      if (jobMatches.some(j => j.id === id) || directJobs.some(j => j.id === id)) continue;
      try {
        const r = await axios.get(BASE_URL + '/jobs/' + id, { headers: hcpHeaders() });
        extraJobs.push(r.data);
      } catch (_) {}
    }

    const knownJobIds = new Set([...directJobs, ...jobMatches, ...extraJobs].map(j => j && j.id).filter(Boolean));
    const knownInvoiceRoots = new Set([...directJobs, ...jobMatches, ...extraJobs]
      .map(j => invoiceRoot(j && j.invoice_number))
      .filter(Boolean));
    const splitSiblingInvoices = Object.values(invoiceById).filter(inv => {
      if (!inv.job_id || knownJobIds.has(inv.job_id)) return false;
      return knownInvoiceRoots.has(invoiceRoot(inv.invoice_number || inv.number));
    });
    for (const inv of splitSiblingInvoices) {
      try {
        const r = await axios.get(BASE_URL + '/jobs/' + inv.job_id, { headers: hcpHeaders() });
        extraJobs.push(r.data);
        knownJobIds.add(inv.job_id);
        invoiceMatches.push(inv);
      } catch (_) {}
    }

    if (invoiceNeedle) {
      const knownCustomerIds = [...new Set([...directJobs, ...jobMatches, ...extraJobs]
        .map(job => job && job.customer && job.customer.id)
        .filter(Boolean))];
      const customerSiblingJobs = [];

      for (const customerId of knownCustomerIds.slice(0, 5)) {
        try {
          const customerJobs = await fetchPages(
            BASE_URL + '/jobs',
            { customer_id: customerId, page_size: 200 },
            'jobs',
            3
          );
          customerSiblingJobs.push(...customerJobs.items);
        } catch (e) {
          out.searches.customerSiblingJobs = out.searches.customerSiblingJobs || [];
          out.searches.customerSiblingJobs.push({ customerId, error: e.response?.status || e.message });
        }
      }

      customerSiblingJobs.forEach(job => {
        if (!job || !job.id || knownJobIds.has(job.id)) return;
        if (!invoiceMatchesNeedle(job.invoice_number, invoiceNeedle)) return;
        extraJobs.push(job);
        knownJobIds.add(job.id);
      });

      for (const job of extraJobs) {
        if (!job || !job.id) continue;
        const alreadyHasInvoice = Object.values(invoiceById).some(inv => inv && inv.job_id === job.id);
        if (alreadyHasInvoice) continue;
        if (!invoiceMatchesNeedle(job.invoice_number, invoiceNeedle)) continue;

        try {
          const invRes = await axios.get(BASE_URL + '/jobs/' + job.id + '/invoices', { headers: hcpHeaders() });
          (invRes.data.invoices || []).forEach(inv => {
            const id = inv && (inv.id || inv.uuid || inv.invoice_uuid || inv.invoice_id);
            if (id) invoiceById[id] = inv;
            if (invoiceMatchesNeedle(inv && (inv.invoice_number || inv.number), invoiceNeedle)) {
              invoiceMatches.push(inv);
            }
          });
        } catch (e) {
          out.searches.customerSiblingInvoices = out.searches.customerSiblingInvoices || [];
          out.searches.customerSiblingInvoices.push({ jobId: job.id, error: e.response?.status || e.message });
        }
      }

      if (customerSiblingJobs.length) {
        out.searches.customerSiblingJobs = {
          fetched: customerSiblingJobs.length,
          customerIds: knownCustomerIds.slice(0, 5)
        };
      }
    }

    const allJobs = {};
    [...directJobs, ...jobMatches, ...extraJobs].forEach(job => { if (job && job.id) allJobs[job.id] = job; });
    const invoicesByJob = {};
    invoiceMatches.forEach(inv => {
      if (!inv.job_id) return;
      if (!invoicesByJob[inv.job_id]) invoicesByJob[inv.job_id] = [];
      invoicesByJob[inv.job_id].push(inv);
    });

    const candidateJobs = Object.values(allJobs);
    const estimatesById = {};
    const relatedEstimatesByCustomer = {};
    const estimateErrors = [];
    const linkedEstimateIds = [...new Set(candidateJobs.map(estimateIdForJob).filter(Boolean))];

    for (let i = 0; i < linkedEstimateIds.length; i += 6) {
      const batch = linkedEstimateIds.slice(i, i + 6);
      await Promise.all(batch.map(async id => {
        try {
          const r = await axios.get(BASE_URL + '/estimates/' + id, { headers: hcpHeaders() });
          if (r.data) estimatesById[id] = r.data;
        } catch (e) {
          estimateErrors.push({ id, error: e.response?.status || e.message });
        }
      }));
    }

    const customerIds = [...new Set(candidateJobs
      .map(job => job && job.customer && job.customer.id)
      .filter(Boolean))].slice(0, 8);

    for (const customerId of customerIds) {
      try {
        const related = await fetchPages(
          BASE_URL + '/estimates',
          {
            customer_id: customerId,
            scheduled_start_min: lookbackStart.toISOString(),
            scheduled_start_max: end.toISOString(),
            page_size: 100
          },
          'estimates',
          3
        );
        relatedEstimatesByCustomer[customerId] = related.items;
        related.items.forEach(est => {
          const id = est && (est.id || est.uuid);
          if (id && !estimatesById[id]) estimatesById[id] = est;
        });
      } catch (e) {
        estimateErrors.push({ customerId, error: e.response?.status || e.message });
      }
    }

    out.searches.estimates = {
      linkedRequested: linkedEstimateIds.length,
      linkedFetched: linkedEstimateIds.filter(id => estimatesById[id]).length,
      customerSearches: customerIds.length,
      relatedFetched: Object.values(relatedEstimatesByCustomer).reduce((sum, items) => sum + (items || []).length, 0),
      errors: estimateErrors
    };

    out.candidates = candidateJobs.map(job => {
      const linkedEstimateId = estimateIdForJob(job);
      const linkedEstimate = linkedEstimateId ? estimatesById[linkedEstimateId] : null;
      const customerId = job && job.customer && job.customer.id;
      const jobStart = jobScheduledStart(job) || kpiDateForJob(job);
      const relatedEstimates = (relatedEstimatesByCustomer[customerId] || [])
        .filter(est => !linkedEstimate || (est.id || est.uuid) !== (linkedEstimate.id || linkedEstimate.uuid))
        .filter(est => withinSellerLookback(estimateRelevantDate(est), jobStart))
        .slice(0, 5);
      return summarizeJob(job, invoicesByJob[job.id] || [], start, end, out.dashboardComparison, linkedEstimate, relatedEstimates, jobs.items);
    });
    out.unattachedInvoices = invoiceMatches.filter(inv => !inv.job_id).map(summarizeInvoice);

    res.json(out);
  } catch (err) {
    console.error('[/api/diagnostics/kpi]', err.response?.status || '', err.message);
    res.status(500).json({ error: err.message, status: err.response?.status || null });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// /api/diagnostics/coverage — money-first reconciliation
// ────────────────────────────────────────────────────────────────────────────
// Inverts the usual "filter → trust" flow. Instead of asking the dashboard
// "which jobs did you find?", this endpoint asks HCP "which dollars exist?"
// then verifies each one made it into the technician leaderboard.
//
// For the requested period:
//   1. Enumerate every paid invoice from HCP (paid_at_min/max, all statuses)
//   2. Pull the linked job for each invoice
//   3. Read the current /api/metrics leaderboard (warmed from cache or fetched)
//   4. Bucket each invoice into one of:
//        MATCHED       — credited to a tech, amounts agree
//        AMOUNT_DRIFT  — credited but the dollar value differs by > $1
//        MISSING       — not credited, no known exclusion reason
//        EXCLUDED      — not credited, has a known/expected reason
//                        (ServiceTitan import artifact, $0 amount, etc.)
//   5. For each MISSING invoice, run a "why" probe against the linked job:
//        no scheduled_start, no completed_at, no assigned_employees, etc.
//   6. Return the three reconciliation totals (paid, outstanding, count)
//      so a single eyeball check tells you whether to trust the period.
//
// Independent of the dashboard's filter logic — if creditJob/kpiDateForJob
// has a bug, this endpoint still reports the truth.
app.get('/api/diagnostics/coverage', async (req, res) => {
  if (!API_KEY) return res.status(503).json({ error: 'HCP API key not configured' });
  if (!DIAGNOSTICS_PASSWORD) {
    return res.status(403).json({ error: 'Diagnostics are disabled. Set DIAGNOSTICS_PASSWORD to enable this page.' });
  }
  if (!diagnosticsAllowed(req)) {
    return res.status(401).json({ error: 'Diagnostics password required.' });
  }

  const range = req.query.range || 'mtd';
  const forceRefresh = req.query.refresh === '1' || req.query.force === '1' || req.get('Cache-Control') === 'no-cache';

  // Cache the reconciliation separately from the dashboard's metrics
  // cache. 15-minute TTL because this endpoint does more HCP work than
  // /api/metrics — running it on every page hit would be wasteful when
  // the underlying invoice/job state changes slowly.
  const COVERAGE_TTL = 15 * 60 * 1000;
  const cacheKey = 'coverage:' + range;
  if (forceRefresh) {
    invalidateCachesByPrefix(['coverage:' + range, 'metrics:' + range, 'raw-jobs-short:', 'raw-short']);
  }

  try {
    const payload = await withCache(cacheKey, COVERAGE_TTL, async () => {
      const now = new Date();
      const period = getKpiPeriod(range, now);
      const { periodStart, periodEnd, periodLabel } = period;

      const headers = hcpHeaders();

      // ── PASS 1: Enumerate every paid invoice in the period ──────────
      // Server-side filter via paid_at_min/max, then client-side filter
      // for paid_at IN the period as a defense-in-depth against HCP
      // returning loose matches. Paginate fully — no maxPages cap because
      // missing a page would mean missing dollars.
      const invParams = {
        paid_at_min: periodStart.toISOString().slice(0, 10),
        paid_at_max: new Date(periodEnd.getTime() - 1).toISOString().slice(0, 10),
        page_size: 200
      };
      const allPaidInvoices = [];
      let invPage = 1;
      // Cap at 100 pages = 20,000 invoices as a runaway-safety bound
      while (invPage <= 100) {
        const r = await axios.get(BASE_URL + '/invoices', {
          headers, params: { ...invParams, page: invPage }
        });
        const invs = r.data.invoices || [];
        invs.forEach(inv => {
          if (!inv.paid_at) return;
          const paidAt = new Date(inv.paid_at);
          if (paidAt < periodStart || paidAt >= periodEnd) return;
          allPaidInvoices.push(inv);
        });
        if (invPage >= (r.data.total_pages || 1)) break;
        invPage++;
      }

      // Group invoices by job id. Track invoices with no job_id
      // separately — they're a different failure class (typically
      // standalone invoices not tied to a service job).
      const invoicesByJob = {};
      const orphanInvoices = [];
      allPaidInvoices.forEach(inv => {
        if (!inv.job_id) { orphanInvoices.push(inv); return; }
        if (!invoicesByJob[inv.job_id]) invoicesByJob[inv.job_id] = [];
        invoicesByJob[inv.job_id].push(inv);
      });

      // ── PASS 2: Fetch every linked job directly by id ───────────────
      // /jobs/{id} bypasses scheduled_start filtering entirely — if HCP
      // has the job, we get it. This is the key independence guarantee.
      const jobIds = Object.keys(invoicesByJob);
      const jobsById = {};
      const BATCH = 10;
      for (let i = 0; i < jobIds.length; i += BATCH) {
        const batch = jobIds.slice(i, i + BATCH);
        const results = await Promise.all(batch.map(id =>
          axios.get(BASE_URL + '/jobs/' + id, { headers })
            .then(r => r.data)
            .catch(err => ({ _fetchError: err.response?.status || err.message, id }))
        ));
        results.forEach(j => { if (j && j.id) jobsById[j.id] = j; });
      }

      // ── PASS 3: Read the dashboard's leaderboard for this range ─────
      // The dashboard credit pass already ran (or will run, then SWR
      // back-revalidates) via /api/metrics. We share its cache key, so
      // calling withCache here just reads the existing entry without
      // re-fetching from HCP. If somehow it's not warmed yet, we still
      // get a deterministic answer by reading the cached entry directly
      // and falling back to "no data" — the reconciliation then shows
      // every invoice as MISSING, which is a useful signal in itself.
      let dashboardEntry = _cache.get('metrics:' + range);
      if (!dashboardEntry) {
        try {
          await axios.get('http://127.0.0.1:' + PORT + '/api/metrics', {
            params: { range },
            timeout: 60000
          });
          dashboardEntry = _cache.get('metrics:' + range);
        } catch (warmErr) {
          console.warn('[coverage warm metrics]', warmErr.response?.status || '', warmErr.message);
        }
      }
      const dashboardData = dashboardEntry ? dashboardEntry.data : null;

      // Build invoice→credit lookup from the leaderboard's per-tech
      // jobLists. The dashboard credits at job-level, attaching
      // `invoice_number` to each row. We sum credit across techs to
      // get the total credited for each invoice number.
      const creditedByInvoice = {};
      const creditedByJobId = {}; // for matching when invoice_number is null
      if (dashboardData && Array.isArray(dashboardData.leaderboard)) {
        dashboardData.leaderboard.forEach(tech => {
          (tech.jobList || []).forEach(row => {
            if (row.invoice) {
              const key = String(row.invoice).trim();
              creditedByInvoice[key] = (creditedByInvoice[key] || 0) + (row.credit || 0);
            }
          });
        });
      }

      // ── PASS 4: Reconcile each invoice ─────────────────────────────
      const ROOT = (n) => String(n || '').split('-')[0].trim();
      const matched = [];
      const drift = [];
      const missing = [];
      const excluded = [];

      // Walks the dashboard's actual credit pipeline for a single job
      // and returns the SPECIFIC checkpoint that would have prevented
      // crediting. This replaces the old "list any HCP data-quality
      // flag" probe, which surfaced cosmetic issues (like no linked
      // estimate) that aren't actually exclusion criteria.
      //
      // The probe simulates the same control flow used by /api/metrics
      // (primary pass first, gap pass second), so its conclusions
      // explain why this specific job's dollars don't appear in the
      // leaderboard.
      function whyMissing(job, invs, paidInPeriod) {
        if (!job) {
          return {
            verdict: 'job_fetch_failed',
            blocker: 'HCP returned no data for job_id ' + (invs[0] && invs[0].job_id),
            fix: 'Open the job in HCP — it may have been archived or deleted. ' +
                 'If it should count, add a manual KPI override.',
            details: []
          };
        }

        const doers = job.assigned_employees || [];
        const scheduled = job.schedule && job.schedule.scheduled_start;
        const completed = job.work_timestamps && job.work_timestamps.completed_at;
        const status = job.work_status || null;
        const stHit = isPostCutoverSTArtifact(job);

        const kpiDate = kpiDateForJob(job);
        const inPeriod = kpiDate && kpiDate >= periodStart && kpiDate < periodEnd;

        // Where in the pipeline would this job have been credited?
        const details = {
          workStatus: status,
          hasCompletedAt: !!completed,
          hasScheduledStart: !!scheduled,
          assignedCount: doers.length,
          kpiDate: kpiDate ? kpiDate.toISOString() : null,
          kpiDateInPeriod: inPeriod,
          paidInPeriod,
          isSTArtifact: stHit
        };

        if (stHit) {
          return {
            verdict: 'st_artifact_blocked',
            blocker: 'Job tagged as ServiceTitan migration artifact (excluded by design)',
            fix: 'If this is real post-cutover work mistakenly tagged as ST, ' +
                 'remove the ServiceTitan tag/lead-source from the job in HCP.',
            details
          };
        }

        if (doers.length === 0) {
          return {
            verdict: 'no_assigned_employees',
            blocker: 'Job has no assigned technician in HCP — nobody to credit',
            fix: 'Open the job in HCP, add the tech who did the work as an ' +
                 'assigned employee. The next refresh will pick them up.',
            details
          };
        }

        // Primary-pass path: would this job have appeared in
        // /jobs?work_status=completed,in_progress,scheduled
        // &scheduled_start_min/max ?
        const primaryQueryWouldFind = (() => {
          if (!scheduled) return false;
          const sd = new Date(scheduled);
          const days = (Date.now() - sd.getTime()) / (1000 * 60 * 60 * 24);
          if (days > 270) return false;
          return true;
        })();
        const primaryFilterWouldKeep = inPeriod;

        if (primaryQueryWouldFind && primaryFilterWouldKeep) {
          // The primary pass should have credited this. If it didn't,
          // something earlier in the pipeline failed — most likely the
          // bulk /jobs query didn't return assigned_employees fully,
          // or the gap pass aborted before reaching this job.
          return {
            verdict: 'primary_should_have_credited',
            blocker: 'Job meets every primary-pass criterion (scheduled in window, ' +
                     'completed in period, has assigned employees). It should appear ' +
                     'on the leaderboard but doesn\'t. Likely cause: the coverage-gap ' +
                     'pass aborted on an HCP error before processing this job, OR the ' +
                     'bulk /jobs query returned this job without assigned_employees ' +
                     'populated.',
            fix: 'Trigger a fresh /api/metrics?range=' + range + ' fetch (clears ' +
                 'the 2-minute cache) and check whether it appears. If not, the gap ' +
                 'pass is the culprit — check server logs for "[/api/tech coverage-pass]" warnings.',
            details
          };
        }

        // Primary pass would NOT find it. Gap pass should rescue.
        const gapPassWouldFind = !!invs.find(i => i.job_id === job.id);
        const gapPassWouldCredit = gapPassWouldFind && doers.length > 0 &&
          (kpiDate == null || inPeriod);

        if (gapPassWouldCredit) {
          return {
            verdict: 'gap_pass_should_have_credited',
            blocker: 'Primary pass excludes (no scheduled_start in window) but the ' +
                     'gap pass should rescue this via /invoices. Since it didn\'t, ' +
                     'the gap pass likely aborted on an HCP error before reaching ' +
                     'this job, OR the dashboard cache is stale.',
            fix: 'Force-refresh the dashboard for this range. Check Railway logs ' +
                 'for "[/api/tech coverage-pass]" warnings around the cache-warm time.',
            details
          };
        }

        // Genuinely excluded by the pipeline.
        const reasons = [];
        if (!primaryQueryWouldFind) {
          if (!scheduled) reasons.push('No scheduled_start (primary /jobs query needs it)');
          else reasons.push('scheduled_start is ' + scheduled.slice(0, 10) + ', outside 270-day fetch window');
        }
        if (!primaryFilterWouldKeep) {
          if (!kpiDate) reasons.push('Cannot compute KPI date (no completed_at, no usable scheduled_start)');
          else reasons.push('KPI date ' + kpiDate.toISOString().slice(0, 10) + ' is outside the period');
        }
        return {
          verdict: 'legitimately_excluded',
          blocker: reasons.join('; ') || 'Unknown exclusion path',
          fix: !completed
            ? 'Mark this job complete in HCP (add a completed_at timestamp). ' +
              'The dashboard needs that to know when the work happened.'
            : !scheduled
            ? 'Add a scheduled_start to the job in HCP, OR add a manual KPI override ' +
              'pointing this job at the correct period.'
            : 'Add a manual KPI override or correct the job\'s dates in HCP.',
          details
        };
      }

      jobIds.forEach(jobId => {
        const invs = invoicesByJob[jobId];
        const job = jobsById[jobId];
        const paidInPeriod = invs.reduce((s, inv) => s + parseFloat(inv.amount || 0) / 100, 0);
        const totalPaidRounded = Math.round(paidInPeriod);
        const invoiceNumbers = invs.map(i => i.invoice_number).filter(Boolean);
        const invoiceRoots = [...new Set(invoiceNumbers.map(ROOT))];
        const latestPaidAt = invs.map(i => i.paid_at).filter(Boolean).sort().pop() || null;
        const customer = job && job.customer
          ? ((job.customer.first_name || '') + ' ' + (job.customer.last_name || '')).trim()
          : (invs[0].customer ? ((invs[0].customer.first_name || '') + ' ' + (invs[0].customer.last_name || '')).trim() : '');

        // Try to find credit by invoice number OR root number
        let creditFound = 0;
        for (const num of invoiceNumbers) {
          if (creditedByInvoice[num] != null) { creditFound += creditedByInvoice[num]; }
        }
        if (creditFound === 0) {
          // Try matching by root number (handles split invoices where
          // the dashboard stored "326" but HCP returned "326-1" and "326-2")
          for (const root of invoiceRoots) {
            for (const [k, v] of Object.entries(creditedByInvoice)) {
              if (ROOT(k) === root) creditFound += v;
            }
          }
        }
        const creditFoundRounded = Math.round(creditFound);

        const row = {
          jobId,
          invoiceNumbers,
          customer,
          paidInPeriod: totalPaidRounded,
          credited: creditFoundRounded,
          latestPaidAt,
          workStatus: job ? job.work_status : null,
          completedAt: job && job.work_timestamps ? job.work_timestamps.completed_at : null,
          scheduledStart: job && job.schedule ? job.schedule.scheduled_start : null,
          assignedEmployees: job && job.assigned_employees
            ? job.assigned_employees.map(e => ((e.first_name || '') + ' ' + (e.last_name || '')).trim()).filter(Boolean)
            : [],
          description: job ? job.description : null
        };

        // ServiceTitan post-cutover artifacts are intentionally excluded
        // by the main dashboard. Surface them in the EXCLUDED bucket
        // with their reason so the auditor can verify it was deliberate.
        if (job && periodStart >= ST_CUTOVER && isServiceTitanJob(job)) {
          excluded.push({ ...row, reason: 'ServiceTitan migration artifact (' + describeSTMatch(job) + ')' });
          return;
        }

        if (creditFoundRounded === 0) {
          // whyMissing wants the full invoices array (for .find(i =>
          // i.job_id === ...) in the gap-pass simulation) plus the
          // computed paid total. Passing invs[0] alone breaks .find.
          missing.push({ ...row, reasons: whyMissing(job, invs, paidInPeriod) });
        } else if (Math.abs(creditFoundRounded - totalPaidRounded) > 1) {
          drift.push({ ...row, delta: creditFoundRounded - totalPaidRounded });
        } else {
          matched.push(row);
        }
      });

      // ── Reconciliation totals ──────────────────────────────────────
      const truthTotalPaid = Math.round(allPaidInvoices.reduce((s, inv) =>
        s + parseFloat(inv.amount || 0) / 100, 0));
      const dashboardTotalRevenue = dashboardData && dashboardData.summary
        ? dashboardData.summary.totalRevenue : null;

      return {
        period: {
          range,
          label: periodLabel,
          start: periodStart.toISOString().slice(0, 10),
          end: new Date(periodEnd.getTime() - 1).toISOString().slice(0, 10)
        },
        truth: {
          totalPaidInPeriod: truthTotalPaid,
          paidInvoiceCount: allPaidInvoices.length,
          uniqueJobCount: jobIds.length,
          invoicesWithNoJobLink: orphanInvoices.length
        },
        dashboard: {
          totalRevenue: dashboardTotalRevenue,
          cached: !!dashboardEntry,
          cacheAge: dashboardEntry ? Math.round((Date.now() - dashboardEntry.at) / 1000) : null,
          note: dashboardEntry ? null : 'Dashboard cache cold — open /api/metrics?range=' + range + ' to warm it, then refresh.'
        },
        reconciliation: {
          delta: dashboardTotalRevenue != null ? truthTotalPaid - dashboardTotalRevenue : null,
          matched: matched.length,
          drift: drift.length,
          missing: missing.length,
          excluded: excluded.length,
          standaloneInvoices: orphanInvoices.length
        },
        buckets: {
          missing,
          drift,
          excluded,
          standaloneInvoices: orphanInvoices.map(inv => ({
            invoiceNumber: inv.invoice_number || null,
            amount: Math.round(parseFloat(inv.amount || 0) / 100),
            paidAt: inv.paid_at,
            customer: inv.customer
              ? ((inv.customer.first_name || '') + ' ' + (inv.customer.last_name || '')).trim()
              : '',
            reason: 'Invoice has no job_id — typically a standalone invoice not tied to a service job'
          })),
          matchedSummary: { count: matched.length, dollars: matched.reduce((s, r) => s + r.paidInPeriod, 0) }
        }
      };
    });
    res.json(payload);
  } catch (err) {
    console.error('[/api/diagnostics/coverage]', err.response?.status || '', err.message);
    res.status(500).json({ error: err.message, where: err.response?.status || 'unknown' });
  }
});

// Serve the coverage diagnostic page (static HTML; auth happens on the API)
app.get('/coverage', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'coverage.html'));
});

// ────────────────────────────────────────────────────────────────────────────
// KPI feedback + admin reconciliation API
// ────────────────────────────────────────────────────────────────────────────
// Two-sided system:
//   • /report-issue (tech-facing, no auth) writes to issue-reports
//   • /admin/kpi    (admin-facing, password-gated) reads issue reports +
//                    reads/writes reconciliations
// Reconciliations are authoritative — see creditJob() above for how they
// short-circuit the normal credit logic. Each reconciliation is locked
// once saved; the auto-pipeline can never overwrite it.

// Parse JSON bodies on the API endpoints below
app.use(express.json({ limit: '50kb' }));

// ── Tech-facing endpoints ────────────────────────────────────────────────

// Submit a new issue report. No auth — anyone with the URL can submit.
// Rate-limited softly by ignoring requests larger than 50kb (above) so a
// single misbehaving client can't fill the volume.
app.post('/api/kpi/report-issue', (req, res) => {
  const body = req.body || {};
  const type = String(body.type || '').slice(0, 50);
  // Reporter name is optional — the form no longer collects it. Kept
  // as a passthrough in case any older client still sends one.
  const reporterName = String(body.reporterName || '').slice(0, 100).trim() || null;
  const invoice = String(body.invoice || '').slice(0, 50).trim();
  const customer = String(body.customer || '').slice(0, 100).trim();
  const jobId = String(body.jobId || '').slice(0, 100).trim();
  const description = String(body.description || '').slice(0, 2000).trim();

  if (!type || !description) {
    return res.status(400).json({ error: 'type and description are required' });
  }

  const report = {
    id: newReportId(),
    type,
    reporterName,
    invoice: invoice || null,
    customer: customer || null,
    jobId: jobId || null,
    description,
    status: 'open',
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    resolvedBy: null,
    resolutionNote: null
  };

  const reports = loadIssueReports();
  reports.push(report);
  if (!saveIssueReports(reports)) {
    return res.status(500).json({ error: 'Failed to save report' });
  }
  res.json({ ok: true, report });
});

// Discover who's actually a technician by looking at job assignments.
// An "active tech" is any HCP employee who's been on >= MIN_JOBS
// complete jobs within the last 90 days. The threshold filters out
// office staff (accountant, CSR, etc.) who occasionally get added to
// a job by mistake or for tracking — they don't rack up enough
// assignments to count. New apprentice techs catch up fast: even a
// slow start (one job per week) puts them over the bar in 3 weeks.
//
// Returns a Set of HCP employee IDs. Cached 4 hours.
const ACTIVE_TECH_MIN_JOBS = 3;
async function getActiveTechIds() {
  const ids = await withCache('active-tech-ids', 4 * 60 * 60 * 1000, async () => {
    const since = new Date();
    since.setDate(since.getDate() - 90);
    const counts = {};
    let page = 1;
    while (page <= 25) {
      const r = await axios.get(BASE_URL + '/jobs', {
        headers: hcpHeaders(),
        params: {
          work_status: 'completed',
          scheduled_start_min: since.toISOString(),
          page,
          page_size: 200
        }
      });
      const jobs = r.data.jobs || [];
      jobs.forEach(j => (j.assigned_employees || []).forEach(e => {
        if (e && e.id) counts[e.id] = (counts[e.id] || 0) + 1;
      }));
      if (page >= (r.data.total_pages || 1)) break;
      page++;
    }
    const active = Object.keys(counts).filter(id => counts[id] >= ACTIVE_TECH_MIN_JOBS);
    return active.length ? active : Object.keys(counts);
  });
  return new Set(ids);
}

// Walk the raw HCP employee list, filter to active techs (per
// getActiveTechIds), and dedupe by name. HCP sometimes has two records
// for the same person (mistaken duplicate accounts) — the active one
// will be in `activeTechIds` because they're getting job assignments,
// so name-dedup keeps the right one and drops the stale ghost.
async function fetchTechEmployees() {
  const activeTechIds = await getActiveTechIds();
  const all = [];
  let page = 1;
  while (page <= 10) {
    const r = await axios.get(BASE_URL + '/employees', {
      headers: hcpHeaders(),
      params: { page, page_size: 100, sort_by: 'first_name', sort_direction: 'asc' }
    });
    const emps = r.data.employees || [];
    all.push(...emps);
    if (page >= (r.data.total_pages || 1)) break;
    page++;
  }
  const seenNames = new Set();
  return all
    .filter(e => activeTechIds.has(e.id))
    .map(e => ({
      id: e.id,
      name: ((e.first_name || '') + ' ' + (e.last_name || '')).trim(),
      role: e.role || null
    }))
    .filter(e => e.name)
    .filter(e => {
      // Normalize whitespace + non-breaking spaces so "Levi  Otis"
      // and "Levi Otis" dedupe as the same person.
      const key = e.name.toLowerCase().replace(/\s+/g, ' ').replace(/ /g, ' ').trim();
      if (seenNames.has(key)) return false;
      seenNames.add(key);
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Public list of active techs. Used by the report-issue page's
// seller/doer pickers. Returns names only — no IDs, no roles, no
// email. Cached 4 hours.
app.get('/api/employees/public', async (req, res) => {
  if (!API_KEY) return res.status(503).json({ error: 'HCP API key not configured' });
  try {
    const payload = await withCache('public-employees', 4 * 60 * 60 * 1000, async () => {
      const techs = await fetchTechEmployees();
      return { employees: techs.map(t => ({ name: t.name })) };
    });
    res.json(payload);
  } catch (err) {
    console.error('[employees/public]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// List recent reports (tech-facing view). Last 25, newest first.
// Public so techs can see whether their issue is already in queue.
app.get('/api/kpi/recent-reports', (req, res) => {
  const reports = loadIssueReports()
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 25);
  // Don't expose internal notes/resolution fields to the tech-facing list.
  res.json({
    reports: reports.map(r => ({
      id: r.id,
      type: r.type,
      reporterName: r.reporterName,
      invoice: r.invoice,
      customer: r.customer,
      description: r.description,
      status: r.status,
      createdAt: r.createdAt
    }))
  });
});

// ── Admin endpoints (password-gated) ─────────────────────────────────────

function requireAdmin(req, res) {
  if (!DIAGNOSTICS_PASSWORD) {
    res.status(403).json({ error: 'Admin disabled. Set DIAGNOSTICS_PASSWORD to enable.' });
    return false;
  }
  if (!diagnosticsAllowed(req)) {
    res.status(401).json({ error: 'Admin password required.' });
    return false;
  }
  return true;
}

// List all issue reports (no truncation — admin sees everything)
app.get('/api/kpi/admin/issues', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const reports = loadIssueReports()
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ reports });
});

// Update an issue's status (resolve / dismiss / re-open)
app.post('/api/kpi/admin/issues/:id/status', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const id = req.params.id;
  const newStatus = String((req.body || {}).status || '').toLowerCase();
  const note = String((req.body || {}).note || '').slice(0, 500).trim();
  const by = String((req.body || {}).by || 'admin').slice(0, 80).trim();

  if (!['open', 'resolved', 'dismissed'].includes(newStatus)) {
    return res.status(400).json({ error: 'status must be open|resolved|dismissed' });
  }
  const reports = loadIssueReports();
  const idx = reports.findIndex(r => r.id === id);
  if (idx < 0) return res.status(404).json({ error: 'Report not found' });
  reports[idx].status = newStatus;
  reports[idx].resolvedAt = (newStatus === 'open') ? null : new Date().toISOString();
  reports[idx].resolvedBy = (newStatus === 'open') ? null : by;
  reports[idx].resolutionNote = note || null;
  if (!saveIssueReports(reports)) return res.status(500).json({ error: 'Save failed' });
  res.json({ ok: true, report: reports[idx] });
});

// Fetch a specific HCP job for the admin editor
app.get('/api/kpi/admin/job/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (!API_KEY) return res.status(503).json({ error: 'HCP API key not configured' });
  try {
    const r = await axios.get(BASE_URL + '/jobs/' + req.params.id, { headers: hcpHeaders() });
    const job = r.data;
    // Convenience fields for the editor — no business logic, just shape.
    const total = parseFloat(job.total_amount || 0) / 100;
    const completed = job.work_timestamps && job.work_timestamps.completed_at;
    const scheduled = job.schedule && job.schedule.scheduled_start;
    res.json({
      ok: true,
      job: {
        id: job.id,
        invoice: job.invoice_number,
        description: job.description,
        workStatus: job.work_status,
        customer: job.customer
          ? ((job.customer.first_name || '') + ' ' + (job.customer.last_name || '')).trim() : '',
        assignedEmployees: (job.assigned_employees || []).map(e => ({
          id: e.id,
          name: ((e.first_name || '') + ' ' + (e.last_name || '')).trim()
        })),
        totalAmount: total,
        outstandingBalance: Math.max(0, parseFloat(job.outstanding_balance || 0) / 100),
        completedAt: completed || null,
        scheduledStart: scheduled || null
      },
      // The active reconciliation (if any) so the editor can pre-fill
      reconciliation: loadReconciliations()[job.id] || null
    });
  } catch (err) {
    console.error('[admin/job]', err.response?.status || '', err.message);
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

// List active HCP technicians — used by the admin reconciliation editor
// to populate the "Add tech" dropdown so admins pick from a real list
// instead of typing names by hand. Same filter as /api/employees/public:
// only people who've been assigned to a complete job in the last 90
// days. Cached 4 hours since the roster rarely changes day-to-day.
app.get('/api/kpi/admin/employees', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (!API_KEY) return res.status(503).json({ error: 'HCP API key not configured' });
  try {
    const payload = await withCache('admin-employees', 4 * 60 * 60 * 1000, async () => {
      const techs = await fetchTechEmployees();
      return { employees: techs };
    });
    res.json(payload);
  } catch (err) {
    console.error('[admin/employees]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Resolve an invoice number → HCP job_id. Used by the admin UI when
// the period-jobs list has a row with an invoice but no jobId (rare
// edge case; most rows now have both). Searches the last 365 days of
// /invoices for an exact invoice_number match. If multiple matches,
// returns the most recently created.
app.get('/api/kpi/admin/job-by-invoice', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (!API_KEY) return res.status(503).json({ error: 'HCP API key not configured' });
  const invoice = String(req.query.invoice || '').trim();
  if (!invoice) return res.status(400).json({ error: 'invoice query param required' });
  try {
    const headers = hcpHeaders();
    // No direct search-by-invoice-number endpoint exists, so we use a
    // wide date range + filter client-side. 365 days is enough for any
    // reasonable admin workflow; longer-ago jobs can use the manual
    // job_id paste flow.
    const start = new Date();
    start.setDate(start.getDate() - 365);
    const params = {
      created_at_min: start.toISOString(),
      created_at_max: new Date().toISOString(),
      page_size: 200
    };
    const matches = [];
    const target = invoice.replace(/^#/, '').toLowerCase();
    let page = 1;
    while (page <= 25) {
      const r = await axios.get(BASE_URL + '/invoices', { headers, params: { ...params, page } });
      const invs = r.data.invoices || [];
      invs.forEach(inv => {
        const num = String(inv.invoice_number || '').toLowerCase();
        if (num === target || num.split('-')[0] === target) matches.push(inv);
      });
      if (matches.length > 0 || page >= (r.data.total_pages || 1)) break;
      page++;
    }
    if (matches.length === 0) return res.status(404).json({ error: 'No invoice match found' });
    // Pick most recent
    matches.sort((a, b) => new Date(b.created_at || b.invoice_date || 0) - new Date(a.created_at || a.invoice_date || 0));
    const winner = matches[0];
    if (!winner.job_id) return res.status(404).json({ error: 'Invoice found but has no linked job_id' });
    res.json({ jobId: winner.job_id, invoice: winner.invoice_number });
  } catch (err) {
    console.error('[admin/job-by-invoice]', err.response?.status || '', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Save a reconciliation. Supports two flows in one endpoint:
//   • Full reconcile — body has assignments[] with %s summing to 100,
//     optional totalAmount, kpiDate, notes. Locks the job's
//     attribution against the auto-pipeline.
//   • Exclude-only — body has { jobId, excluded: true }. No
//     assignments required because the job won't appear anywhere.
//     Used to take ServiceTitan artifacts, accidental jobs, or
//     duplicate invoices off the dashboard entirely.
// In both modes the previous record gets appended to history[].
app.post('/api/kpi/admin/reconcile', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const body = req.body || {};
  const jobId = String(body.jobId || '').trim();
  if (!jobId) return res.status(400).json({ error: 'jobId required' });

  const excluded   = body.excluded === true;
  const markedPaid = body.markedPaid === true;

  // Assignments are required UNLESS the job is being excluded. An
  // excluded job has no attribution because it won't appear anywhere.
  const assignments = Array.isArray(body.assignments) ? body.assignments : [];
  let norm = [];
  if (!excluded) {
    if (assignments.length === 0) {
      return res.status(400).json({ error: 'At least one assignment required' });
    }
    norm = assignments.map(a => ({
      employeeName: String(a.employeeName || '').slice(0, 80).trim(),
      role: ['Sold', 'Did', 'Sold & Did'].includes(a.role) ? a.role : 'Did',
      creditPct: Math.max(0, Math.min(100, Number(a.creditPct) || 0))
    })).filter(a => a.employeeName);
    if (norm.length === 0) return res.status(400).json({ error: 'No valid assignments' });
    const pctSum = norm.reduce((s, a) => s + a.creditPct, 0);
    if (Math.abs(pctSum - 100) > 0.5) {
      return res.status(400).json({ error: 'Credit percentages must sum to 100 (got ' + pctSum.toFixed(1) + ')' });
    }
  }

  const recs = loadReconciliations();
  const existing = recs[jobId] || {};
  recs[jobId] = {
    jobId,
    assignments: norm,
    totalAmount: body.totalAmount != null ? Number(body.totalAmount) : (existing.totalAmount != null ? existing.totalAmount : null),
    kpiDate: body.kpiDate || existing.kpiDate || null,
    notes: String(body.notes || '').slice(0, 1000),
    locked: body.locked !== false, // default true
    excluded,
    markedPaid,
    reconciledAt: new Date().toISOString(),
    reconciledBy: String(body.reconciledBy || 'admin').slice(0, 80).trim(),
    // Preserve a history trail
    history: [
      ...(existing.history || []),
      ...(existing.reconciledAt
        ? [{
            assignments: existing.assignments,
            totalAmount: existing.totalAmount,
            kpiDate: existing.kpiDate,
            notes: existing.notes,
            excluded: existing.excluded || false,
            markedPaid: existing.markedPaid || false,
            reconciledAt: existing.reconciledAt,
            reconciledBy: existing.reconciledBy
          }]
        : [])
    ].slice(-20) // keep last 20 versions
  };
  if (!saveReconciliations(recs)) return res.status(500).json({ error: 'Save failed' });

  // Reconciliation changes attribution and exception state, so clear
  // every KPI-facing cache rather than just the leaderboard response.
  invalidateKpiCaches();

  res.json({ ok: true, reconciliation: recs[jobId] });
});

// Remove a reconciliation (returns the job to auto-pipeline attribution)
app.delete('/api/kpi/admin/reconcile/:jobId', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const recs = loadReconciliations();
  delete recs[req.params.jobId];
  if (!saveReconciliations(recs)) return res.status(500).json({ error: 'Save failed' });
  invalidateKpiCaches();
  res.json({ ok: true });
});

// ── /api/kpi/admin/period-jobs — every job touching a period ─────────
// Returns the comprehensive list for the reconciliation tab: credited
// jobs + unattributed + excluded reconciliations + manually-reconciled
// jobs whose KPI date falls in the period.
//
// Per-job entry includes its current attribution, reconciliation state,
// and a single `status` field the admin UI uses to color the row:
//   reconciled    — has a non-excluded reconciliation record
//   excluded      — admin chose to hide this job entirely
//   unattributed  — paid in period but the auto-pipeline couldn't
//                   credit it (no tech / different period / etc.)
//   credited      — credited on the leaderboard via auto-pipeline,
//                   no admin reconciliation yet
//
// `summary` rolls up reconciliation coverage so the dashboard can
// show "fully reconciled" / "reconciled through {date}" badges.
app.get('/api/kpi/admin/period-jobs', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const range = String(req.query.range || 'mtd');
  const forceRefresh = req.query.refresh === '1' || req.query.force === '1';

  try {
    // Always fetch metrics via internal HTTP rather than reading the
    // cache directly. The metrics endpoint handles its own caching,
    // so warm cache responds quickly; but going through HTTP means we
    // always get whatever shape the CURRENT code is producing — never
    // a stale-shape payload from a previous deploy's cache. This is
    // what makes the period-jobs editor reliably see `jobId` on every
    // credited row.
    const internalPort = process.env.PORT || 3000;
    let metricsData = null;
    try {
      const internalRes = await axios.get('http://127.0.0.1:' + internalPort + '/api/metrics', {
        params: { range, ...(forceRefresh ? { refresh: 1 } : {}) },
        timeout: 60000
      });
      metricsData = internalRes.data;
    } catch (fetchErr) {
      console.warn('[period-jobs internal fetch]', fetchErr.message);
      return res.status(503).json({
        error: 'Could not load metrics: ' + (fetchErr.response?.data?.error || fetchErr.message)
      });
    }
    if (!metricsData || metricsData.error) {
      return res.status(503).json({
        error: 'Metrics endpoint returned error: ' + (metricsData && metricsData.error || 'no data')
      });
    }

    const RECS = loadReconciliations();
    const summary = metricsData.summary || {};
    const leaderboard = metricsData.leaderboard || [];
    const unattributed = metricsData.unattributed || [];

    // Walk the leaderboard's per-tech jobLists, indexed by invoice
    // number (the closest thing to a job key we have here — the
    // server doesn't currently surface job_id on credited rows, just
    // invoice_number). Group multi-tech credits by invoice.
    const creditedByInvoice = {};
    leaderboard.forEach(tech => {
      (tech.jobList || []).forEach(row => {
        const key = String(row.invoice || '').trim();
        if (!key) return;
        if (!creditedByInvoice[key]) {
          creditedByInvoice[key] = {
            jobId: row.jobId || null,
            invoice: key,
            customer: row.customer,
            description: row.description,
            date: row.date,
            jobTotal: row.jobTotal,
            outstanding: row.outstanding,
            reconciled: row.reconciled || false,
            assignments: []
          };
        }
        // If we encounter the same invoice from a second tech (split
        // credit), keep whichever jobId we already had — they're the
        // same job, so the jobId should match.
        if (!creditedByInvoice[key].jobId && row.jobId) {
          creditedByInvoice[key].jobId = row.jobId;
        }
        creditedByInvoice[key].assignments.push({
          name: tech.name,
          role: row.role,
          creditPct: row.creditPct,
          credit: row.credit
        });
      });
    });

    // Build a unified jobs array. Each entry is keyed by (invoice OR
    // jobId) — but credited entries don't carry jobId currently, so
    // we key by invoice and add jobId only for unattributed rows.
    const out = [];
    const seenInvoices = new Set();

    Object.values(creditedByInvoice).forEach(c => {
      out.push({
        key: c.jobId || c.invoice,
        jobId: c.jobId,
        invoice: c.invoice,
        customer: c.customer,
        description: c.description,
        kpiDate: c.date,
        totalAmount: c.jobTotal,
        outstanding: c.outstanding,
        assignments: c.assignments,
        reconciled: c.reconciled,
        status: c.reconciled ? 'reconciled' : 'credited'
      });
      seenInvoices.add(c.invoice);
    });

    unattributed.forEach(u => {
      const invKey = String(u.invoice || '').split(',')[0].trim();
      if (invKey && seenInvoices.has(invKey)) return;
      const recon = u.jobId && RECS[u.jobId];
      out.push({
        key: u.jobId || invKey || ('orphan_' + out.length),
        jobId: u.jobId,
        invoice: u.invoice,
        customer: u.customer,
        description: u.description,
        kpiDate: u.kpiDate || u.completedAt,
        paidAt: u.paidAt,
        totalAmount: u.amount,
        outstanding: 0,
        workStatus: u.workStatus,
        hcpAssignedEmployees: u.assignedEmployees || [],
        assignments: [],
        reconciled: !!recon && !recon.excluded,
        excluded: !!recon && recon.excluded,
        reason: u.reason,
        status: recon && recon.excluded ? 'excluded'
              : recon ? 'reconciled'
              : 'unattributed'
      });
      if (invKey) seenInvoices.add(invKey);
    });

    // Add any excluded reconciliations whose kpiDate falls in this
    // period but didn't show via metrics (because excluded jobs are
    // hidden from the leaderboard and unattributed bucket).
    const periodStartIso = summary.periodStart;
    const periodEndIso = summary.periodEnd;
    Object.values(RECS).forEach(r => {
      if (!r.excluded) return;
      const kd = r.kpiDate && r.kpiDate.slice(0, 10);
      if (!kd || !periodStartIso || !periodEndIso) return;
      if (kd < periodStartIso || kd >= periodEndIso) return;
      if (seenInvoices.has(String(r.jobId)) || out.some(o => o.jobId === r.jobId)) return;
      out.push({
        key: r.jobId,
        jobId: r.jobId,
        invoice: null,
        customer: '(excluded)',
        description: r.notes || null,
        kpiDate: r.kpiDate,
        totalAmount: r.totalAmount,
        outstanding: 0,
        assignments: [],
        reconciled: false,
        excluded: true,
        status: 'excluded'
      });
    });

    // Sort by status (action-required first) then by date desc.
    const statusRank = { unattributed: 0, credited: 1, reconciled: 2, excluded: 3 };
    out.sort((a, b) => {
      const sa = statusRank[a.status] != null ? statusRank[a.status] : 99;
      const sb = statusRank[b.status] != null ? statusRank[b.status] : 99;
      if (sa !== sb) return sa - sb;
      return new Date(b.kpiDate || 0) - new Date(a.kpiDate || 0);
    });

    // Reconciliation coverage roll-up — used by the dashboard to show
    // "fully reconciled" badges on date ranges where every job is
    // either reconciled or excluded.
    const total = out.length;
    const reconciledCount = out.filter(j => j.status === 'reconciled' || j.status === 'excluded').length;
    const fullyReconciled = total > 0 && reconciledCount === total;

    res.json({
      period: { range, start: periodStartIso, end: periodEndIso, label: summary.period },
      summary: {
        total,
        reconciled: out.filter(j => j.status === 'reconciled').length,
        excluded:   out.filter(j => j.status === 'excluded').length,
        unattributed: out.filter(j => j.status === 'unattributed').length,
        credited:   out.filter(j => j.status === 'credited').length,
        fullyReconciled
      },
      jobs: out
    });
  } catch (err) {
    console.error('[/api/kpi/admin/period-jobs]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// List reconciliations (optionally filtered to a month YYYY-MM)
app.get('/api/kpi/admin/reconciliations', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const month = String(req.query.month || '').slice(0, 7);
  const all = loadReconciliations();
  const out = Object.values(all)
    .filter(r => !month || (r.kpiDate || '').slice(0, 7) === month)
    .sort((a, b) => new Date(b.reconciledAt) - new Date(a.reconciledAt));
  res.json({ reconciliations: out });
});

// ── Page routes ──────────────────────────────────────────────────────────
app.get(['/report-issue', '/feedback'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'report-issue.html'));
});
// /admin is the single canonical admin entry point. /admin/kpi kept as
// a back-compat alias for any old bookmarks but resolves to the same UI.
app.get(['/admin', '/admin/kpi'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-kpi.html'));
});

// ────────────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  const parts = [
    'Dashboard running on port ' + PORT,
    'HCP:' + (API_KEY ? 'configured' : 'MISSING'),
    'QBO:' + (qboReady() ? 'ready' : qboConfigured() ? 'awaiting OAuth' : 'MISSING')
  ];
  console.log(parts.join(' | '));
});
