-- Roles are database-owned. Signup metadata never grants privileges.
create type public.app_role as enum ('student', 'lecturer', 'admin');
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  display_name text not null check (char_length(display_name) between 1 and 80),
  role public.app_role not null default 'student',
  created_at timestamptz not null default now()
);

create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, email, display_name, role)
  values (new.id, coalesce(new.email, ''),
    coalesce(nullif(left(btrim(new.raw_user_meta_data ->> 'display_name'), 80), ''), 'Learner'), 'student');
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
for each row execute function private.handle_new_user();

insert into public.profiles(id, email, display_name)
select id, coalesce(email, ''),
  coalesce(nullif(left(btrim(raw_user_meta_data ->> 'display_name'), 80), ''), 'Learner')
from auth.users on conflict (id) do nothing;

create function private.sync_user_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;
revoke all on function private.sync_user_email() from public, anon, authenticated;
create trigger on_auth_user_email_changed after update of email on auth.users
for each row execute function private.sync_user_email();

-- Consult the current DB role on every request. Revoking a session or changing
-- a role takes effect without waiting for a cached JWT role claim to expire.
create function private.current_app_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p
  where p.id = (select auth.uid()) and exists (
    select 1 from auth.sessions s where s.user_id = p.id
      and s.id::text = (select auth.jwt() ->> 'session_id')
      and (s.not_after is null or s.not_after > now())
  );
$$;
revoke all on function private.current_app_role() from public, anon;
grant execute on function private.current_app_role() to authenticated;

create table public.public_lessons (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles(id),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  summary text not null default '' check (char_length(summary) <= 500),
  content text not null check (char_length(btrim(content)) between 1 and 50000),
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index public_lessons_author_idx on public.public_lessons(author_id);
create index public_lessons_catalog_idx on public.public_lessons(published, created_at desc);

create function private.touch_lesson() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function private.touch_lesson() from public, anon, authenticated;
create trigger touch_public_lesson before update on public.public_lessons
for each row execute function private.touch_lesson();

create table public.classrooms (
  id uuid primary key default gen_random_uuid(),
  lecturer_id uuid not null default auth.uid() references public.profiles(id),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  join_code text not null unique default gen_random_uuid()::text,
  created_at timestamptz not null default now()
);
create index classrooms_lecturer_idx on public.classrooms(lecturer_id);
create table public.classroom_members (
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (classroom_id, student_id)
);
create index classroom_members_student_idx on public.classroom_members(student_id);

create function private.can_manage_classroom(classroom uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.current_app_role() = 'admin' or (
    private.current_app_role() = 'lecturer' and exists (
      select 1 from public.classrooms c where c.id = classroom and c.lecturer_id = auth.uid()
    )
  );
$$;
create function private.teaches_student(student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.current_app_role() = 'lecturer' and exists (
    select 1 from public.classroom_members m join public.classrooms c on c.id = m.classroom_id
    where m.student_id = student and c.lecturer_id = auth.uid()
  );
$$;
revoke all on function private.can_manage_classroom(uuid) from public, anon;
revoke all on function private.teaches_student(uuid) from public, anon;
grant execute on function private.can_manage_classroom(uuid), private.teaches_student(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.public_lessons enable row level security;
alter table public.classrooms enable row level security;
alter table public.classroom_members enable row level security;
revoke all on public.profiles, public.public_lessons, public.classrooms, public.classroom_members from public, anon, authenticated;
grant select on public.profiles, public.public_lessons, public.classrooms, public.classroom_members to authenticated;
grant update(display_name) on public.profiles to authenticated;
grant insert, delete on public.public_lessons, public.classrooms to authenticated;
grant update(title, summary, content, published) on public.public_lessons to authenticated;
grant update(name) on public.classrooms to authenticated;
grant delete on public.classroom_members to authenticated;

create policy profiles_read on public.profiles for select to authenticated
using (private.current_app_role() is not null and (
  id = (select auth.uid()) or private.current_app_role() = 'admin' or private.teaches_student(id)
));
create policy profiles_update_name on public.profiles for update to authenticated
using (private.current_app_role() is not null and id = (select auth.uid()))
with check (private.current_app_role() is not null and id = (select auth.uid()));

-- "Public" means published to all signed-in learners, never anonymous API access.
create policy lessons_read on public.public_lessons for select to authenticated
using (private.current_app_role() is not null and (
  published or private.current_app_role() = 'admin' or
  (private.current_app_role() = 'lecturer' and author_id = (select auth.uid()))
));
create policy lessons_create on public.public_lessons for insert to authenticated
with check (private.current_app_role() in ('lecturer', 'admin') and author_id = (select auth.uid()));
create policy lessons_update on public.public_lessons for update to authenticated
using (private.current_app_role() = 'admin' or (private.current_app_role() = 'lecturer' and author_id = (select auth.uid())))
with check (private.current_app_role() = 'admin' or (private.current_app_role() = 'lecturer' and author_id = (select auth.uid())));
create policy lessons_delete on public.public_lessons for delete to authenticated
using (private.current_app_role() = 'admin' or (private.current_app_role() = 'lecturer' and author_id = (select auth.uid())));

create policy classrooms_read on public.classrooms for select to authenticated
using (private.current_app_role() is not null and (private.current_app_role() = 'admin' or
  (private.current_app_role() = 'lecturer' and lecturer_id = (select auth.uid())) or exists (
  select 1 from public.classroom_members m where m.classroom_id = id and m.student_id = (select auth.uid())
)));
create policy classrooms_create on public.classrooms for insert to authenticated
with check (private.current_app_role() in ('lecturer', 'admin') and lecturer_id = (select auth.uid()));
create policy classrooms_update on public.classrooms for update to authenticated
using (private.can_manage_classroom(id)) with check (private.can_manage_classroom(id));
create policy classrooms_delete on public.classrooms for delete to authenticated
using (private.can_manage_classroom(id));

create policy memberships_read on public.classroom_members for select to authenticated
using (private.current_app_role() is not null and (student_id = (select auth.uid()) or private.can_manage_classroom(classroom_id)));
create policy memberships_delete on public.classroom_members for delete to authenticated
using (private.current_app_role() is not null and (student_id = (select auth.uid()) or private.can_manage_classroom(classroom_id)));

create function public.join_classroom(invitation text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare classroom uuid;
begin
  if private.current_app_role() is distinct from 'student' then
    raise exception 'Only students can join a classroom.' using errcode = '42501';
  end if;
  select c.id into classroom from public.classrooms c join public.profiles p on p.id = c.lecturer_id
    where c.join_code = lower(btrim(invitation)) and p.role in ('lecturer', 'admin');
  if classroom is null then raise exception 'Classroom invitation not found.' using errcode = 'P0001'; end if;
  insert into public.classroom_members(classroom_id, student_id) values (classroom, auth.uid())
    on conflict do nothing;
  return classroom;
end;
$$;

create function public.set_user_role(target_user uuid, new_role public.app_role) returns void
language plpgsql security definer set search_path = '' as $$
declare previous_role public.app_role;
begin
  if private.current_app_role() is distinct from 'admin' then
    raise exception 'Only administrators can change roles.' using errcode = '42501';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(837461237);
  if private.current_app_role() is distinct from 'admin' then
    raise exception 'Only administrators can change roles.' using errcode = '42501';
  end if;
  select role into previous_role from public.profiles where id = target_user for update;
  if previous_role is null then raise exception 'User not found.' using errcode = 'P0001'; end if;
  if previous_role = 'admin' and new_role <> 'admin' and
    (select count(*) from public.profiles where role = 'admin') <= 1 then
    raise exception 'The last administrator cannot be demoted.' using errcode = 'P0001';
  end if;
  update public.profiles set role = new_role where id = target_user;
end;
$$;
revoke all on function public.join_classroom(text), public.set_user_role(uuid, public.app_role) from public, anon;
grant execute on function public.join_classroom(text), public.set_user_role(uuid, public.app_role) to authenticated;
