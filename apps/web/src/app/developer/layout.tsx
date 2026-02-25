'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import DashboardLayout from '@/components/shared/DashboardLayout';

export default function DeveloperLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user && user.role !== 'DEVELOPER') {
      if (user.role === 'OWNER') router.replace('/owner/dashboard');
      else if (user.role === 'MANAGER') router.replace('/manager/dashboard');
      else router.replace('/cashier/dashboard');
    }
  }, [user, loading, router]);

  return <DashboardLayout>{children}</DashboardLayout>;
}
