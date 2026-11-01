-- Apply after 20261101150000_platform_content_admin.sql.
-- HearMandarin vocabulary: CC BY 4.0, https://hearmandarin.com/datasets/.
-- New examples, lessons and question banks are original Hanzi app content.
-- Existing edits, archived items, activity revisions, accounts and progress remain intact.
begin;
lock table private.curriculum_20261101180000_upload in exclusive mode;

create or replace function private.validate_platform_catalog(pack jsonb) returns void
language plpgsql set search_path = '' as $$
declare bucket text; item jsonb; q jsonb; opt jsonb; accepted jsonb; ref text; current_items jsonb; categories jsonb; levels jsonb;
begin
  perform private.content_assert(jsonb_typeof(pack)='object' and pack->>'id'='hanzi-platform' and pack->'schemaVersion'='1'::jsonb, 'Unsupported platform content schema.');
  categories := pack->'taxonomy'->'categories'; levels := pack->'taxonomy'->'languageLevels';
  for bucket in select unnest(array['activities','grammarTopics','vocabulary','sentences']) loop
    perform private.content_assert(jsonb_typeof(pack->bucket)='array' and jsonb_array_length(pack->bucket)<=12000,'Content collections must be arrays of at most 12000 entries.');
    perform private.content_assert(not exists(select 1 from jsonb_array_elements(pack->bucket) i where not coalesce(jsonb_typeof(i)='object' and jsonb_typeof(i->'id')='string' and (i->>'id') ~ '^[a-z0-9][a-z0-9:_-]{0,159}$',false)), 'Choose a stable content identifier.');
    perform private.content_assert(not exists(select 1 from jsonb_array_elements(pack->bucket) i where not coalesce(private.content_has_id(levels,i->>'languageLevel') and private.content_has_id(pack->'taxonomy'->'difficulties',i->>'difficulty'),false)), 'Choose a supported language level and difficulty.');
    perform private.content_assert(not exists(select 1 from jsonb_array_elements(pack->bucket) i where i ? 'archived' and jsonb_typeof(i->'archived') is distinct from 'boolean'), 'Invalid archive flag.');
    if bucket <> 'activities' then
      perform private.content_assert((select count(*)=count(distinct i->>'id') from jsonb_array_elements(pack->bucket) i),'Content identifiers must be unique.');
    end if;
  end loop;
  perform private.content_assert(not exists(select 1 from jsonb_array_elements(pack->'vocabulary') i where not coalesce(private.content_text(i->'hanzi') and private.content_text(i->'pinyin') and private.content_text(i->'meaning') and jsonb_typeof(i->'categoryId')='string' and private.content_has_id(categories,i->>'categoryId') and i->>'categoryId'<>'all',false)), 'Complete the word, pinyin, meaning and topic.');
  perform private.content_assert(not exists(select 1 from jsonb_array_elements(pack->'vocabulary') i where not coalesce(jsonb_typeof(i->'sourceId')='string' and private.content_has_id(pack->'taxonomy'->'sources',i->>'sourceId'),false)), 'Choose a known vocabulary source.');
  perform private.content_assert(not exists(select 1 from jsonb_array_elements(pack->'vocabulary') i where not coalesce(i->'level'='null'::jsonb or (jsonb_typeof(i->'level')='number' and i->>'level' ~ '^[1-6]$'),false)), 'HSK level must be empty or an integer from 1 to 6.');
  foreach ref in array array['traditional','partOfSpeech','sourceEntryId'] loop
    perform private.content_assert(not exists(select 1 from jsonb_array_elements(pack->'vocabulary') i where i ? ref and not coalesce(private.content_text(i->ref),false)), 'Optional vocabulary fields must not be blank.');
  end loop;
  for item in select value from jsonb_array_elements(pack->'grammarTopics') loop
    perform private.content_assert(private.content_text(item->'title') and private.content_text(item->'explanation') and private.content_examples(item->'examples'),'Complete the grammar title, explanation and examples.');
    perform private.content_assert(private.content_refs(item->'prerequisites',pack->'grammarTopics'),'Grammar prerequisites must refer to existing topics without duplicates.');
    perform private.content_assert(not (item ? 'vocabularyIds') or private.content_refs(item->'vocabularyIds',pack->'vocabulary'),'Grammar vocabulary links must refer to existing words.');
  end loop;
  for item in select value from jsonb_array_elements(pack->'activities') loop
    perform private.content_assert(item->>'source'='platform' and item->>'kind' in ('lesson','exercise') and item->>'publication' in ('published','archived'),'Invalid platform content type or publication.');
    perform private.content_assert(jsonb_typeof(item->'revision')='number' and item->>'revision' ~ '^[1-9][0-9]*$','Activity revisions must be positive integers.');
    perform private.content_assert(private.content_text(item->'title') and char_length(item->>'title')<=160 and private.content_text(item->'description'),'Complete the title and description.');
    perform private.content_assert(jsonb_typeof(item->'minutes')='number' and (item->>'minutes')::numeric>0 and (item->>'minutes')::numeric<=240,'Duration must be between 1 and 240 minutes.');
    perform private.content_assert(private.content_has_id(categories,item->>'category') and private.content_has_id(pack->'taxonomy'->'courseLines',item->>'line'),'Choose a valid topic and course line.');
    perform private.content_assert(jsonb_typeof(item->'position'->'x')='number' and jsonb_typeof(item->'position'->'y')='number' and (item->'position'->>'x')::numeric>=0 and (item->'position'->>'y')::numeric>=0,'Map coordinates must be non-negative numbers.');
    perform private.content_assert(private.content_strings(item->'objectives',1) and private.content_strings(item->'explanation',1) and private.content_examples(item->'examples'),'Add objectives, explanation paragraphs and complete examples.');
    perform private.content_assert(private.content_refs(item->'vocabularyIds',pack->'vocabulary') and private.content_refs(item->'grammarTopicIds',pack->'grammarTopics'),'Activity vocabulary and grammar links must exist.');
    perform private.content_assert(private.content_strings(item->'features') and not exists(select 1 from jsonb_array_elements_text(item->'features') f where f<>'tone-guide'),'Unknown teaching feature.');
    perform private.content_assert((select count(*)=count(distinct f) from jsonb_array_elements_text(item->'features') f),'Teaching features cannot be duplicated.');
    perform private.content_assert(jsonb_typeof(item->'questions')='array' and jsonb_array_length(item->'questions') between 1 and 100,'Add between 1 and 100 questions.');
    perform private.content_assert((select count(*)=count(distinct v->>'id') from jsonb_array_elements(item->'questions') v),'Question identifiers must be unique within an activity.');
    for q in select value from jsonb_array_elements(item->'questions') loop
      perform private.content_assert(jsonb_typeof(q->'id')='string' and (q->>'id') ~ '^[a-z0-9][a-z0-9:_-]{0,159}$' and private.content_text(q->'prompt') and private.content_text(q->'explanation'),'Complete each question identifier, prompt and feedback explanation.');
      foreach ref in array array['hint','audioText'] loop
        perform private.content_assert(not(q ? ref) or private.content_text(q->ref),'Optional hint and audio text must not be blank.');
      end loop;
      if q->>'type'='choice' then
        perform private.content_assert(jsonb_typeof(q->'options')='array' and jsonb_array_length(q->'options') between 2 and 10,'Choice questions need 2–10 options.');
        perform private.content_assert((select count(*)=count(distinct v->>'id') from jsonb_array_elements(q->'options') v),'Choice option identifiers must be unique.');
        for opt in select value from jsonb_array_elements(q->'options') loop
          perform private.content_assert(jsonb_typeof(opt->'id')='string' and (opt->>'id') ~ '^[a-z0-9][a-z0-9:_-]{0,159}$' and private.content_text(opt->'text') and (not(opt ? 'pinyin') or private.content_text(opt->'pinyin')),'Complete each answer option.');
        end loop;
        perform private.content_assert(jsonb_typeof(q->'answer')='string' and private.content_has_id(q->'options',q->>'answer'),'Select a correct answer from the options.');
      elsif q->>'type'='order' then
        perform private.content_assert(private.content_strings(q->'tokens',1) and jsonb_typeof(q->'acceptedOrders')='array' and jsonb_array_length(q->'acceptedOrders')>0,'Ordering questions need tokens and an accepted order.');
        for accepted in select value from jsonb_array_elements(q->'acceptedOrders') loop
          perform private.content_assert(private.content_strings(accepted,1),'Accepted orders need text tokens.');
          perform private.content_assert((select jsonb_agg(v order by v) from jsonb_array_elements(accepted) v)=(select jsonb_agg(v order by v) from jsonb_array_elements(q->'tokens') v),'Every accepted order must use all token occurrences exactly once.');
        end loop;
      else perform private.content_assert(false,'Supported question types are choice and order.'); end if;
    end loop;
    if item ? 'fact' then
      perform private.content_assert(private.content_text(item->'fact'->'title') and private.content_text(item->'fact'->'text') and private.content_text(item->'fact'->'sourceLabel') and (item->'fact'->>'sourceUrl') ~ '^https://','Complete the culture note and an HTTPS source link.');
    end if;
  end loop;
  perform private.content_assert((select count(*)=count(distinct (i->>'id',i->>'revision')) from jsonb_array_elements(pack->'activities') i),'Activity revisions must be unique.');
  perform private.content_assert(not exists(select 1 from jsonb_array_elements(pack->'activities') i group by i->>'id' having count(distinct i->>'kind')>1),'Activities cannot change type.');
  current_items := private.content_current(pack->'activities');
  for item in select value from jsonb_array_elements(pack->'activities') loop
    perform private.content_assert(exists(select 1 from jsonb_array_elements(pack->'activities') i where i->>'id'=item->>'id' and i->>'revision'='1'),'Historical revision 1 must be retained.');
    perform private.content_assert(private.content_refs(item->'prerequisites',current_items),'Activity prerequisites must refer to existing lessons.');
    for ref in select value from jsonb_array_elements_text(item->'prerequisites') loop
      perform private.content_assert(exists(select 1 from jsonb_array_elements(current_items) i where i->>'id'=ref and i->>'kind'='lesson'),'Prerequisites must be lessons.');
      perform private.content_assert((select p.rank<=a.rank from jsonb_array_elements(levels) with ordinality p(v,rank),jsonb_array_elements(levels) with ordinality a(v,rank),jsonb_array_elements(current_items) i where i->>'id'=ref and p.v->>'id'=i->>'languageLevel' and a.v->>'id'=item->>'languageLevel'),'A prerequisite cannot require a higher language level.');
    end loop;
  end loop;
  perform private.content_assert(not exists(
    with recursive walk(node,path,cycle) as (
      select i->>'id',array[i->>'id'],false from jsonb_array_elements(current_items) i
      union all select r,array_append(w.path,r),r=any(w.path) from walk w join lateral jsonb_array_elements(current_items) i on i->>'id'=w.node cross join lateral jsonb_array_elements_text(i->'prerequisites') r where not w.cycle
    ) select 1 from walk where cycle),'Lesson prerequisites contain a cycle.');
  perform private.content_assert(not exists(
    with recursive walk(node,path,cycle) as (
      select i->>'id',array[i->>'id'],false from jsonb_array_elements(pack->'grammarTopics') i
      union all select r,array_append(w.path,r),r=any(w.path) from walk w join lateral jsonb_array_elements(pack->'grammarTopics') i on i->>'id'=w.node cross join lateral jsonb_array_elements_text(i->'prerequisites') r where not w.cycle
    ) select 1 from walk where cycle),'Grammar prerequisites contain a cycle.');
  for item in select value from jsonb_array_elements(pack->'sentences') loop
    perform private.content_assert(private.content_text(item->'meaning') and private.content_text(item->'pinyin') and private.content_strings(item->'tokens',1) and item->>'punctuation' in ('。','？'),'Complete the sentence translation, pinyin, tokens and punctuation.');
    perform private.content_assert(jsonb_typeof(item->'grammarTopicId')='string' and private.content_has_id(pack->'grammarTopics',item->>'grammarTopicId'),'Choose an existing sentence grammar topic.');
    if item ? 'acceptedOrders' then
      perform private.content_assert(jsonb_typeof(item->'acceptedOrders')='array','Accepted sentence orders must be an array.');
      for accepted in select value from jsonb_array_elements(item->'acceptedOrders') loop
        perform private.content_assert(private.content_strings(accepted,1) and (select jsonb_agg(v order by v) from jsonb_array_elements(accepted) v)=(select jsonb_agg(v order by v) from jsonb_array_elements(item->'tokens') v),'Accepted sentence orders must use every token.');
      end loop;
    end if;
    perform private.content_assert(jsonb_typeof(item->'grammarParts')='array','Grammar annotations must be an array.');
    for q in select value from jsonb_array_elements(item->'grammarParts') loop
      perform private.content_assert(private.content_text(q->'label') and private.content_text(q->'text'),'Complete each grammar annotation.');
    end loop;
  end loop;
end; $$;


revoke all on function private.validate_platform_catalog(jsonb) from public, anon, authenticated;

do $upgrade$
declare current_row public.platform_catalog; next_pack jsonb; bucket text; pending jsonb;
  additions jsonb;
begin
  perform private.content_assert((select count(*)=6 and min(part)=1 and max(part)=6 and md5(string_agg(payload,'' order by part))='54bfb9838584cbd6846d3d9c8e075997' from private.curriculum_20261101180000_upload), 'Curriculum upload is incomplete or changed. Run all numbered payload files before applying.');
  select string_agg(payload,'' order by part)::jsonb into additions from private.curriculum_20261101180000_upload;
  select * into current_row from public.platform_catalog where id='hanzi-platform' for update;
  if not found then raise exception 'Apply the platform catalog migration first.'; end if;
  next_pack := current_row.data;
  -- Insert only missing IDs/revisions; never resurrect or overwrite an editor's work.
  foreach bucket in array array['vocabulary','grammarTopics','activities','sentences'] loop
    if bucket='vocabulary' and exists(select 1 from jsonb_array_elements(additions->bucket) incoming join jsonb_array_elements(next_pack->bucket) old on old->>'id'=incoming->>'id' where old->>'hanzi'<>incoming->>'hanzi') then
      raise exception 'A vocabulary identity was reassigned. Resolve the conflict before upgrading.';
    end if;
    select coalesce(jsonb_agg(incoming order by n),'[]') into pending
      from jsonb_array_elements(additions->bucket) with ordinality q(incoming,n)
      where not exists(select 1 from jsonb_array_elements(next_pack->bucket) old where old->>'id'=incoming->>'id' and (bucket<>'activities' or old->'revision'=incoming->'revision'));
    next_pack := jsonb_set(next_pack,array[bucket],(next_pack->bucket)||pending);
  end loop;
  next_pack := jsonb_set(next_pack,'{taxonomy,vocabularySelection,hsk2Levels}','[1,2,3,4,5,6]');
  next_pack := jsonb_set(next_pack,'{taxonomy,categories}',(select jsonb_agg(case
    when c->>'id'='all' and c->>'title'='All words' then c||jsonb_build_object('description','Vocabulary from HSK 2.0 levels 1–6, filtered to your chosen level.')
    when c->>'id'='other' and c->>'title'='Phrases and grammar' then c||jsonb_build_object('title','More words and expressions','description','Expressions, descriptive words and additional vocabulary.')
    else c end order by n) from jsonb_array_elements(next_pack->'taxonomy'->'categories') with ordinality q(c,n)));
  perform private.validate_platform_catalog(next_pack);
  if next_pack is distinct from current_row.data then
    update public.platform_catalog set data=next_pack, revision=revision+1, updated_at=now() where id=current_row.id;
  end if;
end;
$upgrade$;
drop table private.curriculum_20261101180000_upload;
commit;
