'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import Cookies from 'js-cookie';
import { authApi } from './api';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'OWNER' | 'DEVELOPER' | 'MANAGER' | 'CASHIER';
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = Cookies.get('user');
    if (stored) {
      try { setUser(JSON.parse(stored)); } catch {}
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await authApi.login(email, password);
    Cookies.set('accessToken', data.accessToken, { expires: 1 / 96 });
    Cookies.set('refreshToken', data.refreshToken, { expires: 7 });
    Cookies.set('user', JSON.stringify(data.user), { expires: 7 });
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    const rt = Cookies.get('refreshToken');
    try { if (rt) await authApi.logout(rt); } catch {}
    Cookies.remove('accessToken');
    Cookies.remove('refreshToken');
    Cookies.remove('user');
    setUser(null);
  }, []);

  const setAndPersistUser = useCallback((nextUser: User) => {
    Cookies.set('user', JSON.stringify(nextUser), { expires: 7 });
    setUser(nextUser);
  }, []);

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
