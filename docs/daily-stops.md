# Today's stops

Home has one main entry into a daily route, with free practice, themed exercises and a short progress overview alongside it. Opening the route creates its first section if needed. Direct navigation to `#/today` offers a Plan button. The route is available to signed-in, onboarded accounts only.

A section has up to three concrete stops:

- Word review: words at the account’s language level, prioritizing the latest failed self-assessments, scheduled reviews and unseen words. Learning goals rank otherwise comparable items.
- Skill practice: a preferred, less recently practised mode. Speaking, character writing or sentence building reuse the existing practice screens. Difficult and unpractised items come first. Writing selects unique single-character vocabulary so one completed character represents one target.
- Learning: continue an unfinished unlocked lesson, then the next unfinished lesson in course order. Once matching lessons are complete, recommend an exercise using level, difficulty and learning goals. Course prerequisites remain mandatory. If the next course lesson has a different difficulty, course order takes precedence over the difficulty preference.

Sections include only available content; small catalogs can produce fewer targets/stops. They are selected when planned and remain stable across reloads. The practice screens show only the remaining targets when resumed. A completed stop stays visible with its final feedback until the learner returns to the route.

## Completion and continuation

Completion is derived from the existing attempt/session histories, not a second grading system. Each distinct target item counts once in the requested mode. A finished lesson or exercise review completes the learning stop. Matching work elsewhere in the app or imported from a backup also counts if done after the section was planned and before its local-midnight expiry.

Wrong answers, typed speaking answers and guided practice count as participation. Independent accuracy, assessment results and spaced repetition keep their existing rules. Speaking compares text; this feature adds no acoustic pronunciation or tone assessment. Course prerequisites still require the normal passing result.

After completing a section, the learner can stop or choose **Plan next stops**. New sections use the latest results. Correct words scheduled for a later review give way to unseen/due words; failed words can return. Past attempts and finished sessions cannot instantly complete the next section, including records already present at its creation timestamp. A new local day offers a fresh route, while retaining previous plans and all learning history.

Changed preferences or unavailable catalog content offer **Build a fresh route** without deleting the earlier section. No unfinished section is silently replaced.

## Route length and compatibility

Settings/onboarding offer Short, Regular and Extended routes: up to 3/5/7 review words and 1/3/5 skill items, plus one learning activity. The actual workload also depends on available content and the selected activity’s question count.

The existing Supabase `daily_goal` field is retained. Values 1–5 map to Short, 6–15 to Regular and 16–100 to Extended. Choosing a new pace writes 5, 10 or 20 through the existing profile RPC. Old custom values are preserved until the selection changes. No new database migration is needed.

Route snapshots are optional `dailyRoutes` entries inside the existing version-1 per-account study record, using the same browser/Android persistence and JSON backup flow. Imports validate dates, IDs, target types and bounds; overlapping snapshots merge by ID, while conflicting plans are rejected. Missing or archived content does not invalidate an old backup, but cannot be started. Account-owned profile settings remain authoritative after import. Routes/results remain local to the account on this device until exported; this adds no server synchronization.

Completed lesson/exercise sessions now contribute to the learning-day streak alongside practice attempts. Attempt counts and independent percentages retain their previous definitions.
