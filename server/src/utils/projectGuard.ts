import { supabaseAdmin } from '../config/supabase'
import { ApiError } from './ApiError'

/**
 * Service role bypasses RLS, so backend services that accept a `proje_id` query
 * parameter must explicitly enforce project scope. These helpers centralize the
 * checks so individual services stay terse and consistent.
 */

/**
 * Throws 403 if the given user is not a member of the given project.
 * Use this in endpoints that already authenticate the user when you need to
 * confirm cross-project authorization beyond the URL parameter.
 */
export async function assertProjectMember(userId: string, projeId: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from('proje_uyelikleri')
    .select('user_id')
    .eq('user_id', userId)
    .eq('proje_id', projeId)
    .maybeSingle()
  if (!data) throw ApiError.forbidden('Bu projeye erişiminiz yok')
}

/**
 * Returns the list of project ids the given user is a member of.
 * Useful when filtering a multi-project list down to allowed scopes.
 */
export async function getAllowedProjeIds(userId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('proje_uyelikleri')
    .select('proje_id')
    .eq('user_id', userId)
  return data?.map((r: { proje_id: string }) => r.proje_id) ?? []
}

/**
 * Asserts that a `proje_id` value was supplied and is a non-empty string.
 * Returns the validated value so callers can chain it directly into queries.
 *
 * Rejects the literal strings 'null' and 'undefined' which sometimes leak in
 * via query strings.
 */
export function requireProjeId(projeId: string | undefined | null): string {
  if (!projeId || typeof projeId !== 'string') {
    throw ApiError.badRequest('proje_id zorunludur')
  }
  const trimmed = projeId.trim()
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') {
    throw ApiError.badRequest('proje_id zorunludur')
  }
  return trimmed
}
