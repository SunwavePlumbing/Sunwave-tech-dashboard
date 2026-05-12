/* ════════════════════════════════════════════════════════════════════
   Sunwave dashboard greetings — pure data file.

   The dashboard shows a time-of-day greeting at the top of the page.
   This file holds nothing but the phrase pools, so you can scan and
   edit greetings without touching any logic. Rotation, day-of-week
   templating, hour dispatch — all of that lives in app.js.

   How it works at a glance:
     • POOLS is keyed by hour (h00–h23, 24h clock).
     • DAY_LINES is keyed by lowercase weekday and only fires on
       its matching day (concatenated to the hourly pool).
     • Any phrase can use {Day} as a placeholder — it gets
       replaced with the current weekday name at display time
       (Monday, Tuesday, …, Sunday).
     • Rotation is stable for a full week, then advances. Bigger
       pools = longer time before a phrase repeats. There's no
       upper limit; add as many lines as you want.

   Editing tips:
     • Cut a line — just delete the row. Trailing commas inside
       the array are forgiven by JS.
     • Add a line — paste a new string inside the array. Use
       single quotes; if your phrase has an apostrophe, switch
       the wrapping to double quotes for that one entry.
     • Don't add em-dashes ( — ) — the house voice avoids them.
     • Punctuation, capitalization, and tone should match the
       neighbors in the same hour. Pull the page open in a
       browser and reload across a few days to see the feel.
   ════════════════════════════════════════════════════════════════════ */

window.GREETING_POOLS = {

  // ──────────────────────────────────────────────────────────────────
  //  DAYTIME — energetic, celebrates the wins on the board
  // ──────────────────────────────────────────────────────────────────

  // 5am — pre-dawn / first crew in
  h05: [
    "Up early. {Day}'s about to be a big one",
    'Quiet yard. Loud {Day} coming',
    "Coffee on. {Day} is ours",
    'First in. Set the pace',
    'Up before the kettle',
    'Hi, early one',
    'Headlamps and coffee',
    'Big {Day} brewing'
  ],

  // 6am — sunrise, trucks warming
  h06: [
    "Sun's up. {Day} is officially on",
    'Trucks warming. {Day} is loading',
    'Coffee in hand, {Day} in sight',
    'Sunrise crew, ready to roll',
    'Big {Day} on the schedule',
    "Mornin', let's run it",
    "Yard's lit. {Day} is starting"
  ],

  // 7am — first dispatch out the door
  h07: [
    'Trucks out. {Day} is in motion',
    "First call landed. Let's go",
    'Out making {Day} happen',
    'Crew on the move. Phones lighting up',
    'Trucks rolling, {Day} earning',
    "Mornin', crew. Big {Day} ahead",
    "Coffee's on, {Day}'s on"
  ],

  // 8am — full morning, first service calls landing
  h08: [
    'Wrenches turning. {Day} earning',
    'Service calls hot. {Day} is real',
    'First wins of {Day} landing',
    "Hot start. Let's keep it",
    'Eight houses already glad you came',
    'Good morning, and happy {Day}',
    "Crew's already crushing",
    'Real work, real numbers'
  ],

  // 9am — mid-morning hustle, board starting to fill
  h09: [
    'Strong morning. Numbers climbing',
    'Trucks all on a call. {Day} is humming',
    'Look at {Day} go',
    'Solid pace. {Day} is fat already',
    'Big morning building',
    'Mid-morning, full speed',
    'Every job, a chance to do it right',
    'Hot {Day} in progress'
  ],

  // 10am — flow state, real progress visible
  h10: [
    '{Day} is rolling. Look at the board',
    'Mid-morning crush',
    'Trucks deep in {Day}. Real progress',
    "We're cooking",
    'Houses being made whole, money being made',
    'Hot {Day} so far',
    'Specialists at work',
    'Big morning shaping up'
  ],

  // 11am — late-morning push
  h11: [
    'Morning crushed. Keep stacking',
    'Strong half-shift behind you',
    "{Day}'s board is filling up",
    'Big morning. Real wins',
    '{Day} is winning',
    'One more strong call',
    'Last morning call. Stack it'
  ],

  // 12pm — midday
  h12: [
    'Big morning. Keep it moving',
    'Midday push. Stack the next win',
    'Look at the board. Then build on it',
    '{Day} is strong so far',
    'Midpoint, {Day}. Feeling good',
    'Middle of the day, numbers climbing',
    'Momentum earned',
    'Hot {Day}, strong board'
  ],

  // 1pm — second half kickoff
  h13: [
    'Back at it. Big afternoon coming',
    "Second half. Let's stack more",
    'Trucks rolling, {Day} climbing',
    'Afternoon push. Numbers go up',
    'Reset and rolling',
    'Still rolling',
    'Half a {Day} done, half to win'
  ],

  // 2pm — afternoon push, board getting fat
  h14: [
    "Two o'clock and {Day} is looking fat",
    'Afternoon hot. Keep rolling',
    'Numbers climbing. Trucks moving',
    "Good {Day}. Let's make it great",
    "We're getting paid out here",
    'Good afternoon, and happy {Day}',
    'Trucks back in motion. {Day} climbing',
    'Strong run, strong {Day}'
  ],

  // 3pm — second wind, home stretch in sight
  h15: [
    "Three o'clock. Big {Day} taking shape",
    'Home stretch. Numbers looking good',
    "Strong {Day}. Let's finish it",
    "Look at the board. We're winning",
    'Final third. Push it',
    '{Day} is real money now',
    'Coffee three? Earned',
    'Hope {Day} is treating you right'
  ],

  // 4pm — late afternoon, last calls trickling in
  h16: [
    'Last hour. {Day} is in the bag',
    'Strong {Day}. Wrap it up right',
    'Look at what {Day} added up to',
    'Heading home with real numbers',
    '{Day} got big',
    'Last calls. Final wins of {Day}',
    'Stacking the last of {Day}'
  ],

  // 5pm — clock-out, tools back in the truck
  h17: [
    "Five o'clock. Look at {Day}",
    'Trucks home. {Day} earned',
    'Big {Day}. Well done',
    'Numbers in the books. Strong work',
    'Hat off. {Day} is yours',
    '{Day} was strong. Be proud',
    'Closing out big',
    'Hope {Day} treated you right'
  ],

  // 6pm — evening, books closing
  h18: [
    'Evening. {Day} got done. Big numbers',
    'Books closed. {Day} was real',
    'Look at what we did today',
    'Great {Day}. Trucks home, money in',
    'Dinner earned. {Day} earned',
    'Good evening, and happy {Day}',
    '{Day} is in the books, and it was a good one',
    'Trucks parked, customers happy'
  ],

  // ──────────────────────────────────────────────────────────────────
  //  NIGHTTIME — quieter, gentle nudge toward rest
  // ──────────────────────────────────────────────────────────────────

  // 7pm — late check-ins, "you're still here?"
  h19: [
    "Woah, you're checking this late?",
    'Past business hours, huh?',
    "Hope dinner's calling",
    'Evening, still here?',
    "Hope you're heading home soon"
  ],

  // 8pm — wind-down hour
  h20: [
    "Hope you're winding down",
    "Hope dinner's done",
    'Books still here, no rush',
    'Easy night ahead?',
    'Books quiet, you should be too'
  ],

  // 9pm — couch time
  h21: [
    "Hope tomorrow's ticket is a good one",
    'Save some work for tomorrow',
    'Books will keep till morning',
    "Tomorrow's customers don't know you yet",
    'Couch time'
  ],

  // 10pm — getting late
  h22: [
    'Pretty late to be checking the books',
    "Nothing here can't wait till morning",
    'Books look better with fresh eyes',
    "Get the rest before tomorrow's first call"
  ],

  // 11pm — last call before midnight
  h23: [
    'Almost tomorrow',
    "Drains don't sleep, but you should",
    'Last call, get some rest',
    "Don't audit yourself at eleven"
  ],

  // Midnight — gently insistent
  h00: [
    'Past midnight, go get some rest',
    'Tomorrow is a workday too',
    'The KPIs will still be here in the morning',
    "Sunwave can wait. You can't"
  ],

  // 1am — concerned
  h01: [
    "The leaderboard isn't going anywhere",
    'Still up?',
    'The dashboard can wait',
    'Sleep is also a KPI',
    "Whatever it is, morning's better"
  ],

  // 2am — definitely too late
  h02: [
    'Up real late on a {Day}',
    'Even Sunwave needs sleep',
    'Two a.m. Are the books really worth this?'
  ],

  // 3am — concerned with humor
  h03: [
    'Are you okay?',
    'Either up late or up very early. Either way, hi',
    "Whatever you're chasing, it can wait",
    'Three a.m. is for sleeping or for plumbing emergencies'
  ],

  // 4am — early bird OR didn't sleep
  h04: [
    "Early start? Or didn't sleep?",
    "Coffee's on you this morning",
    'First one in',
    'Whatever brought you here, hi'
  ]
};


/* ────────────────────────────────────────────────────────────────────
   DAY_LINES — bonus phrases that ONLY fire on their weekday.

   These get appended to whatever hourly pool is active, so a Monday
   8am visit sees both the h08 lines AND the monday lines in the
   rotation. Other days don't see Monday's lines at all.

   Keys are lowercase weekday names. Add or remove freely.
   ──────────────────────────────────────────────────────────────────── */

window.GREETING_DAY_LINES = {

  monday: [
    "Fresh week. Let's make it count",
    'Monday. New week, new wins',
    "Monday's the launch pad",
    'Big week ahead. Trucks ready'
  ],

  tuesday: [
    'Tuesday: where real numbers happen',
    'Tuesday rolling. Workhorse day',
    'Hot Tuesday in the making'
  ],

  wednesday: [
    'Wednesday. Halfway and crushing',
    'Midweek momentum',
    'Wednesday: prime work day',
    "Hump day. We're winning"
  ],

  thursday: [
    "Thursday push. Friday's earned",
    'Thursday: home stretch of the week',
    'Almost Friday. Stack the wins'
  ],

  friday: [
    "Friday. Let's send it",
    'Last big push of the week',
    'End-of-week wins coming',
    'Friday at Sunwave. Strong finish',
    'Cap the week off big'
  ],

  saturday: [
    'Saturday crew. Hero work',
    'Weekend hustle. Real money',
    'Saturday calls pay double in gratitude'
  ],

  sunday: [
    'Sunday quiet. Rare check-in',
    'Sunday: rest earned',
    'Sunday at Sunwave. Easy gear'
  ]
};
