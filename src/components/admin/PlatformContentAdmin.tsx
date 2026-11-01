import { useEffect, useState } from 'react'
import { fetchPlatformCatalog, savePlatformContent, contentError } from '../../lib/contentApi'
import { applyContentMutation, entitiesFor, entityTitle, isArchived, type CatalogSnapshot, type ContentEntity, type ContentKind } from '../../lib/contentMutation'
import { installCatalog } from '../../data/catalog'
import { levelLabel, difficultyLabel } from '../../data/taxonomy'
import { allContent, matchesContent } from '../../lib/contentFilter'
import ContentFilters from '../ContentFilters'
import ContentEditor from './ContentEditor'
import './PlatformContentAdmin.css'

const sections = [{ id: 'lesson', label: 'Lessons' }, { id: 'exercise', label: 'Exercises' }, { id: 'grammar', label: 'Grammar topics' }, { id: 'vocabulary', label: 'Vocabulary' }, { id: 'sentence', label: 'Sentence building' }] as const
export default function PlatformContentAdmin() {
  const [snapshot, setSnapshot] = useState<CatalogSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [kind, setKind] = useState<ContentKind | 'overview'>('overview')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(60)
  const [filter, setFilter] = useState(allContent)
  const [showArchived, setShowArchived] = useState(false)
  const [draft, setDraft] = useState<{ kind: ContentKind; value?: ContentEntity; key: string } | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    void fetchPlatformCatalog(controller.signal).then((result) => {
      if (controller.signal.aborted) return
      if (!result) setError('Apply the platform content administration migration in Supabase before editing content.')
      else setSnapshot(result)
    }).catch((failure) => { if (!controller.signal.aborted) setError(contentError(failure)) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])
  async function reload() {
    setBusy(true); setError(null)
    try {
      const result = await fetchPlatformCatalog()
      if (!result) throw new Error('Apply the platform content administration migration in Supabase before editing content.')
      setSnapshot(result); installCatalog(result.data, result.revision)
      setMessage(draft ? 'Catalog reloaded. Your draft is retained; review current content before publishing.' : 'Catalog reloaded.')
    } catch (failure) { setError(contentError(failure)) }
    finally { setBusy(false) }
  }
  async function save(value: ContentEntity) {
    if (!snapshot || !draft || busy) return
    setBusy(true); setError(null); setMessage('')
    try {
      applyContentMutation(snapshot.data, draft.kind, value.id, value)
      const result = await savePlatformContent(draft.kind, value.id, value, snapshot.revision)
      setSnapshot(result); setDraft(null); setMessage('Content published. Learners will receive it when opening or refreshing the catalog.')
    } catch (failure) { setError(contentError(failure)) }
    finally { setBusy(false) }
  }
  async function archive(item: ContentEntity, targetKind: ContentKind) {
    if (!snapshot || busy || !window.confirm(`Archive “${entityTitle(item)}”? It will leave active learning, while historical content and learner results are retained.`)) return
    setBusy(true); setError(null); setMessage('')
    try {
      applyContentMutation(snapshot.data, targetKind, item.id, null)
      setSnapshot(await savePlatformContent(targetKind, item.id, null, snapshot.revision))
      setMessage('Content archived. Historical learner progress is retained.')
    } catch (failure) { setError(contentError(failure)) }
    finally { setBusy(false) }
  }
  function choose(next: ContentKind | 'overview') {
    if (draft && !window.confirm('Leave this unsaved draft?')) return
    setKind(next); setLimit(60); setDraft(null); setQuery(''); setError(null); setMessage(''); setFilter(allContent)
  }
  const items = snapshot && kind !== 'overview' ? entitiesFor(snapshot.data, kind).filter((item) => (showArchived || !isArchived(item)) && matchesContent(item, filter) && `${entityTitle(item)} ${item.id}`.toLowerCase().includes(query.toLowerCase().trim())) : []
  return <section className="platform-content-admin" aria-label="Platform content administration">
    <div className="management-heading"><div><h2>Platform content</h2><p>Publish curriculum changes without changing application code. Lecturer public lessons are managed separately.</p></div><button type="button" className="secondary-btn" disabled={busy || loading} onClick={() => void reload()}>Reload catalog</button></div>
    {loading && <p role="status">Loading platform content…</p>}
    {error && <p className="error-message" role="alert">{error}</p>}{message && <p className="status-message" role="status">{message}</p>}
    {snapshot && <><p className="admin-revision">Catalog revision {snapshot.revision} · Updated {new Date(snapshot.updated_at).toLocaleString('en-GB')}</p><nav className="admin-content-tabs" aria-label="Platform content sections"><button type="button" aria-current={kind === 'overview' ? 'page' : undefined} onClick={() => choose('overview')}>Dashboard</button>{sections.map((item) => <button type="button" key={item.id} aria-current={kind === item.id ? 'page' : undefined} onClick={() => choose(item.id)}>{item.label}</button>)}</nav>
      {kind === 'overview' ? <><div className="admin-summary-grid">{sections.map((item) => <button type="button" className="card-surface admin-summary" key={item.id} onClick={() => choose(item.id)}><strong>{entitiesFor(snapshot.data, item.id).filter((entity) => !isArchived(entity)).length}</strong><span>{item.label}</span></button>)}</div><section className="card-surface"><h3>Content by language level</h3>{snapshot.data.taxonomy.languageLevels.map((level) => <p key={level.id}>{level.label}: {entitiesFor(snapshot.data, 'lesson').filter((item) => !isArchived(item) && item.languageLevel === level.id).length} lessons · {snapshot.data.vocabulary.filter((item) => !item.archived && item.languageLevel === level.id).length} words</p>)}</section></> : <><div className="management-heading"><h3>{sections.find((item) => item.id === kind)!.label}</h3><button type="button" disabled={busy || !!draft} onClick={() => { setDraft({ kind, key: crypto.randomUUID() }); setError(null); setMessage('') }}>Create {kind === 'vocabulary' ? 'word' : kind === 'grammar' ? 'grammar topic' : kind}</button></div>
        {draft ? <ContentEditor key={draft.key} kind={draft.kind} pack={snapshot.data} existing={draft.value} busy={busy} onSave={(value) => void save(value)} onCancel={() => { if (window.confirm('Discard this unsaved draft?')) setDraft(null) }} /> : <><div className="admin-list-tools"><label htmlFor="admin-content-search">Search content<input id="admin-content-search" type="search" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(60) }} /></label><label className="checkbox-field"><input type="checkbox" checked={showArchived} onChange={(event) => { setShowArchived(event.target.checked); setLimit(60) }} />Include archived content</label></div><ContentFilters id="admin-content" value={filter} onChange={(next) => { setFilter(next); setLimit(60) }} /><p>{items.length} items{items.length > limit ? ` · Showing ${limit}; search or load more.` : ''}</p><ul className="management-list admin-content-list">{items.slice(0, limit).map((item) => <li key={item.id}><div><strong>{entityTitle(item)}</strong><small>{levelLabel(item.languageLevel)} · {difficultyLabel(item.difficulty)} · {isArchived(item) ? 'Archived' : 'Published'}{'revision' in item ? ` · revision ${item.revision}` : ''}</small></div><div className="action-row"><button className="secondary-btn" type="button" disabled={busy} aria-label={`${isArchived(item) ? 'Restore' : 'Edit'} ${entityTitle(item)}`} onClick={() => { setDraft({ kind, value: item, key: crypto.randomUUID() }); setError(null); setMessage('') }}>{isArchived(item) ? 'Restore' : 'Edit'}</button>{!isArchived(item) && <button type="button" className="text-btn" disabled={busy} aria-label={`Archive ${entityTitle(item)}`} onClick={() => void archive(item, kind)}>Archive</button>}</div></li>)}</ul>{items.length > limit && <button type="button" className="secondary-btn" onClick={() => setLimit((value) => value + 60)}>Load more content</button>}{!items.length && <p>No matching content. Create an item or change the filters.</p>}</>}
      </>}
    </>}
  </section>
}
