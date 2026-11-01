-- Apply after 20261028090000_auth_and_roles.sql, including on existing projects.
-- Existing and newly registered accounts must explicitly complete onboarding.
alter table public.profiles
  add column language_level text check (language_level in ('beginner', 'elementary', 'intermediate', 'advanced')),
  add column difficulty text check (difficulty in ('gentle', 'balanced', 'challenging')),
  add column preferred_modes text[] not null default '{}'
    check (cardinality(preferred_modes) <= 4 and array_position(preferred_modes, null) is null
      and preferred_modes <@ array['flashcards', 'speech', 'writing', 'sentences']::text[]),
  add column learning_goals text[] not null default '{}'
    check (cardinality(learning_goals) <= 5 and array_position(learning_goals, null) is null
      and learning_goals <@ array['conversation', 'travel', 'work', 'study', 'culture']::text[]),
  add column daily_goal integer not null default 10 check (daily_goal between 1 and 100),
  add column onboarding_completed_at timestamptz,
  add constraint completed_learning_profile check (onboarding_completed_at is null or (
    language_level is not null and difficulty is not null
    and cardinality(preferred_modes) > 0 and cardinality(learning_goals) > 0
  ));

-- No direct client UPDATE grants on the new fields or the completion timestamp.
-- A single transaction validates all preferences and records completion on the server.
create function public.save_learning_profile(
  profile_name text, profile_level text, profile_difficulty text,
  profile_modes text[], profile_goals text[], profile_daily_goal integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare saved public.profiles;
begin
  if private.current_app_role() is null then
    raise exception 'A verified account is required.' using errcode = '42501';
  end if;
  if profile_name is null or char_length(btrim(profile_name)) not between 1 and 80
    or profile_level is null or profile_level not in ('beginner', 'elementary', 'intermediate', 'advanced')
    or profile_difficulty is null or profile_difficulty not in ('gentle', 'balanced', 'challenging')
    or profile_daily_goal is null or profile_daily_goal not between 1 and 100
    or profile_modes is null or cardinality(profile_modes) not between 1 and 4
    or array_position(profile_modes, null) is not null
    or not (profile_modes <@ array['flashcards', 'speech', 'writing', 'sentences']::text[])
    or profile_goals is null or cardinality(profile_goals) not between 1 and 5
    or array_position(profile_goals, null) is not null
    or not (profile_goals <@ array['conversation', 'travel', 'work', 'study', 'culture']::text[])
  then
    raise exception 'Choose a valid level, difficulty, daily goal, and at least one practice mode and learning goal.' using errcode = '22023';
  end if;
  update public.profiles set
    display_name = btrim(profile_name), language_level = profile_level, difficulty = profile_difficulty,
    preferred_modes = array(select distinct mode from unnest(profile_modes) as mode order by mode),
    learning_goals = array(select distinct goal from unnest(profile_goals) as goal order by goal),
    daily_goal = profile_daily_goal, onboarding_completed_at = coalesce(onboarding_completed_at, now())
  where id = (select auth.uid()) returning * into saved;
  if not found then raise exception 'Account profile not found.' using errcode = '42501'; end if;
  return to_jsonb(saved);
end;
$$;
revoke all on function public.save_learning_profile(text, text, text, text[], text[], integer) from public, anon;
grant execute on function public.save_learning_profile(text, text, text, text[], text[], integer) to authenticated;
