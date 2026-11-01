-- Platform curriculum lives in the versioned content catalog. These are
-- lecturer-authored public reading lessons, never entries in the platform map.
-- Adding metadata preserves all existing IDs, authors, text and publication.
alter table public.public_lessons
  add column language_level text not null default 'beginner'
    check (language_level in ('beginner', 'elementary', 'intermediate', 'advanced')),
  add column difficulty text not null default 'balanced'
    check (difficulty in ('gentle', 'balanced', 'challenging'));

-- Existing lesson ownership and role policies still govern every update.
grant update(language_level, difficulty) on public.public_lessons to authenticated;
