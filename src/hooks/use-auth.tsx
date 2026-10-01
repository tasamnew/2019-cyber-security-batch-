'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Role, UserStatus } from '@prisma/client';

/**
 * Client-side session context.
 *
 * The server is always the authority on auth; this context only caches who the
 * current user is so the navbar can render without an extra round trip, and
 * exposes helpers that refresh it after login/logout.
 */

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  bio: string | null;
  avatarSeed: string;
}

interface AuthContextValue {
  user: SessionUser | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  /** Client-side display of the permission ladder; server still enforces. */
  can: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const RANK: Record<Role, number> = { GUEST: 0, STUDENT: 1, MODERATOR: 2, ADMIN: 3 };

const PERMISSION_FLOOR: Record<string, Role> = {
  'post:create': 'STUDENT',
  'post:edit:any': 'MODERATOR',
  'post:delete:any': 'MODERATOR',
  'post:pin': 'MODERATOR',
  'channel:create': 'MODERATOR',
  'resource:upload': 'STUDENT',
  'resource:delete:any': 'MODERATOR',
  'ctf:create': 'STUDENT',
  'assignment:create': 'STUDENT',
  'announcement:create': 'ADMIN',
  'report:resolve': 'MODERATOR',
  'user:manage:status': 'ADMIN',
  'user:manage:role': 'ADMIN',
  'settings:manage': 'ADMIN',
  'audit:view': 'ADMIN',
  'user:view': 'MODERATOR',
};

export function AuthProvider({
  initialUser,
  children,
}: {
  initialUser: SessionUser | null;
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<SessionUser | null>(initialUser);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      const data = await res.json().catch(() => null);
      setUser(data?.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    router.push('/login');
    router.refresh();
  }, [router]);

  const can = useCallback(
    (permission: string) => {
      if (!user || user.status !== 'APPROVED') return false;
      const floor = PERMISSION_FLOOR[permission];
      return floor ? RANK[user.role] >= RANK[floor] : false;
    },
    [user],
  );

  const value = useMemo(
    () => ({ user, isLoading, refresh, logout, can }),
    [user, isLoading, refresh, logout, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}