# Multi-level curriculum release

## Deploy an existing installation

1. In the **same Supabase project used by the app**, run `supabase/migrations/20261101180000_expanded_curriculum.sql` in SQL Editor. Apply earlier missing migrations first; do not rerun the original schema migrations.
2. Confirm the result:

   ```sql
   select revision,
     jsonb_array_length(data->'vocabulary') as vocabulary_entries,
     jsonb_array_length(data->'activities') as activity_revisions
   from public.platform_catalog;
   ```

   An unmodified catalog has 5,000 vocabulary entries and 37 activity revisions (25 lessons, 12 exercises). An edited catalog can have more entries/revisions. Existing deployments advance their catalog revision once.
3. Deploy the frontend through the usual GitHub/Netlify flow. Apply the migration **before** deploying: the content gate requires all shipped activity revisions to exist on the server.
4. Check all four course paths, difficulty filters, level-specific free practice, an older completed lesson and Admin vocabulary editing. Rebuild/sync Android after the web build.

The migration appends 4,850 words, 28 activities, 18 grammar topics and nine sentence exercises. It retains original word IDs, all answer banks, editor changes, archived entries, custom content, accounts and profile settings. Device progress and backup/storage versions do not change. A provider ID that has been reassigned to different Chinese characters causes a transactional rollback for manual review. Reapplying the expansion does not duplicate entries or advance the revision when nothing changes.

The collection ceiling increases from 5,000 to 12,000 so Admin can continue adding vocabulary. Existing RPC permissions, payload limits, revision checks and validation remain enforced. Set-based validation handles the larger vocabulary without invoking the former per-word procedural validation loop.

## Content and level mapping

| App path | Source vocabulary | Words | Lessons | Independent exercises |
| --- | --- | ---: | ---: | ---: |
| Beginner — First connections | HSK 2.0 level 1 | 150 | 7 | 3 |
| Elementary — Everyday journeys | HSK 2.0 level 2 | 150 | 6 | 3 |
| Intermediate — Connected conversations | HSK 2.0 levels 3–4 | 900 | 6 | 3 |
| Advanced — Ideas and viewpoints | HSK 2.0 levels 5–6 | 3,800 | 6 | 3 |

Paths start independently. Lessons unlock prerequisites only within their path; the original Beginner answer banks and dependencies remain intact. Each path has gentle, balanced and challenging lessons. Difficulty is relative to the selected level: a gentle Advanced lesson still uses advanced language. The 32 grammar topics and 19 sentence-building exercises use the existing generic runner. These are curated demonstration courses, not complete coverage of 5,000 dictionary entries or a certified proficiency syllabus.

The profile's level supplies the initial path/free-practice level. Course and vocabulary selections are encoded in hash URL query parameters, so reloads preserve them. Admin-created lessons join their level's path through existing metadata; no new lesson-ID switch statements are required.

## Sources, assets and maintenance

Vocabulary is the public [HearMandarin dataset](https://hearmandarin.com/datasets/) snapshot version `2026-09-09`, generated `2026-09-28`, licensed CC BY 4.0, selected using `hsk2_level` 1–6. Provider IDs preserve homographs and separate readings. English definitions and pinyin remain attributed to their source. New teaching examples, grammar explanations and answer keys are original app content and need lecturer review before a formal teaching study. Topic classification for higher-level words uses keyword hints after explicit assignments; it is not a reviewed linguistic taxonomy.

The 293 bundled writing templates cover beginner and activity-linked vocabulary. Other characters load on demand from the existing pinned Hanzi Writer Data `2.0.1` CDN and require network access. MIT and Arphic notices remain in `public/licenses/`. The character picker renders 80 results initially, supports search and loads further batches; admin reference pickers show selected items and up to 60 search results.

```sh
npm run data:import
npm run content:prepare
npm run content:check
npm test
npm run test:browser
npm run lint
npm run build
```

`scripts/build-curriculum-migration.ts` reproduces **this release's** additive SQL from the original platform-admin seed and the checked-in catalog:

```sh
node --experimental-strip-types scripts/build-curriculum-migration.ts
```

Do not regenerate an already deployed migration for later releases. Create a new migration with a new timestamp and retain the historical answer banks.
