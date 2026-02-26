'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const BilliardIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <circle cx="12" cy="12" r="9" strokeWidth="2" />
    <circle cx="12" cy="12" r="2" strokeWidth="2" />
  </svg>
);

const navByRole: Record<string, NavItem[]> = {
  CASHIER: [
    { label: 'Dashboard', href: '/cashier/dashboard', icon: <HomeIcon /> },
    { label: 'Billing Meja', href: '/cashier/billing', icon: <BilliardIcon /> },
    { label: 'Pesanan F&B', href: '/cashier/orders', icon: <CartIcon /> },
    { label: 'Checkout', href: '/cashier/checkout', icon: <CashIcon /> },
    { label: 'Daftar Transaksi', href: '/cashier/transactions', icon: <LogIcon /> },
    { label: 'Profil', href: '/cashier/profile', icon: <UserIcon /> },
  ],
  OWNER: [
    { label: 'Dashboard', href: '/owner/dashboard', icon: <HomeIcon /> },
    { label: 'Billing Meja', href: '/owner/billing', icon: <BilliardIcon /> },
    { label: 'Laporan Keuangan', href: '/owner/finance', icon: <ChartIcon /> },
    { label: 'Daftar Transaksi', href: '/owner/transactions', icon: <LogIcon /> },
    { label: 'Histori Owner', href: '/owner/history', icon: <LogIcon /> },
    { label: 'Manajemen User', href: '/owner/users', icon: <UserIcon /> },
    { label: 'Manajemen Meja', href: '/owner/tables', icon: <BilliardIcon /> },
    { label: 'Audit Log', href: '/owner/audit', icon: <LogIcon /> },
    { label: 'Profil', href: '/owner/profile', icon: <UserIcon /> },
  ],
  DEVELOPER: [
    { label: 'Dashboard', href: '/developer/dashboard', icon: <HomeIcon /> },
    { label: 'Manajemen Meja', href: '/developer/tables', icon: <BilliardIcon /> },
    { label: 'IoT Configurated', href: '/developer/iot', icon: <ChipIcon /> },
    { label: 'Profil', href: '/developer/profile', icon: <UserIcon /> },
  ],
  MANAGER: [
    { label: 'Dashboard', href: '/manager/dashboard', icon: <HomeIcon /> },
    { label: 'Manajemen Menu', href: '/manager/menu', icon: <MenuIcon /> },
    { label: 'Manajemen Kategori', href: '/manager/menu-categories', icon: <TagIcon /> },
    { label: 'Manajemen Aset', href: '/manager/stock', icon: <BoxIcon /> },
    { label: 'Pengeluaran', href: '/manager/expenses', icon: <WalletIcon /> },
    { label: 'Daftar Transaksi', href: '/manager/transactions', icon: <LogIcon /> },
    { label: 'Profil', href: '/manager/profile', icon: <UserIcon /> },
  ],
};

export default function Sidebar({ collapsed, mobileOpen, onClose }: { collapsed: boolean; mobileOpen: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const navItems = navByRole[user?.role || ''] || [];

  return (
    <>
      {mobileOpen && <div onClick={onClose} className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-sm md:hidden" />}
      <aside
        className={cn(
          'fixed left-0 top-0 z-40 h-screen border-r border-white/80 bg-white/90 shadow-xl backdrop-blur-xl transition-all',
          collapsed ? 'w-20 md:w-24' : 'w-[86vw] max-w-72',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        <div className="border-b border-slate-100 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white">
              <BilliardIcon />
            </div>
            {!collapsed && (
              <div>
                <p className="text-sm font-bold text-slate-800">Billiard POS</p>
                <p className="text-xs text-slate-500">Management System</p>
              </div>
            )}
          </div>
        </div>

        <nav className="space-y-1 p-3">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                  active
                    ? 'bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg'
                    : 'text-slate-600 hover:bg-sky-50 hover:text-sky-700',
                  collapsed && 'justify-center',
                )}
                title={collapsed ? item.label : undefined}
              >
                {item.icon}
                {!collapsed && item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

function HomeIcon() { return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>; }
function CartIcon() { return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>; }
function CashIcon() { return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>; }
function ChartIcon() { return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>; }
function UserIcon() { return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>; }
function LogIcon() { return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>; }
function MenuIcon() { return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>; }
function BoxIcon() { return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>; }
function TagIcon() { return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h7l5 5-7 7-5-5V7z" /><circle cx="10" cy="10" r="1.5" /></svg>; }
function WalletIcon() { return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>; }
function ChipIcon() { return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M3 9h2m14 0h2M3 15h2m14 0h2M7 7h10v10H7V7z" /></svg>; }
