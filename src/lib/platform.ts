import { requireSupabase } from './supabase'
import type { Classroom, ClassroomMember, PublicLesson, UserProfile, UserRole } from '../types/auth'

export function platformError(error: unknown): string {
  const failure = error as { code?: string; message?: string }
  if (failure.code === '42501' || failure.code === 'PGRST116') return 'You do not have permission for this action. Refresh the page if your role has changed.'
  if (failure.code === 'P0001') return failure.message ?? 'The action is not available.'
  if (/fetch|network/i.test(failure.message ?? '')) return 'Could not connect. Please try again.'
  return 'The action could not be completed. Please try again.'
}

export async function listLessons(publishedOnly = false): Promise<PublicLesson[]> {
  let query = requireSupabase().from('public_lessons').select('*').order('created_at', { ascending: false })
  if (publishedOnly) query = query.eq('published', true)
  const { data, error } = await query
  if (error) throw error
  return data as PublicLesson[]
}
export async function findLesson(id: string): Promise<PublicLesson> {
  const { data, error } = await requireSupabase().from('public_lessons').select('*').eq('id', id).single()
  if (error) throw error
  return data as PublicLesson
}
export type LessonDraft = Pick<PublicLesson, 'title' | 'summary' | 'content' | 'published'>
export async function saveLesson(draft: LessonDraft, id?: string): Promise<void> {
  const table = requireSupabase().from('public_lessons')
  const result = id ? await table.update(draft).eq('id', id).select('id').single() : await table.insert(draft).select('id').single()
  if (result.error) throw result.error
}
export async function deleteLesson(id: string): Promise<void> {
  const { error } = await requireSupabase().from('public_lessons').delete().eq('id', id).select('id').single()
  if (error) throw error
}
export async function listClassrooms(): Promise<Classroom[]> {
  const { data, error } = await requireSupabase().from('classrooms').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data as Classroom[]
}
export async function createClassroom(name: string): Promise<void> {
  const { error } = await requireSupabase().from('classrooms').insert({ name: name.trim() })
  if (error) throw error
}
export async function removeClassroom(id: string): Promise<void> {
  const { error } = await requireSupabase().from('classrooms').delete().eq('id', id).select('id').single()
  if (error) throw error
}
export async function joinClassroom(invitation: string): Promise<void> {
  const { error } = await requireSupabase().rpc('join_classroom', { invitation: invitation.trim() })
  if (error) throw error
}
export async function listMembers(classroomId: string): Promise<{ membership: ClassroomMember; profile: UserProfile }[]> {
  const { data, error } = await requireSupabase().from('classroom_members').select('*').eq('classroom_id', classroomId)
  if (error) throw error
  const members = data as ClassroomMember[]
  if (!members.length) return []
  const profiles = await requireSupabase().from('profiles').select('*').in('id', members.map((member) => member.student_id))
  if (profiles.error) throw profiles.error
  return members.flatMap((membership) => {
    const profile = (profiles.data as UserProfile[]).find((person) => person.id === membership.student_id)
    return profile ? [{ membership, profile }] : []
  })
}
export async function removeMember(classroomId: string, studentId: string): Promise<void> {
  const { error } = await requireSupabase().from('classroom_members').delete().eq('classroom_id', classroomId).eq('student_id', studentId).select('student_id').single()
  if (error) throw error
}
export async function listUsers(): Promise<UserProfile[]> {
  const { data, error } = await requireSupabase().from('profiles').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data as UserProfile[]
}
export async function changeRole(userId: string, role: UserRole): Promise<void> {
  const { error } = await requireSupabase().rpc('set_user_role', { target_user: userId, new_role: role })
  if (error) throw error
}
