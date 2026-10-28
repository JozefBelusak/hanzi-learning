# Set up accounts and roles

Hanzi uses Supabase Auth for email/password accounts and PostgreSQL Row Level Security (RLS) for permissions. There is no development login bypass and no password database in the frontend. Until the project and public client settings are configured, the welcome page is available but learning stays locked.

## 1. Create the Supabase project

Create a project at [Supabase](https://supabase.com/dashboard). Wait for its database and Auth service to finish provisioning.

From the project's Connect dialog or Settings → API/API Keys, copy the **Project URL** and **publishable key**. A legacy **anon** key also works. These two values identify the project and can be included in a browser application; permissions are enforced by Auth, grants and RLS.

Never put a secret key, service_role key or database password in a `VITE_` variable. Vite includes those variables in the browser build. The Vite configuration rejects known Supabase secret/service_role keys before serving or building the app.

## 2. Install the database schema

In the Supabase SQL Editor, run the complete contents of:

`supabase/migrations/20261028090000_auth_and_roles.sql`

Run it once on the new project. This installs profiles, roles, authored lessons, classrooms, memberships, signup triggers and permission policies. Existing Auth users are backfilled as Students. The `private` schema must stay outside the Data API's exposed schemas; expose `public` only for these application tables/functions.

You can check that all application tables have RLS enabled:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('profiles', 'public_lessons', 'classrooms', 'classroom_members');
```

All four rows must report `rowsecurity = true`. The migration grants no anonymous access to these tables. [Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security).

For subsequent changes, add a new migration instead of editing a migration already applied to your project. With the Supabase CLI, the alternative deployment is `supabase link --project-ref YOUR_PROJECT_REF` followed by `supabase db push`.

## 3. Configure email/password authentication

In Authentication, enable the Email provider, allow new signups and keep **Confirm email** enabled. Set the minimum password length to **12**, matching the registration form and local config.

Set **Site URL** to the HTTPS address of the deployed Hanzi app. During initial local development, you can use `http://localhost:5173/`.

Add the exact application root URLs to the allowed Redirect URLs, for example:

- `http://localhost:5173/`
- `http://127.0.0.1:5173/`
- `https://YOUR-SITE.netlify.app/`

Registration sends a confirmation link. Confirm the email and then sign in. PKCE protects the confirmation flow; if the email link opens on another browser/device, sign in manually after confirmation. On Android, confirmation uses the configured web Site URL, then the user can return to the app and sign in. Automatic native deep-link sign-in is not implemented.

For registration by real students, configure your own SMTP sender in Supabase Auth; the default email sender is intended for testing and restricts recipients/delivery. Password handling and Auth rate limits are provided by Supabase. See [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [password settings](https://supabase.com/docs/guides/auth/password-security) and [email delivery](https://supabase.com/docs/guides/auth/auth-smtp).

## 4. Configure the application

Copy `.env.example` to `.env.local` in the app repository and fill in:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY
```

`.env.local` is ignored by Git. Then run:

```sh
npm ci
npm run dev
```

Restart Vite after changing environment variables.

For Netlify, set the same two variables in the site's **build environment**, then rebuild/redeploy. The existing `netlify.toml` remains valid; this integration does not need Netlify Functions. For Android, set the variables before `npm run android:sync`, then rebuild the app in Android Studio.

## 5. Create the first administrator

Register your own account in Hanzi, confirm its email and sign in once. It starts as a Student; neither signup metadata nor being the first registrant grants administration.

In the Supabase SQL Editor, run the following as the project owner, replacing the email:

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'YOUR_CONFIRMED_EMAIL')
returning id, email, role;
```

Verify that exactly one row is returned. Refresh Hanzi or sign out and back in, then open **Administration**. From now on, use its Users and roles section to promote registered accounts to Lecturer or Admin. The application prevents demoting the last administrator.

## 6. Verify the flows

1. Open a private browser window and visit `/#/course` or a practice link. It must redirect to Sign in without showing learning content.
2. Register/confirm a Student. A normal login opens Home; a login requested from a protected learning URL returns there.
3. As Admin, promote another registered account to Lecturer. A fresh lecturer login opens the Lecturer workspace. Student visits to `/#/teach` or `/#/admin` return to Home.
4. As Lecturer, create a lesson, save a draft, publish it, then check it from a Student's Public lessons list. Drafts stay private to their author and Admin. Authored content is plain text, including Chinese examples and paragraph breaks.
5. Create a classroom and share its invitation code. A Student joins through Your classrooms; the lecturer can view and remove that enrollment. Lecturers cannot browse unrelated student profiles or manage other lecturers' classrooms.
6. Sign out and use Back/reload/direct links. Learning stays locked. Sign in as a different Student on the same device; the first user's learning progress must not appear.

Published means visible to **signed-in users**. The built-in starter course remains versioned in `src/data/learning.ts`; the management interface creates and manages additional database lessons. It does not edit the starter tram map or its quiz answer keys.

## Access rules and data storage

| Capability | Student | Lecturer | Admin |
| --- | --- | --- | --- |
| Course, exercises and free practice | Yes | Yes | Yes |
| Read published database lessons | Yes | Yes | Yes |
| Join/leave a classroom | Own enrollment | — | — |
| Create/edit/delete authored lessons | No | Own lessons | All lessons |
| Manage classrooms and student rosters | No | Own classrooms | All classrooms |
| Read account profiles | Own | Own + enrolled students | All |
| Assign account roles | No | No | Yes |

Roles come from `public.profiles`, not user-editable signup/JWT metadata. Database policies check the current stored role and whether the signed JWT's `session_id` still exists in `auth.sessions`. Removing a session therefore denies database access even before that token's normal expiration. The frontend also verifies the token with Auth and loads the profile before mounting learning screens. Role changes are rechecked on focus, authentication events and page reload; the database applies them on each request. [Supabase session documentation](https://supabase.com/docs/guides/auth/sessions).

Session tokens use the official SDK's refresh lifecycle and are persisted in browser storage or Capacitor Preferences. Sign out ends the current session. Progress still lives **on the device**, now under a key specific to the verified account ID; automatic cloud progress synchronization and lecturer access to learning scores are not implemented. Settings retains JSON backups and provides an explicit import of progress saved before accounts existed. Account separation in the app does not encrypt device storage against someone who controls that device.

Profiles, authored lessons and classroom data are stored in Supabase. A verified session/connection is required when opening the learning app. Bundled JavaScript, vocabulary and starter course assets are public build files; authentication protects application use and database operations, not the secrecy of static assets.

## Automated verification

```sh
npm test
npm run test:browser
npm run lint
npm run build
```

`server-tests/authorization.test.ts` executes the production migration in PGlite PostgreSQL, with representative `auth.users`, `auth.sessions` and JWT helper functions. It actually switches to `anon`/`authenticated` database roles and checks allowed and denied queries, ownership, revoked sessions and role escalation. PGlite is a development-only dependency.

Browser tests use the real Supabase client with intercepted network responses, including signup confirmation, failed login, session restoration, role redirects, logout, publishing, enrollment and account isolation. They use port 5180 and test-only environment settings; no login bypass is shipped. These tests do not replace a live Supabase/email/Android smoke test after configuration.

For a complete local Supabase stack, install Docker and the Supabase CLI, then use `supabase start` and `supabase db reset`. The checked-in config enables confirmation and 12-character passwords. Use the local service's public client key in `.env.local`; local confirmation emails can be opened through its test email service.
