-- Run each numbered file separately in Supabase SQL Editor, in order.
-- Do not deploy the new frontend until the final apply step succeeds.
begin;
do $$ begin
  if to_regclass('public.platform_catalog') is null then
    raise exception 'Apply the platform content administration migration first.';
  end if;
end; $$;
create table if not exists private.curriculum_20261101180000_upload (
  part integer primary key check (part > 0),
  payload text not null
);
alter table private.curriculum_20261101180000_upload enable row level security;
revoke all on private.curriculum_20261101180000_upload from public, anon, authenticated;
commit;
