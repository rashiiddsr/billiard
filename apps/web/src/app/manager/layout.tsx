'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import DashboardLayout from '@/components/shared/DashboardLayout';

export default function ManagerLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user && user.role === 'CASHIER') {
      router.replace('/cashier/dashboard');
    }
    if (!loading && user && user.role === 'OWNER') {
      // Owner can access manager pages too
    }
  }, [user, loading, router]);

  return <DashboardLayout>{children}</DashboardLayout>;
}
