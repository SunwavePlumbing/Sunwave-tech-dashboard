# Trend Chart Animation - Visual Guide

## Desktop User Experience (>768px Width)

### 1. User Scrolls Down Page
```
┌────────────────────────────────────────┐
│ ▲ Content scrolls up                   │
│ Revenue Over Time                      │
│ [Chart renders]                        │
│                                        │
│ 👀 User scrolls down...               │
│                                        │
│ ── How The Ratios Have Moved ──        │
│ [Trend Card comes into view]           │
└────────────────────────────────────────┘
       ↓ Trend card is now 25% visible
```

### 2. Trend Chart Animation Starts
```
FRAME 0ms (Start)          FRAME 475ms (Halfway)    FRAME 950ms (Complete)
┌─────────────────┐        ┌─────────────────┐      ┌─────────────────┐
│       │         │        │   ╱    ╱        │      │  ╱  ╱  ╱  ╱    │
│       │  (none) │   →    │╱────────╱       │  →   │─────────────   │
│       │         │        │    ╱    ╱       │      │╱  ╱  ╱  ╱     │
└─────────────────┘        └─────────────────┘      └─────────────────┘
       v=0                     v=0.5                      v=1.0
    invisible              half-visible              fully visible
```

### 3. Animation Details
```
Direction: Expands from CENTER outward in both directions

Timeline:   [████████░░░░░░░░░░░░] 950ms total duration
           0ms    |    475ms    |    950ms

Easing:    easeOutCubic (fast at start, smooth slowdown at end)
           ╲___________________
            (no bounce, no overshoot)
```

---

## Mobile User Experience (≤768px Width)

### 1. Page Loads or Card Comes into View
```
┌────────────────────┐
│ How Ratios Moved   │
│                    │
│ Animation starts   │
│ IMMEDIATELY (no    │
│ scroll wait)       │
└────────────────────┘
```

### 2. Instant Animation Completes
```
Animation runs: 0ms → 950ms (same smooth reveal)
No scroll-based trigger (avoids animation glitches while scrolling)
User always sees smooth chart reveal
```

---

## What Animates

### ✅ Animates
- **Trend Lines**: Reveal from center outward
  - Gross Profit % line
  - Tech Labor % line
  - Parts % line
  - Admin & Office % line
  - Profit % line

- **Filled Areas**: Grow in sync with lines
  - Green areas (above goals)
  - Red areas (below goals)

- **Goal Lines**: Appear with their corresponding data lines

### ❌ Doesn't Animate
- Chart axes and gridlines (pre-rendered)
- Legend (appears before animation)
- Tooltip interactions
- Interactive selections

---

## Animation Trigger Scenarios

### Scenario 1: First Page Load
```
User navigates to Location Owners tab
        ↓
trendChartInst created
        ↓
renderOwners() initializes all charts
        ↓
Trend animation starts immediately (or on scroll for desktop)
        ↓
950ms center-out reveal completes
```

### Scenario 2: Switch Month → Quarter
```
User clicks Month/Quarter picker
        ↓
Clicks [Quarter] tab
        ↓
setFinGranularity('quarter') called
        ↓
renderOwners() re-runs
        ↓
trendChartInst destroyed and recreated
        ↓
NEW animation starts (same 950ms reveal)
```

### Scenario 3: Select Different Period
```
User selects Q1 2026 (quarterly) or March 2026 (monthly)
        ↓
pickFinMonth() or pickFinQuarter() called
        ↓
closMonthPicker() closes dropdown
        ↓
renderOwners() re-runs with new data
        ↓
trendChartInst updated
        ↓
Animation restarts for new data
```

### Scenario 4: Scroll on Desktop
```
User scrolls and trend card comes into view
        ↓
IntersectionObserver detects 25% visibility
        ↓
restartTrendAnim() called
        ↓
_tRev.v resets to 0
        ↓
950ms center-out reveal starts
        ↓
Observer disconnects (animation won't repeat)
```

---

## Timeline Comparison

### Revenue Bar Chart (Desktop Only)
```
Load → Wait for scroll → Card visible → Staggered bar animation
Time:     varies              ↓            150-200ms bars
                        (scroll trigger)
```

### Trend Chart (Desktop & Mobile)
```
Desktop:  Load → Wait for scroll → 950ms reveal animation
Mobile:   Load → Immediate 950ms reveal animation

Both show smooth center-out expansion of trend lines
```

### Cash Flow Bar Chart (Desktop Only)
```
Load → Wait for scroll → Card visible → Growing bars animation
Time:     varies              ↓              500ms bars
                        (scroll trigger)
```

---

## Visual Timeline

### Second-by-Second Breakdown

```
Frame   Time    Desktop State              Mobile State
────────────────────────────────────────────────────────
  0     0ms     [Not visible yet]         [Visible, animating]
              
  1   100ms     [Scrolling towards]       ╱
              
  2   250ms     [Getting closer]         ╱  ╱
              
  3   475ms     ╱  ╱  ╱  ╱               ╱  ╱  ╱  ╱
              
  4   700ms     ╱  ╱  ╱  ╱  ╱            ╱  ╱  ╱  ╱  ╱
              ────────────────           ────────────────
  
  5   950ms     ╱  ╱  ╱  ╱  ╱            ╱  ╱  ╱  ╱  ╱
              ────────────────           ────────────────
                (animation done)              (animation done)
```

---

## Audio-Visual Metaphor

Imagine the trend chart animates like **window blinds opening from the center**:

```
    Closed         Opening         Open
    ││││           │ ╱ │          ╱  ╱  ╱
    ││││    →      ╱  ╱ │   →     ╱  ╱  ╱
    ││││           │ ╱ │          ╱  ╱  ╱

   (v=0)        (v=0.5)          (v=1.0)
```

Or like **water ripples expanding from the center** outward.

---

## Easing Curve Visualization

### easeOutCubic (Used for Trend Chart)

```
Speed       Fast at start, smooth slowdown
│
1.0 ╱─────────────╲
│   ╱             ╲
0.5├──────╱─────────╲
│     ╱           ╲
0.0 └──────────────────────── Time
    0%      50%      100%
```

**Characteristics:**
- Feels natural and polished
- Starts quick (grabs attention)
- Ends smooth (doesn't feel rushed)
- No bounce or overshoot

---

## Testing the Animations

### Desktop (Chrome DevTools)
```
1. Open http://localhost:3000
2. Navigate to Location Owners tab
3. Scroll down to "How The Ratios Have Moved"
4. Watch the trend lines expand from center outward
5. Animation takes ~1 second to complete
6. Should be smooth with no stuttering
```

### Mobile Device
```
1. Open http://localhost:3000 on iPhone/Android
2. Animation should start immediately (no scroll needed)
3. Should complete smoothly in ~1 second
4. No glitching when scrolling past the chart
```

### Animation Replay
```
1. Switch between Month and Quarter modes
2. Select different periods
3. Each time, animation restarts
```

---

## Performance Notes

**Desktop (>768px):**
- Uses IntersectionObserver (efficient native API)
- Only checks intersection once, then disconnects
- RAF-driven (requestAnimationFrame) = smooth 60fps
- Single animation instance at a time

**Mobile (≤768px):**
- No IntersectionObserver overhead
- Immediate animation start
- Same RAF loop = smooth performance
- Prevents scroll-triggered animation glitches

**Result:** Smooth animations on all devices with no performance penalty

---

## Summary

✨ **The Trend Chart Animation Now:**
- Smoothly reveals trend lines from center outward
- Triggers on scroll (desktop) or immediately (mobile)
- Completes in 950ms with easeOutCubic easing
- Restarts whenever data changes or period changes
- Works beautifully on all devices without glitches
- Provides visual feedback of data changes

The animation creates a **premium, polished feel** while communicating that new data is being displayed.
