// Keep the canonical migration intact; provide small SQL Editor uploads that
// stage its payload privately and publish the full catalog only in the last step.
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const project = fileURLToPath(new URL('../', import.meta.url))
const sql = await readFile(join(project, 'supabase/migrations/20261101180000_expanded_curriculum.sql'), 'utf8')
const assignment = /  additions jsonb := \$curriculum\$([\s\S]*?)\$curriculum\$::jsonb;\nbegin\n/
const match = sql.match(assignment)
if (!match) throw new Error('The release migration payload was not found.')
const payload = match[1]
JSON.parse(payload)
if (payload.includes('$hanzi_part$')) throw new Error('Choose a different SQL payload delimiter.')
const bytes = Buffer.from(payload, 'utf8')
const parts = []
for (let start = 0; start < bytes.length;) {
  let end = Math.min(start + 250_000, bytes.length)
  // Split at a UTF-8 character boundary, including supplementary Han characters.
  while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1
  parts.push(bytes.subarray(start, end).toString('utf8'))
  start = end
}
const checksum = createHash('md5').update(bytes).digest('hex')
const table = 'private.curriculum_20261101180000_upload'
const directory = join(project, 'supabase/sql-editor/expanded-curriculum')
await mkdir(directory, { recursive: true })
const files = []
async function output(name, value) {
  if (Buffer.byteLength(value, 'utf8') > 260_000) throw new Error(`SQL Editor upload too large: ${name}`)
  await writeFile(join(directory, name), value)
  files.push(name)
}
await output('01_prepare.sql', `-- Run each numbered file separately in Supabase SQL Editor, in order.
-- Do not deploy the new frontend until the final apply step succeeds.
begin;
do $$ begin
  if to_regclass('public.platform_catalog') is null then
    raise exception 'Apply the platform content administration migration first.';
  end if;
end; $$;
create table if not exists ${table} (
  part integer primary key check (part > 0),
  payload text not null
);
alter table ${table} enable row level security;
revoke all on ${table} from public, anon, authenticated;
commit;
`)
for (const [index, part] of parts.entries()) {
  await output(`${String(index + 2).padStart(2, '0')}_payload_${String(index + 1).padStart(2, '0')}.sql`, `-- Private upload ${index + 1} of ${parts.length}; no live curriculum changes yet.
begin;
insert into ${table}(part,payload)
values (${index + 1},$hanzi_part$${part}$hanzi_part$)
on conflict (part) do update set payload=excluded.payload;
commit;
`)
}
let apply = sql.replace(assignment, `  additions jsonb;
begin
  perform private.content_assert((select count(*)=${parts.length} and min(part)=1 and max(part)=${parts.length} and md5(string_agg(payload,'' order by part))='${checksum}' from ${table}), 'Curriculum upload is incomplete or changed. Run all numbered payload files before applying.');
  select string_agg(payload,'' order by part)::jsonb into additions from ${table};
`)
apply = apply.replace('begin;\n', `begin;\nlock table ${table} in exclusive mode;\n`)
apply = apply.replace(/commit;\s*$/, `drop table ${table};\ncommit;\n`)
await output(`${String(parts.length + 2).padStart(2, '0')}_apply.sql`, apply)
await writeFile(join(directory, 'README.md'), `# Expanded curriculum: Supabase SQL Editor alternative

The full migration is too large for some SQL Editor requests. These ${files.length} files apply the same migration through small uploads. Use this alternative **instead of** pasting the original migration; it is not an additional migration.

In the correct Supabase project's SQL Editor, replace the editor contents with **one complete file at a time**, click Run and wait for success before opening the next file:

${files.map((name, index) => `${index + 1}. [${name}](${name})`).join('\n')}

Do not concatenate the files into a single query. Earlier migrations, including platform content administration, must already be applied. Stop on an error and keep the error message; do not skip a failed step. The prepare/payload steps can be repeated to resume an interrupted upload.

Uploads live in a private table that is inaccessible to application roles. Until the final apply step succeeds, the live curriculum is unchanged. That step checks the complete payload checksum and applies the original append-only merge and validation in one transaction. It removes the upload table on success. Existing editor changes, archived records and progress remain preserved.

After the last file succeeds, check:

\`\`\`sql
select revision,
  jsonb_array_length(data->'vocabulary') as vocabulary_entries,
  jsonb_array_length(data->'activities') as activity_revisions
from public.platform_catalog;
\`\`\`

An unmodified catalog has **5,000 words and 37 activity revisions**. Custom content can increase these counts. Then deploy the frontend. Do not rerun the final file alone after success: its upload table has been removed. Repeating the entire numbered sequence is safe and does not duplicate the curriculum.

Generated by \`node scripts/prepare-sql-editor-migration.mjs\` from the checked-in release migration. Keep this release's generated files unchanged after deployment.
`)
console.log(`Prepared ${files.length} SQL Editor files, each below 260 KB, in supabase/sql-editor/expanded-curriculum/.`)
