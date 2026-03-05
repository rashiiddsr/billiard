'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import Cookies from 'js-cookie';
import { authApi, refreshAuthSession, clearAuthStorage } from './api';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'OWNER' | 'DEVELOPER' | 'MANAGER' | 'CASHIER';
  phoneNumber?: string;
  profileImageUrl?: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isOwner: boolean;
  isDeveloper: boolean;
  isManager: boolean;
  isCashier: boolean;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const ACCESS_COOKIE_EXP_DAYS = 8 / 24; // 8 jam
const REFRESH_COOKIE_EXP_DAYS = 30;    // 30 hari

const getCookieOptions = () => ({
  sameSite: 'strict' as const,
  secure: typeof window !== 'undefined' ? window.location.protocol === 'https:' : false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const bootstrapAuth = async () => {
      // Coba load user dari cookie dulu agar UI langsung muncul
      const stored = Cookies.get('user');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (mounted) setUser(parsed);
        } catch {
          Cookies.remove('user');
        }
      }

      const accessToken = Cookies.get('accessToken');
      const refreshToken = Cookies.get('refreshToken');

      // Tidak ada token sama sekali → tidak perlu fetch apapun
      if (!accessToken && !refreshToken) {
        if (mounted) setLoading(false);
        return;
      }

      // Access token habis tapi refresh token masih ada → refresh dulu
      if (!accessToken && refreshToken) {
        try {
          await refreshAuthSession();
        } catch {
          // Refresh token juga expired → biarkan, interceptor redirect ke login saat request berikutnya
        }
      }

      // Ambil data user terbaru dari server kalau belum ada di cookie
      if (Cookies.get('accessToken') && !stored) {
        try {
          const me = await authApi.me();
          if (mounted) {
            setUser(me);
            Cookies.set('user', JSON.stringify(me), { expires: REFRESH_COOKIE_EXP_DAYS, ...getCookieOptions() });
          }
        } catch {
          // Biarkan interceptor handle
        }
      }

      if (mounted) setLoading(false);
    };

    bootstrapAuth();
    return () => { mounted = false; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await authApi.login(email, password);
    Cookies.set('accessToken', data.accessToken, { expires: ACCESS_COOKIE_EXP_DAYS, ...getCookieOptions() });
    Cookies.set('refreshToken', data.refreshToken, { expires: REFRESH_COOKIE_EXP_DAYS, ...getCookieOptions() });
    Cookies.set('user', JSON.stringify(data.user), { expires: REFRESH_COOKIE_EXP_DAYS, ...getCookieOptions() });
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    const rt = Cookies.get('refreshToken');
    try { if (rt) await authApi.logout(rt); } catch {}
    clearAuthStorage();
    setUser(null);
  }, []);

  const setAndPersistUser = useCallback((nextUser: User) => {
    Cookies.set('user', JSON.stringify(nextUser), { expires: REFRESH_COOKIE_EXP_DAYS, ...getCookieOptions() });
    setUser(nextUser);
  }, []);

  // Proactive refresh: cek setiap 30 menit, refresh kalau access token sudah > 7 jam
  useEffect(() => {
    if (!user) return;

    let inFlight = false;

    const tryRefresh = async () => {
      if (inFlight) return;

      // Cukup cek apakah masih ada access token di cookie
      // Kalau tidak ada berarti sudah expire (8 jam) → refresh
      const hasAccess = !!Cookies.get('accessToken');
      const hasRefresh = !!Cookies.get('refreshToken');

      if (!hasAccess && hasRefresh) {
        inFlight = true;
        try {
          await refreshAuthSession();
        } catch {
          // Interceptor akan handle redirect
        } finally {
          inFlight = false;
        }
      }
    };

    // Cek saat tab kembali aktif (misal kasir buka tab lain lama)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void tryRefresh();
    };

    // Cek tiap 30 menit
    const interval = setInterval(tryRefresh, 30 * 60 * 1000);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user]);

  return (
    <AuthContext.Provider value={{
      user, loading, login, logout, setUser: setAndPersistUser,
      isOwner: user?.role === 'OWNER',
      isDeveloper: user?.role === 'DEVELOPER',
      isManager: user?.role === 'MANAGER',
      isCashier: user?.role === 'CASHIER',
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
