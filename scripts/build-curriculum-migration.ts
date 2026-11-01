// Rebuild this release's append-only SQL payload from the checked-in catalog.
// The original migration and published answer banks are never rewritten.
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { project, readCatalog } from './content-files.ts'

const original = await readFile(join(project, 'supabase/migrations/20261101150000_platform_content_admin.sql'), 'utf8')
const catalog = await readCatalog()
const baseline = JSON.parse(original.match(/\$hanzi_seed\$([\s\S]*?)\$hanzi_seed\$/)![1]) as typeof catalog
const additions = {
  vocabulary: catalog.vocabulary.filter((item) => !baseline.vocabulary.some((old) => old.id === item.id)),
  grammarTopics: catalog.grammarTopics.filter((item) => !baseline.grammarTopics.some((old) => old.id === item.id)),
  activities: catalog.activities.filter((item) => !baseline.activities.some((old) => old.id === item.id && old.revision === item.revision)),
  sentences: catalog.sentences.filter((item) => !baseline.sentences.some((old) => old.id === item.id)),
}
let validator = original.slice(original.indexOf('create function private.validate_platform_catalog('), original.indexOf('create function public.get_platform_catalog()'))
  .replace('create function', 'create or replace function')
  .replace('<=5000', '<=12000').replace('at most 5000 entries', 'at most 12000 entries')
// Set-based validation avoids tens of thousands of PL/pgSQL statements when
// validating the larger vocabulary. The same fields and constraints are checked.
const metadataStart = validator.indexOf('    for item in select value from jsonb_array_elements(pack->bucket) loop')
const metadataEnd = validator.indexOf('    end loop;', metadataStart) + '    end loop;'.length
validator = validator.slice(0, metadataStart) + `    perform private.content_assert(not exists(select 1 from jsonb_array_elements(pack->bucket) i where not coalesce(jsonb_typeof(i)='object' and jsonb_typeof(i->'id')='string' and (i->>'id') ~ '^[a-z0-9][a-z0-9:_-]{0,159}$',false)), 'Choose a stable content identifier.');
    perform private.content_assert(not exists(select 1 from jsonb_array_elements(pack->bucket) i where not coalesce(private.content_has_id(levels,i->>'languageLevel') and private.content_has_id(pack->'taxonomy'->'difficulties',i->>'difficulty'),false)), 'Choose a supported language level and difficulty.');
    perform private.content_assert(not exists(select 1 from jsonb_array_elements(pack->bucket) i where i ? 'archived' and jsonb_typeof(i->'archived') is distinct from 'boolean'), 'Invalid archive flag.');` + validator.slice(metadataEnd)
const wordsStart = validator.indexOf("  for item in select value from jsonb_array_elements(pack->'vocabulary') loop")
const wordsEnd = validator.indexOf("  for item in select value from jsonb_array_elements(pack->'grammarTopics') loop", wordsStart)
validator = validator.slice(0, wordsStart) + `  perform private.content_assert(not exists(select 1 from jsonb_array_elements(pack->'vocabulary') i where not coalesce(private.content_text(i->'hanzi') and private.content_text(i->'pinyin') and private.content_text(i->'meaning') and jsonb_typeof(i->'categoryId')='string' and private.content_has_id(categories,i->>'categoryId') and i->>'categoryId'<>'all',false)), 'Complete the word, pinyin, meaning and topic.');
  perform private.content_assert(not exists(select 1 from jsonb_array_elements(pack->'vocabulary') i where not coalesce(jsonb_typeof(i->'sourceId')='string' and private.content_has_id(pack->'taxonomy'->'sources',i->>'sourceId'),false)), 'Choose a known vocabulary source.');
  perform private.content_assert(not exists(select 1 from jsonb_array_elements(pack->'vocabulary') i where not coalesce(i->'level'='null'::jsonb or (jsonb_typeof(i->'level')='number' and i->>'level' ~ '^[1-6]$'),false)), 'HSK level must be empty or an integer from 1 to 6.');
  foreach ref in array array['traditional','partOfSpeech','sourceEntryId'] loop
    perform private.content_assert(not exists(select 1 from jsonb_array_elements(pack->'vocabulary') i where i ? ref and not coalesce(private.content_text(i->ref),false)), 'Optional vocabulary fields must not be blank.');
  end loop;
` + validator.slice(wordsEnd)
const sql = `-- Apply after 20261101150000_platform_content_admin.sql.
-- HearMandarin vocabulary: CC BY 4.0, https://hearmandarin.com/datasets/.
-- New examples, lessons and question banks are original Hanzi app content.
-- Existing edits, archived items, activity revisions, accounts and progress remain intact.
begin;

${validator}
revoke all on function private.validate_platform_catalog(jsonb) from public, anon, authenticated;

do $upgrade$
declare current_row public.platform_catalog; next_pack jsonb; bucket text; pending jsonb;
  additions jsonb := $curriculum$${JSON.stringify(additions)}$curriculum$::jsonb;
begin
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
commit;
`
await writeFile(join(project, 'supabase/migrations/20261101180000_expanded_curriculum.sql'), sql)
console.log(`Prepared append-only expansion: ${additions.vocabulary.length} words, ${additions.activities.length} activities. Existing content is preserved.`)
