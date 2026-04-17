# Trend Chart Animation Testing Checklist

## Overview
This document provides step-by-step testing procedures to validate that the trend chart animations are working correctly across all scenarios and devices.

---

## Desktop Testing (>768px Width)

### Test 1: Initial Page Load Animation
**Setup:**
- Open http://localhost:3000 in Chrome
- Navigate to "Location Owners" tab
- Scroll down slowly to the "How The Ratios Have Moved" trend card

**Expected Result:**
```
As the trend card comes into view (when 25% visible):
  ✓ Animation triggers automatically
  ✓ Trend lines appear from center and expand outward
  ✓ Lines expand smoothly in both directions (left AND right)
  ✓ All 5 lines animate together (not staggered)
  ✓ Green/red fill areas grow with the lines
  ✓ Animation takes approximately 950ms (about 1 second)
  ✓ Animation completes smoothly with no jank/stuttering
  ✓ No color flashing occurs
```

**Visual Verification:**
```
Moment 1 (Start):         │         (reveal = 0%)
Moment 2 (25%):         ╱ │ ╱       (reveal = 25%)
Moment 3 (50%):       ╱ ╱ │ ╱ ╱     (reveal = 50%)
Moment 4 (100%):    ╱ ╱ ╱ │ ╱ ╱ ╱   (reveal = 100%)
```

**Pass/Fail:**
- [ ] Animation triggers on scroll
- [ ] Smooth center-out expansion
- [ ] ~950ms duration
- [ ] No glitches or flashing

---

### Test 2: Animation Doesn't Repeat on Scroll
**Setup:**
- Complete Test 1 (animation finished)
- Scroll up and then scroll back down past the trend card

**Expected Result:**
```
✓ Animation does NOT restart
✓ Chart remains fully visible
✓ IntersectionObserver disconnects after first trigger
✓ No repeated animations on subsequent scrolls
```

**Pass/Fail:**
- [ ] Animation only triggers once
- [ ] No re-animation on scroll past

---

### Test 3: Month to Quarter Mode Switch
**Setup:**
- Trend chart is visible and animated
- Open month/quarter picker
- Click "Quarter" tab
- Select "Q1 2026"

**Expected Result:**
```
✓ Chart updates with new data
✓ Animation restarts automatically
✓ Trend lines reveal again with new quarterly data
✓ Takes another ~950ms to complete
✓ No flash or visual glitch
```

**Pass/Fail:**
- [ ] Animation restarts on mode switch
- [ ] New data animates in smoothly
- [ ] Smooth transition between modes

---

### Test 4: Quarter to Month Mode Switch
**Setup:**
- Quarterly view is displayed
- Click "Month" tab
- Select "March 2026"

**Expected Result:**
```
✓ Chart updates to monthly data
✓ Animation restarts
✓ Trend lines reveal with monthly data
✓ Smooth animation completes
```

**Pass/Fail:**
- [ ] Animation triggers on quarter→month switch
- [ ] Monthly data animates correctly
- [ ] No visual artifacts

---

### Test 5: Different Period Selection (Same Granularity)
**Setup:**
- Currently viewing Q1 2026 (quarterly)
- Open picker and select Q4 2025

**Expected Result:**
```
✓ Chart data updates
✓ Animation restarts with new quarter's data
✓ Trend lines reveal from center again
✓ Animation completes smoothly
```

**Pass/Fail:**
- [ ] Animation restarts on period change
- [ ] New data loads and animates
- [ ] Smooth visual transition

---

### Test 6: Chart Responsiveness During Animation
**Setup:**
- Start trend chart animation
- While animation is running, click on a trend toggle button
- Select a different trend line (e.g., "Tech Labor %" instead of "Profit %")

**Expected Result:**
```
✓ Chart responds immediately to user action
✓ Selected trend line updates (others hide)
✓ Animation state maintained or reset cleanly
✓ No freeze or lag
✓ Interface remains responsive
```

**Pass/Fail:**
- [ ] User interactions work during animation
- [ ] No blocking or lag
- [ ] Clean visual transition

---

## Mobile Testing (≤768px Width)

### Test 7: Immediate Animation on Load
**Setup:**
- Open http://localhost:3000 on iPhone/Android
- Navigate to Location Owners tab

**Expected Result:**
```
✓ Trend chart animates immediately (no scroll wait)
✓ Takes ~950ms to complete
✓ Smooth center-out reveal of trend lines
✓ All lines animate together
✓ No flashing or color artifacts
✓ Completes before user scrolls past
```

**Pass/Fail:**
- [ ] Immediate animation on load
- [ ] Smooth reveal effect
- [ ] No glitches

---

### Test 8: Mobile Scrolling Performance
**Setup:**
- Trend chart is animated and complete
- Scroll rapidly up and down past the trend card
- While scrolling, watch for any visual glitches

**Expected Result:**
```
✓ No color flashing
✓ No animation stutter
✓ Chart remains smooth during scroll
✓ No unexpected re-animations
✓ Clean rendering at all times
```

**Pass/Fail:**
- [ ] No color flashing on scroll
- [ ] Smooth scrolling performance
- [ ] No visual glitches

---

### Test 9: Mobile Mode Switch
**Setup:**
- Trend chart visible on mobile
- Open picker and switch from Month to Quarter mode

**Expected Result:**
```
✓ Animation restarts
✓ Smooth reveal of quarterly data
✓ Takes ~950ms to complete
✓ No glitches during animation
```

**Pass/Fail:**
- [ ] Animation restarts on mobile
- [ ] Smooth mode switch animation
- [ ] ~950ms duration maintained

---

### Test 10: Mobile Device Sizes
Test on multiple screen sizes:

**iPhone SE (375px width):**
- [ ] Animation triggers correctly
- [ ] Trend lines fully visible
- [ ] No horizontal scroll needed
- [ ] Smooth animation

**iPad (768px width - edge case):**
- [ ] Animation behavior consistent
- [ ] Transitions between desktop/mobile at 768px
- [ ] No animation glitches at breakpoint

**Android (720px width):**
- [ ] Animation works on Android browser
- [ ] Smooth reveal effect
- [ ] No platform-specific glitches

---

## Cross-Browser Testing

### Test 11: Chrome (Desktop & Mobile)
**Desktop:**
- [ ] Scroll-triggered animation works
- [ ] Smooth easing with easeOutCubic
- [ ] ~950ms duration accurate
- [ ] No rendering artifacts

**Mobile:**
- [ ] Immediate animation on load
- [ ] No glitches during scroll
- [ ] Responsive to user actions

**Status:** [ ] Pass / [ ] Fail

---

### Test 12: Safari (Desktop & Mobile)
**Desktop:**
- [ ] IntersectionObserver supported
- [ ] Scroll animation triggers
- [ ] Smooth animation on iOS Safari
- [ ] No glitches specific to Safari

**Mobile (iOS):**
- [ ] Immediate animation on load
- [ ] Smooth during scroll
- [ ] No flashing
- [ ] Touch interactions responsive

**Status:** [ ] Pass / [ ] Fail

---

### Test 13: Firefox
**Desktop:**
- [ ] Scroll animation triggers
- [ ] easeOutCubic easing works
- [ ] RAF animation smooth
- [ ] No Firefox-specific glitches

**Mobile (Android):**
- [ ] Immediate animation
- [ ] Smooth scrolling
- [ ] No performance issues

**Status:** [ ] Pass / [ ] Fail

---

### Test 14: Edge (Desktop)
- [ ] Scroll animation triggers
- [ ] Smooth rendering
- [ ] easeOutCubic timing accurate
- [ ] No Edge-specific issues

**Status:** [ ] Pass / [ ] Fail

---

## Performance Testing

### Test 15: Animation Performance Metrics
**Setup:**
- Open DevTools (F12)
- Go to Performance tab
- Record while trend chart animates
- Stop recording when animation completes

**Expected Results:**
```
✓ Frame rate: 60fps throughout animation
✓ No frame drops
✓ CPU usage: <30% during animation
✓ GPU utilization: Normal (no spike)
✓ Memory stable (no leaks)
✓ No long tasks blocking main thread
```

**Pass/Fail:**
- [ ] Maintains 60fps
- [ ] Smooth animation throughout
- [ ] No performance degradation

---

### Test 16: Multiple Animation Cycles
**Setup:**
- Switch between months 5-10 times
- Watch trend chart animation restart each time
- Check for memory leaks or performance degradation

**Expected Results:**
```
✓ Each cycle animates smoothly
✓ No performance degradation over time
✓ No memory leaks (DevTools memory graph flat)
✓ Consistent timing across cycles
✓ Frame rate remains 60fps
```

**Pass/Fail:**
- [ ] Consistent performance
- [ ] No memory leaks
- [ ] Smooth after multiple cycles

---

## Accessibility Testing

### Test 17: Animation Doesn't Break Accessibility
**Setup:**
- Use keyboard navigation only (no mouse)
- Tab through interface
- Select periods using keyboard

**Expected Results:**
```
✓ Animation doesn't block keyboard interaction
✓ Focus states visible
✓ Can navigate without issues
✓ Animation doesn't interfere with screen readers
```

**Pass/Fail:**
- [ ] Keyboard navigation works
- [ ] No blocked interactions
- [ ] Accessible

---

### Test 18: Animation Respects prefers-reduced-motion
**Setup:**
- Enable "Prefer Reduced Motion" in OS settings
- Load the dashboard
- Navigate to trend chart

**Expected Results:**
```
Note: Current implementation doesn't have reduced-motion support
Options:
A) Animation still plays (current behavior)
B) Animation disabled (future enhancement)

Current Status: [ ] Animation plays / [ ] Animation skipped

If A: Document that animations play regardless of preference
If B: Verify chart still displays correctly without animation
```

**Pass/Fail:**
- [ ] Accessibility verified
- [ ] Documented behavior

---

## Edge Cases

### Test 19: Rapid Mode Switching
**Setup:**
- Open picker
- Rapidly click between Month and Quarter tabs (5+ times)
- Watch for animation chaos

**Expected Results:**
```
✓ Each switch triggers new animation
✓ No animation queue overflow
✓ Previous animations canceled cleanly
✓ Latest animation takes precedence
✓ No visual glitches or overlaps
```

**Pass/Fail:**
- [ ] Handles rapid switching
- [ ] No animation conflicts
- [ ] Clean state management

---

### Test 20: Chart Visibility at Viewport Edges
**Setup:**
- Scroll so trend card is exactly 25% visible
- Scroll slowly up and down around 25% threshold

**Expected Results:**
```
✓ Animation triggers at ~25% visibility
✓ Triggers consistently at threshold
✓ No weird behavior at boundary
```

**Pass/Fail:**
- [ ] Consistent trigger point
- [ ] Smooth behavior at threshold

---

### Test 21: Switching Away and Back
**Setup:**
- View trend chart animation
- Click another tab (Technicians or Marketing)
- Navigate back to Location Owners

**Expected Results:**
```
✓ Chart re-renders
✓ Animation restarts automatically
✓ No stale animation state
✓ Smooth re-entry animation
```

**Pass/Fail:**
- [ ] Animation restarts on return
- [ ] No state conflicts
- [ ] Clean re-initialization

---

## Summary & Results

### Desktop Summary
| Test | Chrome | Safari | Firefox | Edge | Notes |
|------|--------|--------|---------|------|-------|
| T1: Initial Load | [ ] | [ ] | [ ] | [ ] | Scroll trigger animation |
| T2: No Repeat | [ ] | [ ] | [ ] | [ ] | Observer disconnects |
| T3: Mode Switch | [ ] | [ ] | [ ] | [ ] | Restart on change |
| T4: Quarter→Month | [ ] | [ ] | [ ] | [ ] | Animation triggers |
| T5: Period Change | [ ] | [ ] | [ ] | [ ] | Same granularity |
| T6: Responsiveness | [ ] | [ ] | [ ] | [ ] | Interactive during animation |

### Mobile Summary
| Test | Chrome | Safari | Firefox | Notes |
|------|--------|--------|---------|-------|
| T7: Immediate | [ ] | [ ] | [ ] | No scroll wait |
| T8: Scroll Perf | [ ] | [ ] | [ ] | No flashing |
| T9: Mode Switch | [ ] | [ ] | [ ] | Restart animation |
| T10: Sizes | [ ] | [ ] | [ ] | Multiple screen sizes |

### Performance Summary
- T15: Frame Rate: [ ] Pass - FPS: _____
- T16: Memory Leak: [ ] Pass - Stable: [ ] Yes [ ] No
- T15: CPU Usage: [ ] Pass - Peak: _____%

### Overall Status
- **All Tests Passed:** [ ] YES [ ] NO
- **Critical Issues:** [ ] None [ ] Found
- **Minor Issues:** [ ] None [ ] Found

---

## Known Issues Log

| Issue | Severity | Status | Notes |
|-------|----------|--------|-------|
| | | | |

---

## Sign-Off

**Tested By:** ________________
**Date:** ________________
**Result:** ✅ PASS / ❌ FAIL

**Comments:**
```
[Space for tester notes and observations]
```

---

## Next Steps

If ALL tests pass:
- [ ] Ready for production deployment
- [ ] Document as stable
- [ ] Merge to main branch

If issues found:
- [ ] Log in Issues Log above
- [ ] Assign to developer
- [ ] Re-test after fixes
- [ ] Update this checklist

---

## Quick Test (5 Minute Version)

For quick validation, run these essential tests:

1. ✅ **Desktop Scroll Trigger**: Scroll to trend chart → Watch animation play
2. ✅ **Mobile Immediate**: Load on mobile → Animation plays instantly
3. ✅ **Mode Switch**: Switch Month↔Quarter → Animation restarts
4. ✅ **Scroll Performance**: Scroll past chart on mobile → No flashing
5. ✅ **Responsiveness**: Click trend button during animation → Works immediately

If all 5 pass → Animation feature is working correctly! ✓
