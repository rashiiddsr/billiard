'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { companyApi } from './api';

const DEFAULT_APP_NAME = 'Billiard Club OS';

const getApiOrigin = () => {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
  try {
    return new URL(apiUrl).origin;
  } catch {
    return 'http://localhost:3001';
  }
};

const resolveImageUrl = (path?: string | null) => {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getApiOrigin()}${normalizedPath}`;
};

interface CompanyProfile {
  name: string | null;
  address: string;
  phoneNumber: string;
  logoUrl: string | null;
}

interface CompanyContextType {
  company: CompanyProfile | null;
  appName: string;
  logoUrl: string | null;
  refreshCompany: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextType | null>(null);

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const [company, setCompany] = useState<CompanyProfile | null>(null);

  const refreshCompany = async () => {
    try {
      const data = await companyApi.getProfile();
      setCompany(data);
    } catch {
      // noop
    }
  };

  useEffect(() => {
    refreshCompany();
  }, []);

  const appName = company?.name?.trim() || DEFAULT_APP_NAME;
  const logoUrl = resolveImageUrl(company?.logoUrl);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.title = appName;

    const iconHref = logoUrl || '/favicon.svg';
    const linkRels = ['icon', 'shortcut icon', 'apple-touch-icon'];
    linkRels.forEach((rel) => {
      let link = document.querySelector(`link[rel='${rel}']`) as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement('link');
        link.rel = rel;
        document.head.appendChild(link);
      }
      link.href = iconHref;
    });
  }, [appName, logoUrl]);

  const value = useMemo(() => ({ company, appName, logoUrl, refreshCompany }), [company, appName, logoUrl]);

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}

export function useCompany() {
  const context = useContext(CompanyContext);
  if (!context) throw new Error('useCompany must be used within CompanyProvider');
  return context;
}
