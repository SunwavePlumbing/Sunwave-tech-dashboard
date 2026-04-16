# Quarterly View Implementation for Location Owners (Financial) Tab

## Overview
This document describes the complete implementation of the quarterly view feature for the Location Owners (Financial) tab in the Sunwave Plumbing KPI Dashboard. The feature allows users to view aggregated financial metrics by quarter (Q1, Q2, Q3, Q4) in addition to the existing monthly view.

## Implementation Summary

### 1. State Variables (owners.js, lines 5-6)
```javascript
var finGranularity = 'month';   // 'month' | 'quarter'
var finQuarter     = null;      // 'YYYY-Q#' e.g. '2026-Q1'
```
- `finGranularity`: Controls whether the current view is monthly or quarterly
- `finQuarter`: Stores the selected quarter (e.g., '2026-Q1')

### 2. Helper Functions (owners.js, lines 355-384)

#### `quarterKey(mk)`
Converts a month key (e.g., '2026-03') to a quarter key (e.g., '2026-Q1')

#### `quarterMonths(qk)`
Converts a quarter key (e.g., '2026-Q1') back to an array of three month keys:
- '2026-Q1' → ['2026-01', '2026-02', '2026-03']

#### `fmtQk(qk)`
Formats a quarter key for display:
- '2026-Q1' → 'Q1 2026'

#### `availableQuarters(months)`
Returns an array of unique quarter keys that have at least one month of data available

### 3. UI Components (index.html, lines 85-88)
```html
<div class="fin-period-tabs">
  <button class="fin-period-tab" id="finTabMonth"   onclick="setFinGranularity('month')">Month</button>
  <button class="fin-period-tab" id="finTabQuarter" onclick="setFinGranularity('quarter')">Quarter</button>
</div>
```
- Two toggle buttons inside the month/quarter picker dropdown
- Only one can be active at a time
- Clicking switches between monthly and quarterly views

### 4. Granularity Switcher Functions (owners.js, lines 387-410)

#### `setFinGranularity(g)`
Switches between 'month' and 'quarter' granularity:
- When switching to quarter mode: Derives `finQuarter` from the currently selected `finMonth`
- When switching to month mode: Selects the last available month of the currently selected quarter
- Triggers re-render of the entire financial view

#### `pickFinQuarter(qk)`
Selects a specific quarter:
- Sets `finQuarter` to the selected quarter key
- Closes the picker dropdown
- Triggers re-render of the financial view

### 5. Core Aggregation Logic (owners.js, lines 506-523)

The `at()` function is key to quarterly aggregation:
```javascript
// Quarter indices — the month positions within ownersData.months for selected quarter
var qIdxs = [];
if (finGranularity === 'quarter') {
  quarterMonths(finQuarter).forEach(function(mk) {
    var i = months.indexOf(mk);
    if (i >= 0) qIdxs.push(i);
  });
  // For single-month fallbacks (e.g. trend chart curIdx highlight), point to last qIdx
  if (qIdxs.length) curIdx = qIdxs[qIdxs.length - 1];
}

// at() sums the selected quarter's months, or returns the single selected month
function at(arr) {
  if (finGranularity === 'quarter' && qIdxs.length) {
    return qIdxs.reduce(function(s, i) { return s + (arr[i] || 0); }, 0);
  }
  return arr[curIdx] || 0;
}
```

This function is used throughout to fetch values from data arrays:
- Monthly mode: Returns the single month's value
- Quarterly mode: Returns the sum of the three months' values

### 6. Comparison Logic (owners.js, lines 528-559)

In quarterly mode, comparisons automatically adjust:
```javascript
if (finGranularity === 'quarter') {
  // Compare to same quarter prior year
  var pyYear  = String(parseInt(finQuarter.split('-Q')[0]) - 1);
  var pyQk    = pyYear + '-Q' + finQuarter.split('-Q')[1];
  var pyIdxs  = [];
  quarterMonths(pyQk).forEach(function(mk) {
    var i = months.indexOf(mk); if (i >= 0) pyIdxs.push(i);
  });
  if (pyIdxs.length) {
    cmpLabel  = 'vs. ' + fmtQk(pyQk);  // e.g., "vs. Q1 2025"
    cmpValues = function(arr) { return pyIdxs.reduce(function(s, i) { return s + (arr[i] || 0); }, 0); };
  }
}
```

- Quarterly comparisons always use "vs. Q[X] [YEAR]" format
- Monthly comparisons continue to use existing logic

### 7. Picker Header and Tab Management (owners.js, lines 449-476)

The picker UI is rebuilt for both granularities:
- **Monthly mode**: Lists all available months in reverse chronological order
- **Quarterly mode**: Lists all available quarters in reverse chronological order
- Tab active states are synced: `finGranularity === 'month'` → Month tab active, etc.

### 8. P&L Grid (owners.js, lines 1027-1049)

The "Full Picture" P&L grid adapts to the selected granularity:

**Quarter mode:**
- Shows exactly 3 columns (one per month of the selected quarter)
- Total column sums all three months
- % Rev column shows percentage of quarterly revenue
- Subtitle displays: "Q1 2026" (or selected quarter)
- Dollar/% toggle is visible

**Month mode:**
- Shows 12 columns on desktop, 6 on mobile
- Subtitle displays: "[N] months ending Mar 2026" (or last month)
- Dollar/% toggle is hidden

### 9. Donut Chart Subtitle (owners.js, lines 1134-1135)

The "Where Every Dollar Went" chart updates its subtitle:
```javascript
document.getElementById('donutSubtitle').textContent = fmtDollar(dAllCosts) + ' \u00b7 ' +
  (finGranularity === 'quarter' ? fmtQk(finQuarter) : fmtMkShort(finMonth));
```

- Quarterly: Shows total + "Q1 2026"
- Monthly: Shows total + "Mar 26"

### 10. Styling (styles.css, lines 465-468 and 1551-1563)

Desktop styling:
```css
.fin-period-tabs { display:flex; border-bottom:1px solid #eee; }
.fin-period-tab  { flex:1; padding:12px 0; font-size:13px; font-weight:600; color:#aaa; background:none; border:none; border-bottom:2px solid transparent; margin-bottom:-1px; cursor:pointer; transition:color 0.15s, border-color 0.15s; }
.fin-period-tab.active { color:#1a2d3a; border-bottom-color:#FF9500; }
```

Mobile styling (optimized for touch):
```css
.fin-period-tab {
  font-size: 14px;
  padding: 12px 0;
  min-height: 44px;        /* WCAG AA touch target */
  display: flex;
  align-items: center;
  justify-content: center;
}
```

## Testing Checklist

### Navigation & Switching
- [ ] Open Location Owners tab
- [ ] Click the month/quarter picker dropdown
- [ ] Verify "Month" tab is active by default
- [ ] Click "Quarter" tab → List switches to quarter options (Q1 2026, Q4 2025, etc.)
- [ ] Click "Month" tab → List switches back to months
- [ ] Verify tab styling (active = orange underline)

### Monthly View (Default)
- [ ] Header shows selected month name (e.g., "March 2026")
- [ ] Formula cards show individual month's values
- [ ] Efficiency tiles show single month's percentages
- [ ] P&L grid shows last 12 months ending at selected month
- [ ] Donut chart shows single month's expenses
- [ ] Comparison shows prior month or prior year month values

### Quarterly View
- [ ] Click "Quarter" tab
- [ ] Select a quarter (e.g., "Q1 2026")
- [ ] Header shows "Q1 2026"
- [ ] Formula cards show **sum** of 3 months (Jan+Feb+Mar)
  - Total Revenue = sum of 3 months
  - Gross Profit % = (sum of 3 months GP) / (sum of 3 months revenue) * 100
- [ ] Efficiency tiles show aggregated percentages
- [ ] P&L grid shows exactly 3 columns (Jan | Feb | Mar | Total | % Rev)
- [ ] All values in P&L grid are summed across the quarter
- [ ] Dollar/% toggle is visible and functional
- [ ] Donut chart shows expenses for entire quarter (e.g., "$45,230 · Q1 2026")
- [ ] Comparison shows "vs. Q1 2025" (prior year same quarter)

### Granularity Switching
- [ ] Switch from Month to Quarter → Jumps to quarter containing current month
- [ ] Select Month "March 2026" → Switch to Quarter → Shows "Q1 2026"
- [ ] Switch back to Month → Reverts to "March 2026"
- [ ] Switch from Quarter to Month → Selects last month of that quarter
- [ ] Select Quarter "Q1 2026" → Switch to Month → Shows "March 2026"

### Mobile Responsiveness (Portrait & Landscape)
- [ ] Tabs have minimum 44px height touch targets
- [ ] Tab labels are readable (14px on mobile vs 13px desktop)
- [ ] P&L grid is scrollable on narrow screens
- [ ] All currency values are properly formatted
- [ ] Donut chart is sized appropriately
- [ ] Subtitle text doesn't overflow

### Edge Cases
- [ ] Select a quarter with incomplete data (e.g., current month Q)
- [ ] Switch between quarters with multiple months available
- [ ] Verify comparison works when prior year quarter is fully available
- [ ] Verify comparison falls back gracefully when prior year quarter data is missing
- [ ] Check behavior when selecting the earliest or latest quarter

### Chart Aggregation
- [ ] **Revenue**: Sum of 3 months should equal P&L total
- [ ] **Gross Profit**: Sum of 3 months should equal P&L total
- [ ] **NOI**: Sum of 3 months should equal P&L total
- [ ] **Efficiency ratios**: Should match manual calculation (total metric / total revenue)
- [ ] **Donut chart**: Total should match NOI + tax items + other adjustments

## Technical Notes

### Data Flow
1. User clicks Month/Quarter tab → `setFinGranularity()` called
2. `finGranularity` and `finQuarter` are updated
3. `renderOwners()` is called
4. Helper functions derive indices: `qIdxs` for quarter mode
5. `at()` function is used throughout to fetch aggregated values
6. All UI elements (header, cards, charts, grid) are rebuilt with aggregated data

### No Server Changes
- All quarterly data is computed from existing 24 months of data
- No new API endpoints needed
- All aggregation happens client-side in JavaScript

### Backward Compatibility
- Monthly view works exactly as before
- No changes to existing monthly logic
- `finGranularity === 'month'` preserves all existing behavior

## Implementation Status

✅ **Complete**

All planned features have been implemented:
- State variables
- Helper functions
- Granularity switcher
- UI components (tabs in picker)
- Aggregation logic (at() function)
- Comparison logic (vs. Q[X] YYYY)
- P&L grid quarterly support
- Chart subtitle updates
- CSS styling for tabs and mobile
- Default tab state (Month active)
