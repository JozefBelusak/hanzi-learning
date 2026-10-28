import type { UserRole } from '../types/auth'

export const roleLabels: Record<UserRole, string> = { student: 'Student', lecturer: 'Lecturer', admin: 'Admin' }
export function isUserRole(value: unknown): value is UserRole {
  return value === 'student' || value === 'lecturer' || value === 'admin'
}
export function canTeach(role: UserRole): boolean { return role === 'lecturer' || role === 'admin' }
export function roleHome(role: UserRole): 'home' | 'teach' | 'admin' {
  return role === 'admin' ? 'admin' : role === 'lecturer' ? 'teach' : 'home'
}
export function canAccessPage(role: UserRole, page: string): boolean {
  if (page === 'admin') return role === 'admin'
  if (page === 'teach') return canTeach(role)
  return true
}
export function isPublicPage(page: string): boolean {
  return page === 'welcome' || page === 'login' || page === 'register'
}
