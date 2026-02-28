'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import Cookies from 'js-cookie';
import { authApi, refreshAuthSession } from './api';

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
const ACCESS_COOKIE_EXP_DAYS = 1 / 24; // 1 jam
const REFRESH_COOKIE_EXP_DAYS = 30;

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
          if (mounted) {
            setUser(parsed);
          }
        } catch {
          Cookies.remove('user');
        }
      }

      const token = Cookies.get('accessToken');
      const refreshToken = Cookies.get('refreshToken');

      if (!token && refreshToken) {
        try {
          await refreshAuthSession();
        } catch {
          // tetap lanjut, kemungkinan refresh token memang sudah tidak valid
        }
      }

      if (Cookies.get('accessToken')) {
        try {
          const me = await authApi.me();
          if (mounted) {
            setUser(me);
            Cookies.set('user', JSON.stringify(me), { expires: REFRESH_COOKIE_EXP_DAYS, ...getCookieOptions() });
          }
        } catch {
          // biarkan interceptor menangani jika benar-benar tidak valid
        }
      }

      if (mounted) {
        setLoading(false);
      }
    };

    bootstrapAuth();

    return () => {
      mounted = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await authApi.login(email, password);
    Cookies.set('accessToken', data.accessToken, { expires: ACCESS_COOKIE_EXP_DAYS, ...getCookieOptions() });
    Cookies.set('refreshToken', data.refreshToken, { expires: REFRESH_COOKIE_EXP_DAYS, ...getCookieOptions() });
    Cookies.set('user', JSON.stringify(data.user), { expires: REFRESH_COOKIE_EXP_DAYS, ...getCookieOptions() });
    Cookies.set('loginAt', new Date().toISOString(), { expires: REFRESH_COOKIE_EXP_DAYS, ...getCookieOptions() });
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    const rt = Cookies.get('refreshToken');
    try { if (rt) await authApi.logout(rt); } catch {}
    Cookies.remove('accessToken');
    Cookies.remove('refreshToken');
    Cookies.remove('loginAt');
    Cookies.remove('user');
    setUser(null);
  }, []);

  const setAndPersistUser = useCallback((nextUser: User) => {
    Cookies.set('user', JSON.stringify(nextUser), { expires: REFRESH_COOKIE_EXP_DAYS, ...getCookieOptions() });
    setUser(nextUser);
  }, []);

  useEffect(() => {
    if (!user) return;

    const keepSessionAlive = async () => {
      try {
        await refreshAuthSession();
        const me = await authApi.me();
        setAndPersistUser(me);
      } catch {
        // hindari logout tiba-tiba saat network bermasalah
      }
    };

    const interval = setInterval(keepSessionAlive, 10 * 60 * 1000);
    const visibilityListener = () => {
      if (document.visibilityState === 'visible') {
        void keepSessionAlive();
      }
    };

    document.addEventListener('visibilitychange', visibilityListener);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', visibilityListener);
    };
  }, [user, setAndPersistUser]);

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
