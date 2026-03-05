'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import Cookies from 'js-cookie';
import { authApi, refreshAuthSession, clearAuthStorage, redirectToLogin, isAccessTokenNearExpiry } from './api';

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

// BUG FIX #3a: Sesuaikan cookie expiry dengan JWT lifetime yang sebenarnya
const ACCESS_COOKIE_EXP_DAYS = 15 / (24 * 60); // 15 menit
const REFRESH_COOKIE_EXP_DAYS = 7;              // 7 hari

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

      // BUG FIX #3g: Kalau access token tidak ada tapi refresh token ada → refresh dulu
      if (!accessToken && refreshToken) {
        try {
          await refreshAuthSession();
        } catch {
          // Refresh gagal → auth.tsx sudah redirect ke login via refreshAuthSession
        }
      }

      // BUG FIX #3h: Kalau token ada tapi sudah near expiry saat buka tab → refresh proaktif
      if (Cookies.get('accessToken') && isAccessTokenNearExpiry()) {
        try {
          await refreshAuthSession();
        } catch {
          // Biarkan interceptor handle
        }
      }

      if (Cookies.get('accessToken') && !stored) {
        try {
          const me = await authApi.me();
          if (mounted) {
            setUser(me);
            Cookies.set('user', JSON.stringify(me), { expires: REFRESH_COOKIE_EXP_DAYS, ...getCookieOptions() });
          }
        } catch {
          // interceptor akan handle 401
        }
      }

      if (mounted) setLoading(false);
    };

    bootstrapAuth();
    return () => { mounted = false; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await authApi.login(email, password);
    const now = new Date().toISOString();
    Cookies.set('accessToken', data.accessToken, { expires: ACCESS_COOKIE_EXP_DAYS, ...getCookieOptions() });
    Cookies.set('refreshToken', data.refreshToken, { expires: REFRESH_COOKIE_EXP_DAYS, ...getCookieOptions() });
    Cookies.set('user', JSON.stringify(data.user), { expires: REFRESH_COOKIE_EXP_DAYS, ...getCookieOptions() });
    Cookies.set('loginAt', now, { expires: REFRESH_COOKIE_EXP_DAYS, ...getCookieOptions() });
    // BUG FIX #3d: Simpan tokenIssuedAt setiap login dan refresh
    Cookies.set('tokenIssuedAt', now, { expires: REFRESH_COOKIE_EXP_DAYS, ...getCookieOptions() });
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

  // BUG FIX #3i: Proactive refresh setiap 12 menit (sebelum 15 menit JWT expire)
  // Sebelumnya: interval 5 menit tapi threshold 55 menit — tidak pernah refresh tepat waktu!
  useEffect(() => {
    if (!user) return;

    let inFlight = false;

    const doProactiveRefresh = async () => {
      if (inFlight) return;
      // Hanya refresh kalau token memang sudah near expiry
      if (!isAccessTokenNearExpiry()) return;

      inFlight = true;
      try {
        await refreshAuthSession();
      } catch {
        // Interceptor akan handle redirect ke login jika refresh gagal
      } finally {
        inFlight = false;
      }
    };

    // Cek saat tab kembali aktif
    const visibilityListener = () => {
      if (document.visibilityState === 'visible') {
        void doProactiveRefresh();
      }
    };

    // BUG FIX: Interval 3 menit (sebelumnya 5 menit tapi threshold salah)
    // Proactive refresh akan terjadi di menit ke-13 (sebelum token expire di menit ke-15)
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void doProactiveRefresh();
      }
    }, 3 * 60 * 1000); // cek tiap 3 menit

    document.addEventListener('visibilitychange', visibilityListener);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', visibilityListener);
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
