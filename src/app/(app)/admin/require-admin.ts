import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';

/** Guard for admin tabs: moderators and admins only, bounced otherwise. */
export async function requireAdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'ADMIN' && user.role !== 'MODERATOR') redirect('/dashboard');
  return user;
}

/** Guard for admin-only tabs (roles, settings, audit). */
export async function requireAdminOnlyPage() {
  const user = await requireAdminPage();
  if (user.role !== 'ADMIN') redirect('/admin');
  return user;
}