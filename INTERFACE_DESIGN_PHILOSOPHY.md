# Interface Design Philosophy: Bento-Box Soft Minimalism

This reference defines the preferred interface style for modern product work:
hyper-modern, tactile, highly structured, and visually satisfying without
becoming decorative clutter. The design should feel less like a flat web page
and more like a physical tray holding premium matte and frosted-glass widgets.

Use this document as the default UI reference before designing dashboards,
admin tools, apps, reports, cards, modals, list rows, and data-heavy workflows.

## 1. Core Style

The overarching style is **Bento-Box Soft Minimalism**.

The interface should be:

- Modular and compartmentalized.
- Soft, rounded, tactile, and physical.
- Spacious rather than dense.
- High contrast in hierarchy, not noisy in color.
- Built from distinct cards, widgets, rows, and blocks.
- Animated with subtle physical feedback.
- Premium and modern, but still practical for repeated work.

Avoid interfaces that feel like:

- Flat spreadsheets.
- Dense admin tables.
- Generic SaaS cards with tiny padding.
- One-note palettes.
- Harsh shadows or hard rectangular boxes.
- Marketing pages when the task is an actual work tool.

## 2. Spatial Philosophy

The canvas is a resting layer. It should rarely be pure white. Prefer warm
off-whites, misty grays, or very subtle ambient gradients.

Good background foundations:

- `#FAF9F6`
- `#F7F4EE`
- `#F4F1EA`
- `#F5F7FA`
- Dark mode: `#0F172A`, `#111827`, `#151A22`

The main workspace should be broken into distinct zones, like a bento box.
Avoid one continuous river of content. Each meaningful group belongs in a card,
row, block, panel, tray, or widget.

Use thick, consistent gutters between cards. The empty space between modules
is structural. It is the grout holding the interface together.

## 3. Bento Grid Rules

Use asymmetry and mixed scale deliberately.

Prefer layouts like:

- One large hero card spanning 60% to 70% of the width.
- A stack of smaller square or rectangular utility cards beside it.
- Secondary rows of smaller modules beneath.
- Masonry-like groups where related cards feel locked into a system.

Avoid:

- Equal-size cards everywhere.
- Long, unbroken tables.
- Rigid spreadsheet-like grids unless the task truly requires comparison.
- Overly decorative section wrappers.

## 4. Card Architecture

Cards are the core building block.

Card rules:

- Border radius: usually `24px` to `32px` for primary cards.
- Smaller utility cards can use `16px` to `22px`.
- Use a subtle 1px semi-transparent border.
- Use soft ambient shadows, not harsh drop shadows.
- Card fills can be warm white, matte dark, frosted translucent, or soft gradients.
- Content must never hug the edges.

Suggested card CSS:

```css
.card {
  background: rgba(255, 255, 255, 0.82);
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 28px;
  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.04),
    0 18px 60px rgba(15, 23, 42, 0.06);
  backdrop-filter: blur(18px);
}
```

## 5. Depth and Shadows

Depth should feel ambient, not heavy.

Use:

- Large blur radius.
- Low opacity.
- Layered shadows.
- Slight bright edge borders.

Avoid:

- Dark hard shadows.
- Dramatic floating panels.
- Flat cards with no tactile edge.

Good shadow:

```css
box-shadow:
  0 1px 2px rgba(15, 23, 42, 0.04),
  0 20px 70px rgba(15, 23, 42, 0.07);
```

Hover shadow:

```css
box-shadow:
  0 3px 10px rgba(15, 23, 42, 0.07),
  0 28px 90px rgba(15, 23, 42, 0.10);
```

## 6. Internal Spacing

Whitespace is a structural element.

Card padding:

- Compact cards: `18px` to `24px`.
- Standard cards: `24px` to `32px`.
- Hero cards: `32px` to `44px`.

If content feels cramped, do not simply shrink the text. Split the content into
another card, secondary block, expandable panel, or detail drawer.

## 7. Corner Anchoring

Inside each card, use predictable anchors:

- Top left: title, label, or context.
- Top right: action, menu, filter, icon, or secondary control.
- Center: primary data, main visualization, or dominant content.
- Bottom: comparison, legend, helper text, or metadata.

The user should always know where to look for context and where to look for
actions.

## 8. Proximity and Clustering

Related elements should be tightly grouped. Different concepts should be
separated by real whitespace.

Example:

- Label and KPI number are a tight cluster.
- Supporting trend text sits nearby but visually secondary.
- A separate metric gets its own cluster or card.

Use faint dividers only when whitespace is not enough.

## 9. List and Row Design

Lists should feel airy and modern, not like default tables.

Row architecture:

- Tall rows.
- Rounded row containers when possible.
- Minimal or absent dividers.
- Left side: identifying element, avatar, icon, status rail, or badge.
- Middle: bold title plus muted subtitle/details.
- Right side: status, action, timestamp, amount, or score.

For admin job rows, prefer:

- Distinct row cards.
- A status rail or status pill.
- Strong invoice/customer hierarchy.
- Metadata grouped into a right-side cluster.
- Actions grouped together, not scattered across the row.
- Hover lift and subtle glow.

## 10. Status and Tags

Never use plain text for statuses, categories, or alerts.

Use pill tags:

- Fully rounded ends.
- Soft low-opacity background.
- Deep text color from the same hue.
- Bold text.
- Slight border in the same hue family.

Examples:

```css
.pill-success {
  background: rgba(47, 125, 73, 0.10);
  color: #1F6F3B;
  border: 1px solid rgba(47, 125, 73, 0.18);
}

.pill-warning {
  background: rgba(201, 130, 10, 0.12);
  color: #9B6508;
  border: 1px solid rgba(201, 130, 10, 0.20);
}
```

## 11. Typography

Use clean geometric sans-serif fonts:

- Inter
- Satoshi
- SF Pro
- Circular
- Similar modern sans-serif families

Hierarchy comes from size and weight contrast, not font mixing.

Rules:

- Hero numbers: massive, extra-bold or black.
- Card titles: bold or semi-bold, much smaller than KPIs.
- Metadata: small, muted, medium or regular weight.
- Use tabular numerals for all changing numbers.

Required numeric style:

```css
font-variant-numeric: tabular-nums;
```

Avoid:

- Tiny low-contrast labels for important data.
- Too many font sizes in a single card.
- Negative letter spacing on UI text.
- Decorative fonts.

## 12. Color Strategy

Use **Neutral Base + High-Energy Accent**.

Base colors should make up most of the UI:

- Warm whites.
- Pale grays.
- Taupes.
- Deep slate.
- Soft charcoal.

Accent colors should be sparse and intentional:

- Active states.
- Primary buttons.
- Progress bars.
- Critical pills.
- Key data highlights.

Use one grounding accent and one energetic pop when needed.

Example pairings:

- Deep emerald + electric lime.
- Deep navy + vibrant coral.
- Charcoal + sunset orange.
- Slate + soft violet.

Avoid pure `#000000` and lifeless pure white as the entire experience.

## 13. Mesh Gradients and Ambient Light

Ambient backgrounds should feel like light, not decoration.

Use:

- Large blurred blobs.
- Low opacity.
- Pastel color bleed.
- Radial gradients.
- No visible hard shapes.

Example:

```css
.canvas::before {
  content: "";
  position: fixed;
  inset: -20%;
  background:
    radial-gradient(circle at 20% 10%, rgba(255, 205, 138, 0.24), transparent 28%),
    radial-gradient(circle at 80% 0%, rgba(173, 216, 255, 0.20), transparent 30%),
    radial-gradient(circle at 45% 90%, rgba(196, 181, 253, 0.16), transparent 28%);
  filter: blur(30px);
  pointer-events: none;
}
```

Do not use visible orb decorations or obvious blob stickers. The gradient is
ambient lighting.

## 14. Buttons and Inputs

Buttons should feel physical.

Primary buttons:

- Solid accent or deep slate fill.
- Pill or heavy-radius shape.
- Bold centered text.
- Subtle press state.

Secondary buttons:

- Light gray or translucent pill.
- Thin border.
- Icon or short label.

Inputs:

- Rounded.
- Soft border.
- Warm fill.
- Strong focus ring with accent color.

## 15. Motion and Interaction

Motion should feel tactile, with mass and friction.

Hover:

- Translate up `-2px` to `-4px`.
- Expand soft shadow.
- Increase border contrast.
- Accent important text or icons.

Press:

- Scale down to `0.98`.
- Tighten shadow.
- Release back to hover.

Suggested transition:

```css
transition:
  transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
  box-shadow 220ms cubic-bezier(0.2, 0.8, 0.2, 1),
  border-color 180ms ease,
  color 180ms ease;
```

## 16. Loading States

Avoid spinners unless absolutely necessary.

Use skeletons:

- Same shape as final content.
- Rounded blocks.
- Subtle shimmer.
- Staggered reveal.

Skeleton shimmer:

```css
.skeleton {
  position: relative;
  overflow: hidden;
  background: rgba(15, 23, 42, 0.06);
  border-radius: 18px;
}

.skeleton::after {
  content: "";
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.55),
    transparent
  );
  animation: shimmer 1.4s infinite;
}

@keyframes shimmer {
  100% { transform: translateX(100%); }
}
```

## 17. Data Visualization

Charts should feel organic and tactile.

Line charts:

- Smooth spline curves.
- Thick 3px to 4px stroke.
- Soft gradient fill beneath.
- Prominent circular data points.
- White ring around nodes when needed.

Bar charts:

- Rounded caps.
- Thick bars.
- Soft gradient fills.
- Optional segmented battery-meter aesthetic.

Progress rings:

- Thick tracks.
- Rounded end caps.
- Muted background track.
- Vibrant gradient foreground.

## 18. Implementation Checklist

Before calling a UI finished, check:

- Does every meaningful piece of content live in a card, row, tray, or clear block?
- Are the border radii generous and consistent?
- Is there enough internal padding?
- Are status values represented as pills?
- Are actions predictable and clustered?
- Are numbers using tabular numerals?
- Does hover feel like a magnetic lift?
- Does click feel like a tactile press?
- Is the palette mostly neutral with accents used sparingly?
- Is the row/list layout airy rather than table-like?
- Does the page still support repeated work without feeling like a landing page?
- Does mobile avoid squeezed text and cramped controls?

## 19. Practical Rule

When in doubt, make the UI feel like a premium physical object:

- Soft edges.
- Clear compartments.
- Calm whitespace.
- Strong typography.
- Muted base.
- Confident accent.
- Gentle depth.
- Responsive, tactile motion.

