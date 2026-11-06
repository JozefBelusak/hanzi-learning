# Learning personalization

## Catalog preferences

`profileContentFilter` supplies the verified account's language level and difficulty. Course, Exercises and Public lessons use the same `resolveContentFilter` and existing `ContentFilters` component. Each catalog supports explicit `level` and `difficulty` hash-query overrides. An omitted parameter means the current profile preference; `all` means an intentional removal of that filter. Old URLs remain valid.

Selecting filters does not write profile preferences. **Clear filters** removes both restrictions; **Use profile preferences** selects the current saved values again. Changing preferences in Settings updates the defaults for catalogs opened without overrides. Published lesson detail links and existing course sessions remain accessible irrespective of filters; preferences never grant additional access or bypass prerequisites.

The course overview counts the lessons matching the selected difficulty in each path. If filtering leaves only locked stops, a notice offers **Show all difficulties** so the learner can reach prerequisite lessons. Missing matches in Exercises and Public lessons have explicit ways to see all content. Guest previews use all levels/difficulties by default and do not load account preferences or progress.

## Goal recommendations

The **Explore more recommendations for your goals** panel inside Today’s stops reuses the current published platform catalog and the already loaded vocabulary. It recommends up to three grammar topics, words and exercises. Grammar and exercise candidates must match both profile level and difficulty. Vocabulary matches language level: imported dictionary entries currently have a neutral `balanced` value, not a pedagogically validated difficulty classification, so gentle/challenging preferences do not remove all dictionary words.

`src/lib/recommendations.ts` defines small editorial rules for conversation, travel, work, study/exams and culture. An English topic/meaning keyword match scores eight points per selected goal; a related existing vocabulary/activity category scores two. Grammar also receives the highest related-activity score for each goal through its existing grammar references. Selected goals combine additively and duplicate goals are ignored. Ties retain catalog order. Recommendations display the matching goal names; candidates with no direct match are labelled **At your language level**. If no candidate matches the level/difficulty, the panel reports this rather than silently changing the preferences.

These are deterministic content recommendations, not AI inference, a placement test or a claim of improved learning outcomes. New administrator-published content participates through existing text, categories and references, without hard-coded lesson IDs. Archived words/grammar and unpublished activities are excluded. Lecturer reading lessons remain a separate catalog and retain their existing publication/ownership checks.

Grammar explanations and Chinese examples expand inline. Exercise buttons open the existing runner; vocabulary buttons open practice-mode selection for the recommended word's topic and the profile level. The daily route’s course continuation still follows prerequisites at the profile level, even when the necessary prerequisite has a different difficulty.

## Data preservation and verification

No database migration, content revision, identifier or progress format changes are required. Filters and recommendations do not mutate attempts, spaced-review records, question banks or learning sessions. Profile edits use the existing Supabase RPC and all assessment rules remain unchanged.

Unit tests cover profile defaults, independent/all overrides, all three catalog URL round-trips, ranking for each goal, combined goals, archive filtering, current-catalog additions and the vocabulary difficulty convention. Browser tests cover defaults, clearing/restoring filters, reload/detail Back, empty catalogs, hidden prerequisites, changed recommendations after a profile edit, mobile/keyboard use, and preservation of an actual flashcard review and partially answered course session when level/difficulty change.

Browser authentication/data responses are mocked; database authorization tests run separately against PostgreSQL in PGlite. Live Supabase delivery, email and physical Android testing remain separate checks.
