# Hanzi Learning

A React and TypeScript implementation for the thesis, running in the browser and on Android through Capacitor. The thesis text lives in `../tex/thesis`. The earlier HTML/JavaScript prototype is archived in `prototyp/`.

## Getting started

Install Node.js 22 or later and npm. Run these commands from this directory:

```sh
npm ci
npm run dev
```

Open `http://localhost:5173`. Python is not required. Browser microphone access requires localhost or HTTPS; plain HTTP from another device may not support it. The development server listens on this computer only by default.

Learning requires a signed-in account. Before using it, follow [the Supabase setup guide](docs/auth-setup.md): create the project, apply the database migration, configure email confirmation and copy `.env.example` to `.env.local`. Missing configuration keeps learning locked; there is no guest or demo authentication bypass.

```sh
npm run lint
npm test
npm run test:browser
npm run build
```

Browser tests use Microsoft Edge on Windows. On Linux/macOS, first install Chromium with `npx playwright install chromium`. The production web build is written to `dist`; use `npm run preview` to inspect it.

## Deploy to Netlify

Import the GitHub repository into Netlify and deploy its `main` branch. Leave the base directory empty: the application is at the repository root. `netlify.toml` sets the build command to `npm run build`, the publish directory to `dist`, and the Node.js version to 22. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the build environment and configure the production authentication redirect URL as described in [accounts setup](docs/auth-setup.md). Use the public publishable/anon key only.

After connecting the repository, pushes to the deployed GitHub branch trigger a new build. Share the HTTPS deployment URL for testing. Navigation uses hash URLs, so it does not require a server-side SPA rewrite. Vocabulary and stroke data are included in the build.

If Netlify creates the project as private, use **Make public** after the first successful production deploy so the supervisor can open the URL without a Netlify team login. Visibility is also available under Project configuration → General → Visitor access → Project visibility. Check the shared URL in a signed-out or private browser window.

Try speaking in a supported browser such as Chrome or Edge and allow microphone access. Recognition and Mandarin voices depend on browser/device support. Current speaking feedback checks the transcript; acoustic pronunciation and tone assessment are still planned. Progress is stored separately on each browser origin, so use Settings to export/import a backup when moving from localhost to the deployed site.

## Implemented features

- **Accounts and permissions:** confirmed-email registration, password sign-in, session restoration/refresh and sign-out. Students learn, lecturers publish lessons and manage their classrooms, administrators manage roles and authored content. Frontend route guards and PostgreSQL RLS enforce access; registration always creates a Student.
- **Public lessons and classrooms:** signed-in learners read published lecturer lessons and join classrooms through invitation codes. Lecturers manage their own drafts, published lessons and student enrollments; Admin can manage all of them. The original starter course remains versioned in code.
- **Course:** a six-stop starter course shown as a tram map. Read short explanations, listen to Mandarin examples and take a lesson review. Greetings and introductions lead to two parallel branches (family and food), then a combined checkpoint. Locked lessons can be previewed; passing a review unlocks the next stops.
- **Exercises:** three independent themed sessions covering introductions, family and a café. Each combines meaning/listening questions and sentence ordering in a workspace with instructions, a task and feedback. They are accessible without course completion.
- **Topics:** 150 HSK 2.0 level 1 words grouped into eight themes. Topic selection applies to flashcards, speaking and writing.
- **Flashcards:** practice in either direction, reveal answers, listen to synthesized pronunciation, rate recall and schedule reviews.
- **Speaking:** listen to a reference Chinese voice, record and replay your own voice, recognize Mandarin text and compare it with the expected word. Typed answers are a separate assisted mode.
- **Writing:** 174 individual vocabulary characters, stroke animation, hints, outline tracing and writing from memory. Hanzi Writer checks stroke shape, order and direction. Mouse, pen and touch input are supported.
- **Sentence building:** ten word-order examples with movable words, grammar explanations and hints. Examples are shared across topics.
- **Progress:** a shared history, daily goal, streak, points, seven-day chart, results by mode and JSON backup import/export.

All interface text, explanations and app-generated messages are in English, matching the dataset's English definitions. Chinese characters and pinyin remain in their original form. Speech recognition and synthesis use Mandarin (`zh-CN`).

## Navigation and layout

Home suggests the next course stop and offers separate entries to themed exercises and quick practice. **Course**, **Exercises** and **Practice** are separate navigation destinations. The course map has real keyboard-accessible station buttons and a vertical layout on mobile. Quick practice follows separate steps: **choose a topic → choose a mode → practise**. The Back button and browser history return to the preceding step. Hash URLs preserve the open screen when reloading.

Course lessons and themed exercises share a session runner: explanation and examples, an interactive choice or sentence-ordering task, and specific feedback. Answers are saved as they are checked, so unfinished reviews can resume after a reload. Hint use remains marked even when a hint is hidden. Reviews require at least 80% independent correct answers to pass; completion is kept when a user revisits a lesson. Optional speaking, writing and flashcard practice uses the activity's bundled vocabulary and returns to the originating lesson or exercise. This supplementary practice does not change the lesson review score.

Progress contains statistics and history. Settings contains the profile, daily goal, backups and vocabulary refresh. Primary navigation sits at the bottom on mobile. Exercise instructions and method explanations are collapsible to keep the task visible. The layout follows feedback on separating topic selection, practice modes and exercises.

Writing uses a **Choose character** button instead of a dropdown. It opens a scrollable card picker as a drawer on desktop and a bottom sheet on mobile. Search matches Chinese characters, source-word pinyin without tone accents, or English meanings within the selected topic. Cards show the source word because the same character can have different readings in different words. Keyboard focus stays in the picker and returns to its opener after closing; Escape also closes it.

The live writing brush is a smooth filled outline with a narrower entry, broader body and pointed release. The maximum size is 72 in Hanzi Writer's normalized character coordinates and scales with the canvas. A pen's reported pressure controls thickness; mouse and touch use a tapered profile. Input is resampled so event frequency does not determine the width. The renderer follows the actual gesture; Hanzi Writer grades the original points and then reveals the accepted reference stroke. Outline tracing, hints and animations still use the bundled character geometry. Changing characters resets the current exercise without saving an unfinished attempt.

Interface labels use normal sentence case. Exercise topics are selected with visible buttons instead of a dropdown, and exercise cards show their title, duration and saved result without repeated skill tags or decorative arrows.

## Vocabulary and sources

Words and pinyin come from the public [HearMandarin dataset](https://hearmandarin.com/datasets/) under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Definitions retain the source's English wording. The source does not include audio recordings; playback uses the device's synthesized voice. Topic grouping and demo sentences are authored for this application.

`src/data/vocabulary-hsk1.json` contains an imported subset and source metadata. It is bundled, so the first launch does not need to download the vocabulary. **Refresh vocabulary** in Settings downloads and validates the current public dataset, then stores only the starter subset. Refresh can update pinyin and definitions. Changing the set of words or characters requires a new import and build so that the corresponding stroke data remains available.

To reproduce the import during development:

```sh
npm run data:import
```

The script downloads the dataset, validates records, bundles the required characters from the installed `hanzi-writer-data` package and updates license files. Review the diff and run tests and a build before committing. This is an **HSK 2.0 level 1** subset; the source dataset's HSK 3.0 name does not mean its entire vocabulary is enabled.

Writing uses [Hanzi Writer](https://hanziwriter.org/) (MIT) and [Hanzi Writer Data](https://github.com/chanind/hanzi-writer-data), derived from Make Me a Hanzi (Arphic Public License). Full notices are in `public/licenses/`. Stroke data loads from the app's own build without a public CDN request.

## Evaluation methods and limits

Flashcards use **self-assessment** with four ratings. **Again** resets progress and schedules a review in 10 minutes. **Good** advances through intervals of 1, 3, 7, 14 and 30 days. **Hard** stays at the current step with half the interval (12 hours for a new word). **Easy** skips a step (3 days for a new word). Buttons display the resulting review interval; the maximum is 30 days. Legacy records with only a boolean result retain their original scheduling. New words are immediately available. Only flashcard ratings change the review schedule; this is not an SM-2 implementation.

Speaking uses the Web Speech API in the browser and the native recognition service on Android. It checks **transcript equality** after normalizing punctuation and whitespace. It does not score pitch, tones, phonemes or acoustic pronunciation quality. Traditional and simplified characters are not automatically treated as equivalent. Service failures and empty recognition results are not stored as incorrect answers. Typed input is marked separately and excluded from recognition accuracy. Recognition, Mandarin voices and internet requirements depend on the browser and device.

Writing counts an independent attempt as correct after a character is completed from memory without mistakes. An outline or manual hint marks the attempt as assisted. Sentence exercises check token order and accept alternative valid orders for selected examples. Hint use remains recorded after hiding the hint. These exercises demonstrate a few rules rather than providing a general Chinese grammar parser. Accuracy by mode excludes assisted attempts and typed speech answers; points and the daily goal also count assisted practice.

These are prototype metrics. Their educational suitability and assessment accuracy still require evaluation with learners and a teacher.

Course and exercise scores are calculated from the authored answer keys, not from a general language model. Multiple-choice listening uses device speech synthesis; if a Mandarin voice is unavailable, users can still work with written examples. These reviews assess the concepts and examples in the starter unit. They do not demonstrate spoken tone mastery. Optional culture notes link to their sources; tone diagrams and explanatory animation are teaching illustrations rather than measurements of the learner's voice.

## User data

The web app stores progress in `localStorage`; Android uses Capacitor Preferences. Progress is scoped to the verified account ID and remains local to the device. Earlier anonymous/legacy progress can be imported explicitly in Settings and is not automatically exposed to every new account. The original identifiers for 我, 好 and 水 are preserved. Corrupted new-format history is saved under a key ending in `-recovery` before recovery. If reading storage fails, the app does not overwrite the original data and allows new results to be exported. Profiles, authored lessons and classroom memberships are stored in Supabase with RLS; see [account storage and permissions](docs/auth-setup.md#access-rules-and-data-storage).

Exports include results, profile, daily goal and lesson/exercise sessions. Import validates the format, merges histories, removes duplicate attempt IDs and rebuilds the review schedule. Older backups without learning sessions remain supported. Session answers are validated against the current curriculum; imported completion scores are recalculated, and newer copies of the same session are kept. The daily practice goal and streak currently count the quick-practice attempt history; course and exercise completion has its own summary in Progress. Voice recordings exist only during the current practice session and are not exported. The recognition service may process audio outside the device; this application has no audio-processing server.

Vocabulary, exercises and stroke data are bundled in the Android app. The browser still needs to load the application from a web server; there is no service worker for opening the entire page offline.

## Android

The native project is in `android/`. Its application ID is `sk.diplomovka.hanzi.learning`, allowing installation alongside the reference app. Android Studio, an Android SDK and a compatible JDK are required.

```sh
npm run android:sync
npm run android:open
```

Use Android Studio to run the app on a phone/emulator or build an APK. Repeat `npm run android:sync` after changing web code. The project declares microphone permission and visibility for recognition and speech synthesis services. The device needs a recognition service and an installed Mandarin voice; the APK does not bundle these services. Web tests and Capacitor sync do not substitute for testing on a physical Android device.

## Code map

- `src/App.tsx`, `src/lib/useAuth.ts`, `src/lib/supabase.ts`: authentication, session verification and route guards. `src/AuthenticatedApp.tsx` loads the learning workspace after verification.
- `src/AuthenticatedApp.tsx`, `src/lib/navigation.ts`: learning screens, hash navigation, vocabulary loading and progress.
- `src/lib/platform.ts`, `src/components/ManagementPage.tsx`, `LessonManager.tsx`, `ClassroomsPage.tsx`, `PublicLessonsPage.tsx`: account-backed lessons, roles and classrooms.
- `supabase/migrations/`: backend tables, grants, RLS and restricted RPC functions. `server-tests/`: PostgreSQL authorization tests.
- `src/components/`: screens and practice interactions, including the character picker.
- `src/data/categories.ts`, `sentences.ts`: topics and demo sentences.
- `src/types/learning.ts`, `src/data/learning.ts`, `src/lib/learning.ts`: curated starter curriculum, answer grading, lesson prerequisites and learning-session validation.
- `src/components/CoursePage.tsx`, `ExercisesPage.tsx`, `LearningSessionPage.tsx`: course map, exercise catalogue and shared learning workspace.
- `src/lib/vocabulary.ts`: dataset validation, bundled subset and refresh.
- `src/lib/study.ts`, `storage.ts`, `useStudy.ts`: history, scheduling, migration and persistence.
- `src/lib/speech.ts`, `writing.ts`, `sentences.ts`: recognition, comparison and exercise helpers.
- `src/lib/brush.ts`, `brushRenderer.ts`: tapered brush geometry and a renderer using Hanzi Writer's `rendererOverride` contract, including reference-stroke animation and live pen pressure.
- `src/lib/*.test.ts`, `tests/*.spec.ts`: unit and browser tests.

Next stages: acoustic tone and pronunciation assessment, additional vocabulary levels and systematic user evaluation.
