# Quarterly View Testing Guide

## Quick Visual Reference

### Default View (Monthly - Already Working)

```
┌─────────────────────────────────────┐
│  Sunwave Plumbing — KPIs & Metrics  │
│  📍 Charlottesville                  │
└─────────────────────────────────────┘
     [Technicians] [Marketing] [Location Owners]

Location Owners Tab (Monthly View):

┌──────────────────────────────────────────────────┐
│  📅 March 2026  ▼ (picker dropdown)              │
│                                                  │
│  [Month] [Quarter] ← Toggle tabs (Month active) │
│  ─────────────────────────────────────────       │
│  ▼ 2026 months (newest first)                    │
│  • March 2026 (currently selected)               │
│  • February 2026                                 │
│  • January 2026                                  │
│  ...                                             │
└──────────────────────────────────────────────────┘

Formula Cards:
┌─────────────┬─────────────┬─────────────┐
│Total Revenue│ Gross Profit│      NOI    │
│  $123,456   │   $78,900   │  $32,100    │
│vs. Mar 2025 │ 64% ▲ +8%   │ 26% ▼ -2%   │
└─────────────┴─────────────┴─────────────┘

Efficiency Tiles:
┌──────────────┬──────────────┬──────────────┐
│Gross Margin %│Tech Labor %  │  Parts %     │
│     64%      │     18%      │     12%      │
│         (all calculated on single month)  │
└──────────────┴──────────────┴──────────────┘
```

### After Switching to Quarterly View

```
Picker Now Shows:
┌──────────────────────────────────────────────────┐
│  📅 Q1 2026  ▼ (picker dropdown)                 │
│                                                  │
│  [Month] [Quarter] ← Toggle tabs (Quarter active)│
│  ─────────────────────────────────────────       │
│  ▼ 2026 quarters (newest first)                  │
│  • Q1 2026 (currently selected) ← CHANGED        │
│  • Q4 2025                                       │
│  • Q3 2025                                       │
│  ...                                             │
└──────────────────────────────────────────────────┘

Formula Cards (Now Showing 3-Month Aggregates):
┌─────────────┬─────────────┬─────────────┐
│Total Revenue│ Gross Profit│      NOI    │
│  $371,368   │  $236,700   │  $96,300    │
│vs. Q1 2025  │ 64% ▲ +3%   │ 26% ▼ -1%   │
│             │ (Jan+Feb+Mar)│ (Jan+Feb+Mar)│
└─────────────┴─────────────┴─────────────┘

Efficiency Tiles (Calculated on 3-Month Totals):
┌──────────────┬──────────────┬──────────────┐
│Gross Margin %│Tech Labor %  │  Parts %     │
│     64%      │     18%      │     12%      │
│  (sum of GP) │ (sum of TL)  │ (sum of Pts) │
│  ÷ (sum of   │  ÷ (sum of   │  ÷ (sum of   │
│  3mo Revenue)│3mo Revenue)  │3mo Revenue)  │
└──────────────┴──────────────┴──────────────┘
```

---

## Step-by-Step Testing

### Test 1: Navigate to Location Owners Tab
**Expected Result:**
- Location Owners tab is visible and clickable
- Monthly view is the default
- Header shows "March 2026" (or current latest month)
- No errors in browser console (F12 → Console tab)

### Test 2: Open Month/Quarter Picker
**Action:**
- Click the header "March 2026 ▼"

**Expected Result:**
- Dropdown opens
- Two tabs appear at the top: `[Month]` and `[Quarter]`
- `[Month]` tab has orange underline (active state)
- Month list shows all available months (newest first)
- "March 2026" is highlighted in the list

**Visual Check:**
```
┌────────────────────────────┐
│ [Month] [Quarter]          │  ← Tabs with borders
│ ──────────────────────────  │
│ • March 2026    (selected) │
│ • February 2026            │
│ • January 2026             │
└────────────────────────────┘
```

### Test 3: Switch to Quarterly View
**Action:**
- Click the `[Quarter]` tab in the picker

**Expected Result:**
- Tab styling changes: `[Quarter]` now has orange underline
- `[Month]` text becomes gray (inactive)
- List immediately switches to show quarters
- List shows: "Q1 2026", "Q4 2025", "Q3 2025", etc.
- "Q1 2026" is automatically highlighted (since we were on March 2026)
- Header outside picker still shows "Q1 2026" if it auto-updated

**Visual Check:**
```
AFTER clicking [Quarter] tab:
┌────────────────────────────┐
│ [Month] [Quarter]          │  ← Quarter is now active/orange
│ ──────────────────────────  │
│ • Q1 2026       (selected) │
│ • Q4 2025                  │
│ • Q3 2025                  │
│ • Q2 2025                  │
└────────────────────────────┘
```

### Test 4: Select a Different Quarter
**Action:**
- Click "Q4 2025" in the list

**Expected Result:**
- Picker closes
- Header shows "Q4 2025"
- All formula cards update to show Q4 2025 aggregated values:
  - Total Revenue = Sept + Oct + Nov 2025 revenue
  - Gross Profit % recalculates on 3-month total
  - NOI shows 3-month sum
- Comparison shows "vs. Q4 2024"
- P&L grid updates to show 3 columns (Sept | Oct | Nov)

### Test 5: Verify P&L Grid in Quarterly Mode
**Action:**
- Scroll down to "Full Picture" P&L grid in Q4 2025 view

**Expected Result:**
```
Full Picture — Month by Month    $ | % Rev

        Sept   Oct    Nov   Total  % Rev
Revenue $25k   $26k   $27k  $78k   100%
COGS    $10k   $10k   $11k  $31k   40%
  Tech  $6.5k  $6.8k  $7.2k $20.5k 26%
  Parts $2.5k  $2.3k  $2.8k $7.6k  10%
  Subs  $1k    $0.9k  $1k   $2.9k  4%
GP      $15k   $16k   $16k  $47k   60%
OpEx    $8k    $8.5k  $8.2k $24.7k 32%
  ...
NOI     $7k    $7.5k  $7.8k $22.3k 28%
```

**Check:**
- Exactly 3 columns for the 3 months ✓
- Total column sums all 3 months ✓
- % Rev shows (line item total / quarterly revenue) × 100 ✓
- Subtitle shows "Q4 2025" ✓
- Dollar/% toggle is visible (can switch between $ and %) ✓

### Test 6: Switch Back to Monthly View
**Action:**
- Open picker
- Click `[Month]` tab

**Expected Result:**
- List switches back to months
- Automatically shows months around the last month of Q4 2025 (November 2025)
- "November 2025" is highlighted
- Or it shows last viewed month if different from November
- Close picker → Header shows the selected month

### Test 7: Verify Calculations Are Correct

**Q1 2026 Test Case:**

1. **Get the individual month values:**
   - Switch to Month mode
   - Select January 2026 → Note: Total Revenue (let's say $50,000)
   - Select February 2026 → Note: Total Revenue (let's say $48,000)
   - Select March 2026 → Note: Total Revenue (let's say $52,000)

2. **Switch to Quarter mode:**
   - Click Month/Quarter picker
   - Click [Quarter] tab
   - Select Q1 2026

3. **Verify the math:**
   - Total Revenue should show: $50,000 + $48,000 + $52,000 = $150,000
   - Compare to formula card: They should match exactly

4. **Check Gross Profit %:**
   - Note the 3 individual month GP values
   - Sum them: Jan GP + Feb GP + Mar GP
   - Calculate: (Sum GP) / (Sum Revenue) × 100
   - Formula card should show this exact percentage

### Test 8: Mobile Layout Test

**Setup:**
- Open browser DevTools (F12)
- Click "Toggle device toolbar" (or Ctrl+Shift+M)
- Set to iPhone SE (375×667) or similar

**Expected Result:**
- Period tabs are still visible and readable
- Tab height is at least 44px (easy to tap)
- Spacing between cards feels comfortable (not cramped)
- No horizontal scroll needed for cards
- P&L grid scrolls horizontally if needed
- Font sizes are readable (not tiny)
- No text overflow or layout breaks

**Mobile Spacing Check:**
- Padding above/below cards should be visible
- Cards should have breathing room between them
- Not feel cramped or squeezed

### Test 9: Comparison Delta Test

**Q1 2026 vs Q1 2025:**

**Setup:**
- Quarterly mode, Q1 2026 selected
- Look at the formula cards

**Expected Result:**
- Revenue card shows comparison line: "vs. Q1 2025: $145,000"
- Shows delta: "▲ $5,000 (+3.5%)" or similar
- Gross Profit % shows: "vs. Q1 2025: 63.5%" and delta
- All deltas comparing to same quarter prior year

**Verify Math:**
- Q1 2025 quarterly revenue = Jan 2025 + Feb 2025 + Mar 2025
- Difference = Q1 2026 revenue - Q1 2025 revenue
- Percentage change = (Difference / Q1 2025 revenue) × 100

---

## Troubleshooting Checklist

### Issue: Period tabs don't appear
- [ ] Check browser console (F12) for JavaScript errors
- [ ] Verify index.html has the tabs code (lines 85-88)
- [ ] Check that Month tab is at least 40px wide
- [ ] Try refreshing page (Ctrl+R)

### Issue: Switching modes doesn't change the list
- [ ] Check console for errors
- [ ] Verify `setFinGranularity()` is being called
- [ ] Check that `finMonthList` element exists
- [ ] Try opening/closing picker dropdown

### Issue: Quarterly values seem wrong
- [ ] Manually add up the 3 months individually
- [ ] Compare to the displayed quarterly total
- [ ] Check if data is available for all 3 months
- [ ] Verify in console: `finGranularity === 'quarter'` returns true

### Issue: Charts show old data
- [ ] Close picker and wait 1 second
- [ ] Refresh page (Ctrl+R)
- [ ] Check console for error messages
- [ ] Try switching mode twice (Month → Quarter → Month → Quarter)

### Issue: Color flashing on mobile scroll
- [ ] This should be FIXED now
- [ ] If still occurs, check window width in console: `window.innerWidth`
- [ ] Should be ≤768px to disable animations
- [ ] Try on different device or browser

---

## Expected Data Points

If testing with actual Sunwave financial data, these are reasonable values:

**Monthly (single month):**
- Total Revenue: $40k - $60k
- Gross Profit: $25k - $35k (60-65% margin typical)
- NOI: $8k - $15k (20-25% operating margin typical)
- Tech Labor Cost: 15-20% of revenue
- Parts Cost: 10-15% of revenue

**Quarterly (3-month aggregate):**
- Total Revenue: $120k - $180k (3× monthly)
- Gross Profit: $75k - $105k (same 60-65% margin)
- NOI: $24k - $45k (same 20-25% margin)
- All percentages should remain similar (margins are consistent)

**Year-over-year comparison:**
- If Q1 2026 is growing: Should see positive deltas
- If Q1 2026 is flat: Should see ~0% deltas
- Comparison format should always be "vs. Q1 2025"

---

## Browser Testing Matrix

Test these combinations:

| Browser | Desktop | Mobile |
|---------|---------|--------|
| Chrome | ✓ Test | ✓ Test |
| Safari | ✓ Test | ✓ Test |
| Firefox | ✓ Test | ✓ Test |
| Edge | ✓ Test | - |

**Pass Criteria:**
- Period tabs visible and functional
- Mode switching works smoothly
- No console errors
- Quarterly values calculate correctly
- Mobile spacing is comfortable
- No animation glitches on scroll

---

## Success Checklist

When all of these pass, the quarterly view is ready:

- [ ] Period tabs appear in picker
- [ ] Month tab is active by default
- [ ] Quarter tab switches list to quarters
- [ ] Selecting quarterly shows "Q1 2026" etc. format
- [ ] Formula cards aggregate 3 months correctly
- [ ] Comparison shows "vs. Q1 2025" format
- [ ] P&L grid shows exactly 3 columns in quarter mode
- [ ] Dollar/% toggle works in quarter mode
- [ ] Switch back to months works correctly
- [ ] Mobile layout is not cramped
- [ ] No console errors anywhere
- [ ] No animation flashing on mobile scroll
- [ ] Works in Chrome, Safari, Firefox
- [ ] Responsive on 375px, 768px, 1024px widths

Once all pass: ✅ **Ready for Production**
