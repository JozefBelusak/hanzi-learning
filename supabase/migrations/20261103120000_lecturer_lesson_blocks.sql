-- Additive authoring documents. Existing text, IDs, authors, publication and RLS
-- are preserved; student lesson completion is intentionally outside this upgrade.
begin;
alter table public.public_lessons add column content_blocks jsonb;
grant update(content_blocks) on public.public_lessons to authenticated;

create function private.lesson_text(value jsonb, maximum integer, required boolean default false) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(value) = 'string' and char_length(value #>> '{}') <= maximum
    and (not required or char_length(btrim(value #>> '{}', E' \t\n\r')) > 0);
$$;
create function private.lesson_strings(value jsonb, minimum integer, maximum integer, required boolean default false) returns boolean
language plpgsql immutable set search_path = '' as $$
begin
  if jsonb_typeof(value) is distinct from 'array' then return false; end if;
  if jsonb_array_length(value) < minimum or jsonb_array_length(value) > maximum then return false; end if;
  return not exists (select 1 from jsonb_array_elements(value) item where private.lesson_text(item,1000,required) is not true);
end;
$$;
create function private.validate_lecturer_question(q jsonb, published boolean) returns void
language plpgsql set search_path = '' as $$
declare opt jsonb; accepted jsonb; field text;
begin
  perform private.content_assert(jsonb_typeof(q)='object' and jsonb_typeof(q->'id')='string' and (q->>'id') ~ '^[a-z0-9][a-z0-9:_-]{0,159}$','Questions need stable identifiers.');
  perform private.content_assert(private.lesson_text(q->'prompt',4000,published) and private.lesson_text(q->'explanation',4000,published),'Complete the question prompt and explanation before publishing.');
  foreach field in array array['hint','audioText'] loop
    perform private.content_assert(not(q ? field) or private.lesson_text(q->field,2000),'Question hints and audio text must be bounded text.');
  end loop;
  if q->>'type'='choice' then
    perform private.content_assert(jsonb_typeof(q->'options')='array','Choice options must be an array.');
    perform private.content_assert(jsonb_array_length(q->'options') between 2 and 10,'Choice questions need 2–10 options.');
    perform private.content_assert((select count(*)=count(distinct item->>'id') from jsonb_array_elements(q->'options') item),'Option identifiers must be unique.');
    for opt in select value from jsonb_array_elements(q->'options') loop
      perform private.content_assert(jsonb_typeof(opt)='object' and jsonb_typeof(opt->'id')='string' and (opt->>'id') ~ '^[a-z0-9][a-z0-9:_-]{0,159}$' and private.lesson_text(opt->'text',2000,published),'Complete each choice option before publishing.');
      perform private.content_assert(not(opt ? 'pinyin') or private.lesson_text(opt->'pinyin',1000),'Option pinyin must be text.');
    end loop;
    perform private.content_assert(jsonb_typeof(q->'answer')='string' and private.content_has_id(q->'options',q->>'answer'),'The answer must reference an existing option.');
  elsif q->>'type'='order' then
    perform private.content_assert(private.lesson_strings(q->'tokens',case when published then 1 else 0 end,50,published),'Add up to 50 non-empty sentence tokens before publishing.');
    perform private.content_assert(jsonb_typeof(q->'acceptedOrders')='array','Accepted orders must be an array.');
    perform private.content_assert(jsonb_array_length(q->'acceptedOrders') between 1 and 10,'Add 1–10 accepted orders.');
    for accepted in select value from jsonb_array_elements(q->'acceptedOrders') loop
      perform private.content_assert(private.lesson_strings(accepted,case when published then 1 else 0 end,50,published),'Accepted orders must contain bounded text tokens.');
      if published then
        perform private.content_assert((select jsonb_agg(v order by v) from jsonb_array_elements(accepted) v)=(select jsonb_agg(v order by v) from jsonb_array_elements(q->'tokens') v),'Accepted orders must use every token occurrence exactly once.');
      end if;
    end loop;
  else
    perform private.content_assert(false,'Supported exercises are choice and order.');
  end if;
end;
$$;

create function private.validate_lecturer_blocks() returns trigger
language plpgsql security definer set search_path = '' as $$
declare doc jsonb; block jsonb; q jsonb; words jsonb; ref text; field text;
begin
  doc = new.content_blocks;
  -- A null document is a legacy reading lesson, not an empty structured lesson.
  if doc is null then return new; end if;
  perform private.content_assert(jsonb_typeof(doc)='object' and doc->'schemaVersion'='1'::jsonb,'Unsupported lesson block document.');
  perform private.content_assert(octet_length(doc::text)<=200000,'Lesson blocks exceed the 200 KB limit.');
  perform private.content_assert(jsonb_typeof(doc->'blocks')='array','Lesson blocks must be an array.');
  perform private.content_assert(jsonb_array_length(doc->'blocks') between case when new.published then 1 else 0 end and 40,'Add 1–40 blocks before publishing.');
  perform private.content_assert((select count(*)=count(distinct item->>'id') from jsonb_array_elements(doc->'blocks') item),'Block identifiers must be unique.');
  select data->'vocabulary' into words from public.platform_catalog where id='hanzi-platform';
  for block in select value from jsonb_array_elements(doc->'blocks') loop
    perform private.content_assert(jsonb_typeof(block)='object' and jsonb_typeof(block->'id')='string' and (block->>'id') ~ '^[a-z0-9][a-z0-9:_-]{0,159}$','Blocks need stable identifiers.');
    case block->>'type'
      when 'explanation' then
        perform private.content_assert(private.lesson_text(block->'heading',200) and private.lesson_text(block->'text',50000,new.published) and private.lesson_text(block->'grammar',10000),'Complete the explanation text before publishing.');
      when 'example' then
        perform private.content_assert(jsonb_typeof(block->'example')='object' and block->>'translationLanguage' in ('sk','en'),'Choose Slovak or English for the example translation.');
        foreach field in array array['hanzi','pinyin','meaning'] loop
          perform private.content_assert(private.lesson_text(block->'example'->field,2000,new.published),'Complete characters, pinyin and translation before publishing.');
        end loop;
      when 'exercise' then
        perform private.content_assert(jsonb_typeof(block->'questions')='array','Exercise questions must be an array.');
        perform private.content_assert(jsonb_array_length(block->'questions') between case when new.published then 1 else 0 end and 20,'An exercise needs 1–20 questions before publishing.');
        perform private.content_assert((select count(*)=count(distinct item->>'id') from jsonb_array_elements(block->'questions') item),'Question identifiers must be unique within a block.');
        for q in select value from jsonb_array_elements(block->'questions') loop
          perform private.validate_lecturer_question(q,new.published);
        end loop;
      when 'vocabulary', 'practice' then
        perform private.content_assert(private.lesson_strings(block->'vocabularyIds',case when new.published then 1 else 0 end,50,true),'Choose up to 50 vocabulary entries.');
        perform private.content_assert((select count(*)=count(distinct v) from jsonb_array_elements_text(block->'vocabularyIds') v),'Vocabulary references must be unique.');
        for ref in select value from jsonb_array_elements_text(block->'vocabularyIds') loop
          perform private.content_assert(ref ~ '^[a-z0-9][a-z0-9:_-]{0,159}$' and exists (
            select 1 from jsonb_array_elements(words) word where word->>'id'=ref and (not new.published or coalesce(word->>'archived','false')='false')
          ),'A selected word is missing or archived. Replace it before publishing.');
        end loop;
        if block->>'type'='practice' then
          perform private.content_assert(private.lesson_strings(block->'modes',case when new.published then 1 else 0 end,2,true),'Choose speaking or writing practice.');
          perform private.content_assert(not exists(select 1 from jsonb_array_elements_text(block->'modes') mode where mode not in ('speech','writing')) and (select count(*)=count(distinct v) from jsonb_array_elements_text(block->'modes') v),'Practice modes must be unique: speech or writing.');
        end if;
      else
        perform private.content_assert(false,'Unsupported lesson block type.');
    end case;
  end loop;
  return new;
end;
$$;

revoke all on function private.lesson_text(jsonb,integer,boolean), private.lesson_strings(jsonb,integer,integer,boolean), private.validate_lecturer_question(jsonb,boolean), private.validate_lecturer_blocks() from public, anon, authenticated;
create trigger validate_lecturer_blocks before insert or update on public.public_lessons
for each row execute function private.validate_lecturer_blocks();
commit;
