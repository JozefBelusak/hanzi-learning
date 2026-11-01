import { requireSupabase } from './supabase'
import { installCatalog } from '../data/catalog'
import { parseContentCatalog } from './contentValidation'
import type { CatalogSnapshot, ContentEntity, ContentKind } from './contentMutation'

function snapshot(value: unknown): CatalogSnapshot {
  const result = value as CatalogSnapshot
  if (!result || !Number.isInteger(result.revision) || result.revision < 1) throw new Error('The published catalog response is invalid.')
  return { ...result, data: parseContentCatalog(result.data) }
}
export async function fetchPlatformCatalog(signal?: AbortSignal): Promise<CatalogSnapshot | null> {
  const deadline = signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000)
  const { data, error } = await requireSupabase().rpc('get_platform_catalog').abortSignal(deadline)
  if (error?.code === 'PGRST202' || error?.code === '42883') return null
  if (error) throw error
  return snapshot(data)
}
export async function savePlatformContent(kind: ContentKind, id: string, payload: ContentEntity | null, revision: number): Promise<CatalogSnapshot> {
  const { data, error } = await requireSupabase().rpc('admin_save_platform_content', { entity_kind: kind, entity_id: id, payload, expected_revision: revision }).abortSignal(AbortSignal.timeout(20_000))
  if (error) throw error
  const result = snapshot(data)
  installCatalog(result.data, result.revision)
  return result
}
export function contentError(failure: unknown): string {
  const error = failure as { code?: string; message?: string }
  if (error.code === '42501') return 'Administrator access is required. Your role may have changed; sign in again.'
  if (error.code === '40001') return 'Another administrator changed the catalog. Reload it and review your draft before saving again.'
  if (error.code === 'PGRST202' || error.code === '42883') return 'Apply the platform content administration migration in Supabase before editing content.'
  if (/fetch|network|timeout/i.test(error.message ?? '')) return 'Could not connect to the content service. Your draft is retained; check your connection and retry.'
  if (error.code === '22023' || error.code === '23514' || error instanceof Error) return error.message ?? 'Check the content fields and references.'
  return 'The catalog could not be saved. Check your connection and try again.'
}
