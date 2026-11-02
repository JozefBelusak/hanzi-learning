# Guest preview

**Browse as guest** is available on the welcome, sign-in and registration screens. It opens explicit hash routes such as `#/guest/home`, `#/guest/course?level=all` and `#/guest/course/lesson-tones`.

Guests can browse course paths, filter the exercise catalog, read lesson notes/grammar/examples, listen to example audio through the existing device voice and preview vocabulary by topic/level. Flashcards, speaking, writing and sentence practice show descriptions and a static sample, with a sign-in action. Progress/profile pages explain their account requirements. Guests cannot start questions, record answers, request the microphone or run character-writing assessments.

The guest workspace is separate from `AuthenticatedApp`. It never mounts `useStudy`, reads account/legacy progress, writes attempts or creates a Supabase user/profile. The lesson runner's preview contract accepts no saved sessions or save callback. Leaving guest mode records only the requested destination in session storage, so successful sign-in can return there. New users still confirm their email and complete mandatory onboarding.

Guest content uses the bundled public catalog. It does not call the signed-in catalog RPC, access lecturer lessons/classrooms or expose administrator workspaces. On entry it resets the in-memory catalog to the bundled seed before rendering previews, so signing out does not reveal an account's server-loaded content. Admin changes appear in the signed-in catalog; the bundled preview changes with a new frontend build.

Ordinary protected URLs, such as `#/practice/food/speech`, still require authentication. Adding a `/guest/` prefix to an admin, lecturer, classroom or public-lesson URL does not make it accessible. PostgreSQL roles, grants, RLS and RPC authorization are unchanged; Guest is a browsing state, not a database role. No migration is required for this feature.

Verification covers guest navigation/reload, absence of progress-storage reads/writes and account-only API calls, all four blocked practice modes, protected URLs, return after login, registration/onboarding, account isolation after logout and responsive layouts.
