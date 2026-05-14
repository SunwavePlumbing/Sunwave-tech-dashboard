# Sunwave Information Display Guide

This document explains how Sunwave interfaces should display information so the screens are easy to read, satisfying to use, and useful under real operating pressure. It is written for the Sunwave KPI dashboard and the Sunwave Online Scheduler, but the rules are general enough to apply to future Sunwave tools.

The goal is not to show less information. The goal is to show the right information at the right time, in the right order, with enough context for the user to trust it and act on it.

## Source Context

This guide is based on the existing Sunwave projects:

- `Sunwave-tech-dashboard`: technician KPI leaderboard, admin reconciliation queue, paid jobs audit, diagnostics, marketing dashboard, owner/location leader financial views, and technician issue reporting.
- `Online Scheduler`: public booking flow, admin booking mode, admin dashboard, setup health checks, schedule controls, service area settings, and booking diagnostics.

It also draws on established usability and accessibility guidance:

- Nielsen Norman Group on progressive disclosure: https://www.nngroup.com/articles/progressive-disclosure/
- Nielsen Norman Group on web scanning and F-shaped reading: https://www.nngroup.com/articles/f-shaped-pattern-reading-web-content/
- Nielsen Norman Group usability heuristics: https://www.nngroup.com/articles/ten-usability-heuristics/
- GOV.UK Service Manual on user needs: https://www.gov.uk/service-manual/user-centred-design/user-needs
- GOV.UK content design guidance: https://www.gov.uk/guidance/content-design/user-needs
- W3C WCAG 2.2 focus not obscured: https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html
- W3C WCAG 2.2 target size: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum
- W3C WCAG status messages: https://www.w3.org/WAI/WCAG22/Understanding/status-messages

## Core Principle

Every screen should answer this sequence:

1. What is happening?
2. Is it good, bad, incomplete, or uncertain?
3. What needs attention first?
4. What can I do next?
5. Where can I inspect the proof?

If a screen cannot answer those five questions quickly, the problem is usually not visual polish. The problem is information hierarchy.

For Sunwave, information is not decoration. It is operational evidence. A technician checking the leaderboard wants to know whether the numbers are fair. An admin reviewing jobs wants to know which records need intervention. A customer booking online wants to know whether Sunwave can help, when someone can come, and what will happen after submission. An owner wants to know whether the business is healthy and why.

Therefore, the interface must make truth legible.

## The Sunwave Information Contract

Any screen that displays operational information must keep this contract:

- Show the primary answer first.
- Show the state of confidence next.
- Show the reason or source close to the number.
- Show exceptions as first-class information, not footnotes.
- Show actions only where the user is ready to act.
- Hide supporting detail until it explains a decision.
- Preserve the user's place when they inspect details.
- Never let visual design imply certainty the data does not have.

This matters especially in the KPI dashboard. A leaderboard value is not just a number. It can be affected by HCP job dates, invoice payments, financing, ServiceTitan artifacts, split credit, seller/doer rules, manual reconciliation, exclusions, and cache freshness. If the interface shows only the number and hides every caveat, it creates false confidence. If it shows every caveat all at once, it creates noise. The job of information design is to make the right caveat visible at the right layer.

## Prioritization Model

Use this model to decide what belongs on the first screen, inside a row, inside a drawer, or behind diagnostics.

### Layer 1: Decision Summary

This is the smallest set of information needed to understand the current state.

Examples:

- Technician dashboard: total value created, average ticket, total jobs, sorted leaderboard.
- Admin queue: number of open jobs, dollars remaining to verify, current period, active filter.
- Scheduler booking: current step, selected service, verified address, available slots.
- Owner dashboard: revenue, COGS, overhead, profit, cash, selected period.

Layer 1 should be visible without digging. It should use large type, clear labels, and a predictable layout. It should avoid commentary unless the commentary changes what the user should do.

### Layer 2: Decision Drivers

These are the reasons the summary looks the way it does.

Examples:

- Why a job is credited to Patrick Fuller.
- Why a job is missing from the leaderboard.
- Why an availability slot is blocked.
- Why a location setup health check is warning.
- Which categories make up COGS or overhead.

Layer 2 should be near the summary, but not equal in visual weight. It belongs in chips, short sublabels, expandable rows, small callouts, or a compact drawer summary.

### Layer 3: Proof and Audit Trail

This is the evidence behind the decision drivers.

Examples:

- HCP job ID, invoice ID, paid timestamp, assigned employees, event timeline.
- Reconciliation history and admin override notes.
- Raw API response fragments in diagnostics.
- Booking payload, selected tech, location rules, customer record match.
- QBO line-item details.

Layer 3 should be available, but it should not be the default reading experience. Put it in drawers, details sections, diagnostics tabs, or "View source" style panels. Use it to build trust, not to crowd the main task.

### Layer 4: Maintenance and Configuration

This is information needed to change the system itself.

Examples:

- HCP keys, Google API keys, service areas, bookable tech settings.
- Hidden service types.
- Slot duration, lead time, business days, blackout dates.
- Admin reconciliation tools.

Layer 4 belongs in admin flows, setup screens, and settings panels. Do not let it leak into customer or technician surfaces unless the user needs it to complete their task.

## The Question Ladder

For every component, ask these questions in order:

1. What question is the user asking here?
2. What answer would let them move forward?
3. What exception would make the answer unsafe?
4. What proof would make the answer trusted?
5. What action belongs next to the answer?
6. What can be moved one layer deeper?

Example: admin job card.

- User question: "Can I verify this job?"
- Answer: invoice, customer, current attribution, amount, date, confidence score.
- Unsafe exception: unpaid, multiple techs, missing assigned employee, out-of-period date, issue report.
- Proof: HCP context, invoice payment, timeline, prior jobs.
- Action: Correct / open drawer / verify / defer / exclude.
- Move deeper: raw HCP object, all line items, full prior history unless the card is opened.

Example: scheduler service card.

- User question: "Which service matches my problem?"
- Answer: service name and a short plain-language description.
- Unsafe exception: commercial work, outside service area, hidden/unbookable service.
- Proof: service category details, examples of common issues.
- Action: select service and continue.
- Move deeper: long diagnostic explanation, admin-only job type metadata.

## Screen-Level Rules

### One Primary Job Per Screen

Each screen should have one dominant job.

- Technician dashboard: compare performance and spot wrong numbers.
- Admin Verify: clear the exception queue.
- Paid Jobs Audit: prove every paid invoice landed somewhere.
- Scheduler public flow: book a residential service visit.
- Scheduler admin dashboard: configure a working booking system.
- Owner dashboard: understand business health and trend direction.

When a screen tries to do two unrelated jobs equally, the hierarchy collapses. If two jobs must coexist, one should be the workspace and the other should be a supporting rail, drawer, or tab.

### First Viewport Must Contain the Core Answer

The first viewport should show the answer, not a preamble.

Good:

- KPI cards plus leaderboard.
- Health checklist plus top setup problems.
- Booking step plus the next required input.
- Financial summary plus selected period.

Bad:

- A large explanatory hero before the data.
- A generic title that pushes the work below the fold.
- Dense filters before the user knows what is filtered.
- Diagnostics text before the result.

### Use Page Titles for Orientation, Not Decoration

A title should tell the user where they are and what they can accomplish.

Good:

- "Verify Jobs"
- "Paid Jobs Audit"
- "Book a Service Visit"
- "Location Setup"
- "Where Every Dollar Went"

Weak:

- "Dashboard"
- "Overview"
- "Details"
- "Information"

Titles are navigation. Do not waste them.

### Put Controls After Context

Filters, sort controls, and settings are easier to use after the user understands the data being controlled. Put the current state and high-level summary before complex control sets unless the control is the first required input.

Examples:

- In admin Verify, the period picker can sit in the sticky control card because period defines every row.
- In the scheduler, service and address come before the calendar because they determine availability.
- In the owner dashboard, period comes before charts because it changes the entire financial story.

### Keep Persistent Controls Stable

Controls that users repeat often should stay in predictable places.

- Period picker always near the top of KPI/admin/financial views.
- Primary submit/verify action always in the card footer or drawer footer.
- Close/back controls always top-right or top-left depending on pattern.
- Filter pills always above the list they affect.
- Help/diagnostic links always secondary.

Do not move a control because a new state appears. Change the content inside the control region, not its position.

## Component-Level Rules

### Cards

Cards should group one decision, not just one visual object.

A good card has:

- One clear label.
- One primary value or answer.
- One state indicator if needed.
- One short explanation if the value is not self-evident.
- One action only if the card is meant to be acted on.

Avoid cards that contain multiple unrelated metrics, long paragraphs, and several competing buttons. If a card needs more than one action, consider whether it should be a row, drawer, or full page.

Card hierarchy:

- Hero card: one primary metric or state, large type, strong contrast.
- Support card: contextual metric, smaller type, quieter border.
- Exception card: specific issue, visible status, clear next action.
- Proof card: source fields, IDs, timestamps, raw context, low visual dominance.

### Rows

Rows are for repeated entities: technicians, jobs, customers, services, checks, invoices, line items.

Every row should follow a stable information grammar:

- Left: identity.
- Middle: reason/context.
- Right: outcome/action.

For KPI job cards:

- Left: status and identity, such as credited/unattributed plus invoice/customer.
- Middle: attribution, flags, reasons, description.
- Right: date, amount, confidence, action.

For scheduler admin health rows:

- Left: system name or check.
- Middle: current condition.
- Right: severity/action.

For booking slots:

- Left: date/time.
- Middle: arrival-window or tech/service context if appropriate.
- Right: select action or availability state.

Rows should be clickable when the row represents an inspectable object. The whole row should be the hit target unless a child control has a distinct action. If only part of the row opens details, the interface feels broken.

### Tables

Use tables when comparison across columns is the task.

Use cards or rows when inspection of individual records is the task.

Sunwave table rules:

- Left-align text.
- Right-align comparable numbers.
- Use tabular numerals for money, counts, percentages, and dates.
- Keep headers short.
- Freeze or repeat context when the table is long.
- Use faint dividers or row spacing, not heavy borders.
- Highlight selected or current rows with background and border, not only color.
- Never put unexplained status color inside a table without a label.

In the technician leaderboard, the table works because the task is comparison: value created, average ticket, jobs, unpaid. In the admin Verify queue, card rows work better because each job is an exception case that may need inspection.

### Pills and Tags

Pills should encode state, category, or filter.

Use pills for:

- Credited, excluded, unpaid, corrected, verified.
- Single tech, split credit, financing, issue, high ticket.
- Current filter or period.
- Setup health status.

Do not use pills for long explanations. A pill should be scannable in under one second.

Pill text should be concrete:

- Good: "Unpaid", "Single tech", "Needs attribution", "HCP issue"
- Weak: "Attention", "Info", "Special", "Other"

### Banners and Warnings

Warnings should be reserved for information that changes interpretation or action.

Use a warning banner when:

- Data may be incomplete.
- A period includes known migration/ServiceTitan caveats.
- Paid invoices could not be attributed.
- A setup dependency blocks booking.
- A customer is outside the service area.

Do not use a warning banner for ordinary helper text. Helper text belongs near the field or section.

A good warning says:

- What happened.
- Why it matters.
- What the user can do.

Example:

"3 paid jobs could not be attached to a technician. Review unattributed work before trusting the leaderboard."

### Drawers and Modals

Use drawers when the user needs to inspect or edit one item while keeping list context.

Use modals when the user must make a focused decision before continuing.

Drawer rules:

- The drawer title must identify the object: invoice, customer, amount.
- Show a compact summary before the form.
- Put the primary action in a stable footer.
- Keep previous/next navigation visible if the drawer belongs to a queue.
- Preserve list position and active row highlight.
- Return focus to the opened row on close.
- Do not lock page scroll unless the drawer is actually open.

For Sunwave admin review, the drawer should answer "Is this job safe to verify?" before showing every editable field.

### Accordions and Details

Use accordions for proof and education, not for hiding required steps.

Good accordion content:

- HCP context.
- Line items.
- Prior customer jobs.
- QBO line items.
- Advanced settings.
- Explanation of a formula.

Bad accordion content:

- Required booking fields.
- Primary warnings.
- The next required action.

Accordion summary labels must tell the user what is inside:

- Good: "Payment history", "Event timeline", "Line items", "Why this job is missing"
- Weak: "More", "Details", "Info"

## How Much Information To Display

Use this rule:

Show enough information to make the next decision safe. Hide the rest until the user asks.

### The Minimum Useful Unit

Every component should have a minimum useful unit:

- KPI card: label + value + period/context.
- Leaderboard row: person + metric values + rank/identity.
- Job card: invoice/customer + attribution + amount/date + confidence/status.
- Booking service card: service name + customer-recognizable description.
- Calendar slot: date + arrival window + availability.
- Setup health row: dependency + pass/fail state + fix path.

If a component has less than its minimum useful unit, it feels vague. If it has much more, it becomes slow to scan.

### The Three-Pass Reading Model

Design every dense screen for three passes:

1. Pass 1: user scans headings, large numbers, statuses.
2. Pass 2: user compares rows/cards.
3. Pass 3: user opens detail for proof or action.

If a detail needed in Pass 1 is only visible in Pass 3, users will miss it. If Pass 3 proof is visible in Pass 1, users will feel overwhelmed.

### The Five-Item Rule For First Impressions

The first viewport should avoid presenting more than five dominant things.

This does not mean only five pieces of data total. It means only five things should compete for primary attention.

Examples:

- KPI dashboard first view: tab nav, period pills, 3 KPI cards, leaderboard heading.
- Admin Verify first view: period control, progress bar, filter pills, first job group, auto-verify card if relevant.
- Scheduler first step: stepper, question, service cards, continue button.
- Owner dashboard first view: period picker, formula card, warning if needed, one secondary chart teaser.

If more than five objects feel equally loud, reduce emphasis or split the content.

## Prioritizing Information

Use this priority order for Sunwave interfaces:

1. Safety blockers.
2. Money.
3. Time.
4. Identity.
5. Confidence.
6. Explanation.
7. Source/proof.
8. Configuration.

### Safety Blockers

Safety blockers are facts that prevent the user from proceeding correctly.

Examples:

- Outside service area.
- Commercial property when the company is residential-focused.
- No bookable techs.
- Missing HCP key.
- Diagnostics password required.
- Job has no linked HCP record.
- Paid invoice not represented in leaderboard.

Safety blockers should be visually obvious and close to the blocked action.

### Money

Money is usually the most important operational signal for Sunwave.

Money display rules:

- Use whole dollars unless cents matter.
- Use tabular numerals.
- Keep signs clear: positive, negative, unpaid, paid, drift.
- Put period context near money.
- Do not mix paid amount, total amount, outstanding balance, and credited amount without labels.
- When there is disagreement, show both values and label the source.

Examples:

- "Credited $1,800 vs HCP paid $2,300"
- "Unpaid $5,767"
- "Truth - dashboard: +$3,330"

### Time

Time determines whether data belongs in the current period and whether the user's task can proceed.

Time display rules:

- Use plain labels for common ranges: Today, Month to Date, Last 30 Days.
- Use exact dates in diagnostics and audit contexts.
- In booking, show friendly dates and arrival windows.
- In admin, show KPI date and paid date when they can differ.
- If the date is inferred or overridden, label that fact.

### Identity

Identity tells the user what object they are looking at.

For jobs, identity is not just the customer name. It is invoice/customer/job ID/context.

For people, identity can be initials/avatar plus full name.

For locations, identity should include the active location name wherever settings can differ by location.

For booking, identity shifts through the flow:

- Service identity.
- Address identity.
- Time identity.
- Customer identity.
- Final booking identity.

### Confidence

Confidence is essential in admin and diagnostics.

Use confidence indicators when the system is making an inference:

- Auto-attribution.
- Seller inference.
- Paid invoice rescue.
- Address geocoding.
- Tech assignment.
- Setup health.

Confidence should never be a mysterious score alone. Pair the score with flags or reasons.

Good:

"65 - worth a quick look: split credit, amount drift"

Weak:

"65"

### Explanation

Explanations should be short and local.

The user should not need to read a paragraph at the top of the page to understand a row halfway down the page. Put the explanation where the question arises.

Good:

- A pill that says "Paid May 13".
- A drawer flag saying "No assigned employee".
- A service-area notice under the address field.
- A setup health detail under the failed check.

### Source and Proof

Source/proof is how the interface earns trust.

For Sunwave, proof often means:

- HCP job ID.
- Invoice number.
- Paid timestamp.
- QBO report source.
- Cache age.
- Reconciliation author/date.
- Service zone or county match.

Show proof by default only when the screen's job is auditing. Otherwise keep it one layer deeper.

## User Flow Rules

### Public Booking Flow

The public scheduler should feel like a guided conversation, not a form.

Best order:

1. Establish service fit.
2. Establish property/address fit.
3. Show availability.
4. Ask for problem details.
5. Ask for identity/contact.
6. Confirm and set expectations.

Why this order works:

- It prevents the customer from typing contact details before knowing if Sunwave can help.
- It lets the system filter availability based on service area and service type.
- It turns the calendar into a confident choice instead of a vague promise.

Booking display rules:

- One primary question per step.
- Keep step labels short: Service, Time, Problem, Finish.
- Show selected prior answers as summary chips when the user moves forward.
- Hide irrelevant fields as soon as a user makes a choice that makes them irrelevant.
- Explain blocks immediately, such as commercial or outside area.
- Never show a disabled Continue button without a nearby reason.

### Admin Booking Flow

Admin booking is different from public booking. Admin users are taking phone calls and need speed.

Admin booking should be single-page or near-single-page:

- Description/problem first.
- Customer search/autofill.
- Contact and address.
- Tech override if needed.
- Calendar/time.
- Review summary.

The admin needs to see more at once because the task is non-linear. They may ask the customer for information in an order that does not match the public flow. This is one of the few places where more visible information is appropriate.

### Admin Reconciliation Flow

Admin reconciliation is a queue-clearing workflow.

The flow should be:

1. Pick period.
2. See progress and open workload.
3. Filter to the highest-value or highest-risk cases.
4. Open one job.
5. See summary, confidence, flags.
6. Inspect proof if needed.
7. Verify, defer, or exclude.
8. Move automatically to the next job.

The interface should keep momentum. The user should not have to close a drawer, find their place again, and click the next row manually after every job.

### Technician KPI Flow

Technicians want fast comparison and fairness.

The flow should be:

1. See current period.
2. See top-line company totals.
3. Find own row.
4. Compare rank and metrics.
5. Inspect jobs if something looks wrong.
6. Report issue if needed.

Do not bury issue reporting. If users do not trust the data, the dashboard loses its purpose.

### Owner/Location Leader Flow

Owners need story and causality.

The flow should be:

1. Select period.
2. See formula: revenue - COGS - overhead = profit.
3. See trend direction.
4. Inspect where dollars went.
5. Drill into line items.
6. Compare against prior period.

Owner screens can have more education than technician screens because the task is interpretation, not only checking.

## Writing Rules

### Use User Language

Use words Sunwave users say.

Prefer:

- Value created
- Avg ticket
- Jobs
- Unpaid
- Paid
- Credited
- Needs review
- Bookable tech
- Service area
- Arrival window

Avoid:

- Entity
- Attribution object
- Reconciliation artifact
- Temporal window
- Service professional assignment candidate

Technical language can appear in diagnostics, but even there it should be paired with a plain-language explanation.

### Put The Most Useful Words First

Users scan headings and labels. The first words need to carry meaning.

Good:

- "Unpaid jobs"
- "Missing paid invoices"
- "Bookable techs"
- "Outside service area"
- "Amount drift"

Weak:

- "Jobs that are unpaid"
- "Some invoices may be missing"
- "A note about availability"
- "Things to check"

### Make Empty States Useful

An empty state should say what is empty and whether that is good.

Good:

- "No paid invoices are missing. This period reconciles cleanly."
- "No issue reports yet."
- "No bookable techs. Enable at least one HCP employee for online booking."

Weak:

- "Nothing here."
- "No data."
- "Empty."

### Status Messages

Status messages should be visible and programmatically announced when appropriate.

Use status messages for:

- Loading.
- Saved.
- Error.
- Copied.
- Availability updated.
- Booking submitted.
- No results found.

For implementation, use `role="status"` for polite updates and `role="alert"` for urgent errors. W3C guidance specifically calls out status messages that do not take focus, such as search result counts, invalid entries, progress, or successful submission.

## Visual Hierarchy Rules

### Size Means Importance

Only primary answers get large type.

Use large type for:

- Total value created.
- Profit.
- Selected booking date/time.
- Queue progress.
- Main status.

Do not use large type for:

- Helper copy.
- Labels.
- Decorative headings inside small cards.
- Repeated row metadata.

### Color Means State

Color should carry operational meaning.

Sunwave default:

- Orange: active, selected, primary action.
- Navy/charcoal: core text and high-emphasis labels.
- Light blue: calm support or neutral information.
- Green: paid, correct, healthy.
- Gold: warning, needs review.
- Coral: unpaid, negative balance, error or risk.
- Mist/card white: surfaces and inactive controls.

Never use color alone. Pair it with text, icons, position, or shape.

### Whitespace Means Grouping

Whitespace should group related content and separate different decisions.

Within a card:

- Tight spacing within one thought.
- Larger spacing between thoughts.
- Faint divider only when spacing is not enough.

Between cards:

- Consistent gutters.
- Do not nest cards inside cards unless the inner object is truly a repeated item or a modal.

### Motion Means Change

Motion should clarify state changes.

Good motion:

- Count-up on KPI values.
- Skeleton shimmer during fetch.
- Drawer open/close.
- Row hover lift.
- Smooth step transition in booking.
- Chart reveal after data loads.

Bad motion:

- Animation that delays reading.
- Reordering without stable anchors.
- Spinners with no structural preview.
- Motion that triggers while the user is trying to click.

## Trust and Data Quality

Sunwave tools often aggregate imperfect external systems. The UI must distinguish these states:

- Confirmed.
- Inferred.
- Needs review.
- Missing source data.
- Excluded by rule.
- Manually overridden.
- Cached/stale.

### Freshness

Any dashboard with live data needs freshness cues.

Use:

- "Updated 2 min ago"
- "Shown from local cache"
- "Refresh data"
- "Dashboard cache age: 7 min"

Avoid making users guess whether a number is live.

### Exceptions Are Not Failure

Exception queues are a feature. They show that the system did not silently drop money.

Examples:

- Unattributed jobs.
- Missing paid invoices.
- Amount drift.
- Standalone invoices.
- Tech-submitted issues.
- Setup health warnings.

Do not visually punish the user with noisy red everywhere. Use calm warning systems that make the issue easy to clear.

### Explain Inference

If the system inferred something, say so.

Examples:

- "Seller inferred from related estimate."
- "KPI date moved to scheduled date because completion was late."
- "Preferred tech selected from customer's prior job."
- "Slot available because at least one zone tech is free."

Inference without explanation feels like magic. In operations software, magic becomes mistrust.

## Accessibility and Clickability

Readability is not only typography. It includes whether users can reliably activate controls, keep their place, and recover from mistakes.

### Targets

Use at least 24 by 24 CSS pixels for pointer targets, with comfortable spacing. In Sunwave tools, aim higher:

- 44px height for primary buttons.
- 36px minimum for icon buttons.
- Whole-row click targets for inspectable rows.
- Large drag zones, not tiny handles.

### Focus

Keyboard focus must be visible and not hidden behind sticky headers, footers, drawers, or overlays.

Use focus management for:

- Drawers.
- Modals.
- Bottom sheets.
- Custom dropdowns.
- Step transitions.

When a drawer closes, return focus to the row or button that opened it.

### Scroll

Never leave the page scroll-locked unless a modal/drawer is actually open.

Avoid:

- Stale `overflow: hidden`.
- Invisible fixed overlays with active pointer events.
- Iframes with internal scroll when the parent should scroll.
- Sticky footers covering focused controls.

For embedded pages, make the iframe height match content or forward wheel events to the parent page.

### Status and Errors

Errors should be:

- Near the field/action that caused them.
- Plain-language.
- Specific.
- Recoverable.

Good:

"Enter a service address before choosing a time."

Weak:

"Invalid input."

## Patterns By Sunwave Surface

### Technician Leaderboard

Primary information:

- Period.
- Total value created.
- Average ticket.
- Total jobs.
- Leaderboard rows.
- Unpaid values.

Secondary information:

- Data warnings.
- Reconciliation coverage.
- Unattributed jobs.
- Issue reporting.

Details:

- Job modal/drawer.
- Split-credit explanation.
- Paid/unpaid detail.
- HCP source.

Design guidance:

- Keep the leaderboard clean and comparable.
- Keep issue reporting in the user's eyeline.
- Use unpaid coral, not harsh red.
- Show warnings only when they affect trust.
- Make rows tappable on mobile.

### Admin Verify

Primary information:

- Current period.
- Open queue count.
- Verified progress.
- Filter pills.
- Job cards.

Secondary information:

- Confidence score.
- Flags.
- Status.
- Quick approve.

Details:

- Drawer summary.
- HCP context.
- Event timeline.
- Payments/invoices.
- Editable reconciliation fields.

Design guidance:

- The user is clearing a queue, so preserve momentum.
- Whole job card opens.
- Drawer has next/previous.
- Primary action stays in footer.
- Deferred jobs move predictably.
- Verified/excluded states remain inspectable.

### Paid Jobs Audit

Primary information:

- Verdict.
- HCP truth.
- Dashboard total.
- Drift.
- Missing count.
- Excluded count.

Secondary information:

- Bucket summaries.
- Reason pills.
- Cache age.

Details:

- Invoice numbers.
- Job IDs.
- Paid timestamps.
- Reason objects.
- Raw diagnostic explanation.

Design guidance:

- This is an audit screen, so proof can be closer to the surface.
- The verdict should come before the buckets.
- Missing money should be visually distinct but calm.
- Empty buckets should reassure.

### Owner/Financial Dashboard

Primary information:

- Period.
- Revenue.
- COGS.
- Overhead.
- Profit.
- Cash.

Secondary information:

- Ratio trends.
- Prior period comparison.
- Donut categories.
- Revenue/cash trend.

Details:

- P&L line items.
- QBO report context.
- Category drill-down.
- Education cards.

Design guidance:

- Tell the financial story in order.
- Use formulas and relationships, not isolated numbers.
- Let charts answer one question each.
- Teach concepts only where they help interpret the current data.

### Public Scheduler

Primary information:

- Current step.
- Current question.
- Selected service/address/time.
- Continue/submit action.

Secondary information:

- Helpful examples.
- Availability messages.
- Service-area notices.
- Property-type notes.

Details:

- Full service descriptions.
- Address suggestions.
- Booking recap.

Design guidance:

- One decision per step.
- Do not ask for contact info too early.
- Collapse completed context into summary chips.
- Use friendly language, not internal scheduling terms.
- Make disabled states explain themselves.

### Scheduler Admin Dashboard

Primary information:

- System health.
- Current location.
- Setup checklist.
- Global vs location scope.
- Save state.

Secondary information:

- Connection hub.
- Service area summary.
- Bookable tech count.
- Schedule settings.

Details:

- API keys.
- Employee/service lists.
- Diagnostic outputs.
- Custom service forms.

Design guidance:

- Scope must be unmistakable: global vs location.
- Health checks should be action-oriented.
- Settings should be grouped by operational mental model, not database model.
- Save bars should be sticky and stateful.

## Decision Checklist Before Shipping A Screen

Use this checklist before considering any information-heavy Sunwave screen done.

1. Can a first-time user identify the screen's purpose within 5 seconds?
2. Is the primary answer visible without scrolling?
3. Is the current period/location/scope visible?
4. Are money values labeled by source and meaning?
5. Are exceptions visible without overwhelming the happy path?
6. Does every warning explain what to do next?
7. Does every repeated row have a stable grammar?
8. Are details available without crowding the default state?
9. Are clickable regions obvious and large?
10. Does keyboard focus remain visible?
11. Does closing a drawer/modal return the user to their place?
12. Are loading states structural instead of just spinners?
13. Are empty states meaningful?
14. Are status messages announced or visibly placed?
15. Could a user explain why the interface showed this result?

## AI Implementation Prompt

When asking an AI model to design or revise a Sunwave screen, use this condensed instruction:

Design the screen using Sunwave information hierarchy. First identify the user's primary question, the safest next action, and the information needed to trust that action. Show the primary answer first, then confidence/state, then exceptions, then supporting proof behind a drawer/details layer. Use clear labels, tabular numerals, whole-row click targets, visible focus, meaningful empty states, and Sunwave colors. Do not show every available field just because it exists. Display only what helps the user decide, compare, act, or trust the result.

## The Standard

A Sunwave information screen is successful when:

- It is calm without hiding risk.
- It is dense only where the task requires density.
- It makes money, time, identity, and confidence obvious.
- It lets users move quickly while still offering proof.
- It turns messy HCP/QBO/booking data into a clear operational story.

The best Sunwave screens should feel like a very competent operations manager: concise, honest, organized, calm under pressure, and always ready to show the receipt.
