# Lecturer lesson block editor

## Apply the database upgrade

Run `supabase/migrations/20261103120000_lecturer_lesson_blocks.sql` once in the correct Supabase project's SQL Editor, then deploy the new frontend. Apply the existing auth/roles, learning profile, content classification, platform content administration and expanded curriculum migrations first. Do not rerun those previous migrations on an already upgraded project. No new environment variables, services or packages are needed.

The migration is additive: it adds nullable `public.public_lessons.content_blocks`, validates writes through a trigger and grants updates to that column under the existing RLS policies. Existing IDs, authors, text, publication flags, classroom membership and learner progress are unchanged. A failed transaction rolls back the entire upgrade. A missing-column error in the app means this migration still needs to be applied.

## Authoring

In Lecturer workspace, select **New lesson** or **Edit**. Set a title, summary, level and difficulty, then add up to 40 blocks. Block headings expand/collapse their fields; existing lessons initially expand the first block to keep longer documents manageable. **Move up**, **Move down** and **Remove** are keyboard-accessible; block and question identifiers remain stable when reordered. Removing a block and discarding unsaved edits require confirmation. Refreshing/closing a page with unsaved edits invokes the browser's unload warning. Changes are saved explicitly, not automatically.

Supported blocks:

- **Explanation:** optional heading, lesson text and an optional grammar explanation.
- **Chinese example:** Chinese characters, pinyin and a translation. Slovak is the default translation language; English is also supported. The editor UI remains English. Preview audio uses the existing Mandarin TTS and voice-setup help, with cancellation when leaving the preview.
- **Vocabulary:** up to 50 references to existing catalog entries, searchable by characters, English meaning, ID or pinyin without tone marks. Results are bounded to the first 60 matches plus selected entries; the full dictionary is not rendered as thousands of checkboxes. Preview shows cards and can open the existing flashcard component. Imported dictionary glosses retain their source language; this editor does not automatically translate them.
- **Interactive exercise:** up to 20 existing `LearningQuestion` records. Reuses the administrator question fields for choice questions (2–10 options) or sentence ordering (up to 50 tokens and 10 accepted orders). Preview reuses `QuestionTask` and `gradeAnswer`; accepted orders must use every token occurrence exactly once.
- **Practice:** choose catalog words and speaking/pronunciation and/or character writing. Preview opens the existing SpeechPage or WritingPage in embedded mode, with cleanup of microphone/audio/writing resources when closed. Speech recognition compares text as before; it does not assess acoustic tone quality.

**Save lesson** saves the current draft. A title is required, but draft blocks can be unfinished or empty. Selecting **Publish to all signed-in learners** requires all blocks to be complete; missing/archived vocabulary references must be replaced before publishing. Save failures preserve the current form for correction/retry. Vocabulary references are checked again against the database catalog, not trusted solely from the browser.

## Storage and compatibility

`LecturerLessonDocument` is a JSON document with `schemaVersion: 1` and an ordered `blocks` array. Each block has a stable ID and a discriminated type. The Supabase adapter maps `content_blocks` to `LecturerLesson.blocks`; old responses without this field read as `null`. Unknown versions or malformed documents fail explicitly rather than silently dropping blocks.

The original `content` field is retained. Saving a structured lesson derives a static reading version containing explanations, examples, selected words and question prompts/options, without writing exercise answer keys or feedback explanations into that text. Existing text lessons keep `content_blocks = null` after migration. Opening one in the editor creates an in-memory explanation block containing its exact original text; only an explicit save stores this conversion. Merely previewing it does not update the database. Text is rendered through React text nodes, not interpreted as HTML.

Documents are bounded to 200 KB, and the original 50,000-character text limit still applies to the readable version. The browser validates both the structure and publishing requirements. PostgreSQL independently validates block types, lengths, unique IDs, question answers/token orders and vocabulary references. The trigger runs with a fixed search path and its helpers cannot be called directly by application roles. Existing RLS continues to restrict updates/deletion to the author or Admin; students cannot author lessons, and foreign drafts remain private.

## Scope of this phase

This is an **authoring editor and isolated preview**, not a student lesson-completion system. Previews do not mount `useStudy`, create learning sessions, update spaced repetition, write progress or send practice results to Supabase. Embedded practice callbacks are intentionally local/no-op. Only the authenticated workspace's pre-existing progress loader remains mounted outside the preview.

Students continue reading the existing static public-lesson page. The block document is ready for a later student runner, but no enrollment, completion, progress synchronization or new lecturer/student relationship is introduced here. Platform course content, administrator publishing and historical question-bank revisions remain separate.

## Verification

Unit tests cover all block types, draft/publish validation, stable reorder/legacy conversion, references, bounds, repeated sentence tokens and legacy text generation. Actual PostgreSQL/PGlite tests apply the additive migration over existing content and verify server-side validation, draft publication failures, ownership and role/session restrictions. Browser tests author a complete lesson, save/reload/publish it, grade both question types in preview, exercise flashcard/speech previews without writing progress, render the existing writing board, test shared TTS, check legacy HTML escaping and cover mobile/desktop keyboard layout and failed saves.

Run `npm test`, `npm run test:browser`, `npm run lint` and `npm run build`. Browser Supabase responses and voice output are mocked; applying the migration and testing a live Supabase project/physical Android device remain separate steps.
