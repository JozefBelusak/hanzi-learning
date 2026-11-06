# Learning profile setup

## Upgrade an existing Supabase project

1. Open the project's SQL Editor.
2. Run the entire `supabase/migrations/20261101090000_learning_profiles.sql` file once, after the original auth/roles migration. Do not rerun the original migration.
3. Deploy the updated frontend. No new environment variables or API keys are needed.
4. Sign in. Existing and new accounts, including Lecturer and Admin, go to profile setup until they save their preferences.

The migration retains existing accounts, published lessons, classrooms and device progress. It deliberately does not invent completion or learning preferences for existing users. It is verified against PostgreSQL using both migrations; applying it to the hosted project still requires the project owner's SQL Editor/CLI access.

## Stored fields

`public.profiles` stores the display name, self-reported Chinese level (beginner/elementary/intermediate/advanced), preferred difficulty (gentle/balanced/challenging), selected practice modes, learning goals, the legacy `daily_goal` value (1–100) now mapped to Short, Regular or Extended daily routes, and `onboarding_completed_at`.

The database creates the profile during signup. The `save_learning_profile` RPC accepts no target account or role; it always updates the current verified account. The database validates the whole profile, rejects unknown/empty selections, normalizes duplicate choices and sets completion in the same transaction. Failed requests never grant access or show a successful save. The RPC preserves the original completion time on later edits. Existing database-owned role permissions remain in force.

## App behaviour

- Registration still requires email confirmation. Profile setup begins at the first verified session; there is no unauthenticated profile write.
- An incomplete profile is sent to `/#/onboarding` on login, reload or a protected deep link. No learning workspace is mounted until completion. Signing out is available from setup.
- After saving, the app restores an allowed protected destination, or opens the role's default workspace. A completed account opening onboarding is returned to its workspace.
- Settings uses the same editable form; equivalent session/focus refreshes preserve unsaved edits. Saves persist in Supabase and follow the account on another device.
- Home opens personalized Today’s stops; Progress shows the profile and current route completion. Settings offers a daily route length. All practice modes remain available.
- The account's display name and route setting override device defaults and backup values. Import still merges learning history, without clearing attempts or review/session progress.
- Course, Exercises and public lecturer lessons default to both the profile's language level and difficulty. Filters can be changed independently, cleared together with **Clear filters**, or restored with **Use profile preferences**. Overrides (including explicit `all`) live in the hash query and survive reload and returning from a detail page; changing a filter never changes the saved account profile. A catalog opened without overrides uses the latest saved profile. Guest browsing continues to use unfiltered catalogs.
- Free-practice vocabulary follows the selected language level. Today’s stops also offers expandable grammar, vocabulary and exercise recommendations for the selected learning goals. See [personalization rules](personalization.md). Automatic placement and changes to assessment scoring are not implemented. Daily stops count matching practice and completed course/exercise reviews. Both contribute to the day streak. See [daily stops](daily-stops.md).

## Verification

Run `npm test`, `npm run test:browser`, `npm run lint` and `npm run build`. PostgreSQL tests cover migration of existing data, signup metadata forgery, owner-bound saves, validation, immutable completion timestamps and anonymous/revoked session denial. Browser tests cover signup, mandatory setup, role redirects, direct links/reload, failed saves, later editing, progress preservation and mobile/keyboard use.

After applying the migration to Supabase, verify registration/email confirmation and setup against that live project. Automated browser tests mock Supabase network responses; they are not a live email or Android device test.
