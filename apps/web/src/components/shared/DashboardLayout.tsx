'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { notificationsApi } from '@/lib/api';
import Sidebar from '@/components/shared/Sidebar';
import toast from 'react-hot-toast';
import Cookies from 'js-cookie';

const roleGreeting: Record<string, string> = {
  OWNER: 'Ringkasan performa bisnis hari ini',
  DEVELOPER: 'Kelola konfigurasi IoT dan manajemen meja',
  MANAGER: 'Pantau operasional dan menu secara real-time',
  CASHIER: 'Semua kebutuhan transaksi ada di sini',
};

const getApiOrigin = () => {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
  try {
    return new URL(apiUrl).origin;
  } catch {
    return 'http://localhost:3001';
  }
};

const resolveProfileImage = (path?: string | null) => {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getApiOrigin()}${normalizedPath}`;
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      const data = await notificationsApi.list({ page: 1, limit: 10 });
      setNotifications(data.data || []);
      setUnreadCount(data.unread || 0);
    } catch {
      // noop
    }
  };

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;

    fetchNotifications();
    const token = Cookies.get('accessToken');
    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connectStream = () => {
      if (!token) return;

      source = new EventSource(`${getApiOrigin()}/api/v1/notifications/stream?access_token=${token}`);
      source.onmessage = () => {
        fetchNotifications();
      };
      source.onerror = () => {
        source?.close();
        reconnectTimer = setTimeout(connectStream, 5000);
      };
    };

    connectStream();
    const fallbackPoll = setInterval(fetchNotifications, 30 * 1000);

    return () => {
      source?.close();
      clearInterval(fallbackPoll);
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [user]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (notifRef.current && !notifRef.current.contains(target)) {
        setNotifOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(target)) {
        setProfileOpen(false);
      }
    };

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNotifOpen(false);
        setProfileOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEsc);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  const handleLogout = async () => {
    await logout();
    toast.success('Berhasil keluar');
    router.push('/login');
  };

  const markAllAsRead = async () => {
    await notificationsApi.markRead();
    await fetchNotifications();
  };

  const profileHref = user ? `/${user.role.toLowerCase()}/profile` : '/login';
  const profileImage = resolveProfileImage(user?.profileImageUrl);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sky-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-violet-100 text-slate-800">
      <Sidebar collapsed={collapsed} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className={`flex min-h-screen flex-1 flex-col transition-all ${collapsed ? 'md:ml-24' : 'md:ml-72'}`}>
        <header className="sticky top-0 z-30 border-b border-white/70 bg-white/85 backdrop-blur-xl">
          <div className="flex items-center justify-between px-4 py-3 md:px-6">
            <div className="flex items-center gap-3">
              <button
                onClick={() => (window.innerWidth >= 768 ? setCollapsed((v) => !v) : setMobileOpen(true))}
                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 shadow-sm transition hover:bg-slate-50"
                aria-label="Toggle sidebar"
              >
                <HamburgerIcon />
              </button>
              <div>
                <p className="text-sm font-semibold text-blue-700">Selamat datang, {user.name.split(' ')[0]} 👋</p>
                <p className="text-xs text-slate-500">{roleGreeting[user.role] || 'Dashboard operasional billiard'}</p>
              </div>
            </div>

            <div className="relative flex items-center gap-2">
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => {
                    setNotifOpen((v) => !v);
                    setProfileOpen(false);
                  }}
                  className="relative rounded-xl border border-slate-200 bg-white p-2 text-slate-600 shadow-sm hover:bg-slate-50"
                >
                  <BellIcon />
                  {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
                {notifOpen && (
                  <div className="absolute right-0 mt-2 w-[calc(100vw-1.5rem)] max-w-96 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-700">Notifikasi</p>
                      <button onClick={markAllAsRead} className="text-xs text-sky-600 hover:text-sky-800">Tandai semua dibaca</button>
                    </div>
                    <div className="max-h-80 space-y-2 overflow-auto">
                      {notifications.length === 0 ? (
                        <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-500">Belum ada notifikasi.</p>
                      ) : notifications.map((item) => (
                        <div key={item.id} className={`rounded-xl border p-2 ${item.isRead ? 'bg-slate-50 border-slate-100' : 'bg-sky-50 border-sky-100'}`}>
                          <p className="text-sm font-medium text-slate-700">{item.title}</p>
                          <p className="text-xs text-slate-600">{item.message}</p>
                          <p className="text-[11px] text-slate-400">{new Date(item.createdAt).toLocaleString('id-ID')}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="relative" ref={profileRef}>
                <button
                  onClick={() => {
                    setProfileOpen((v) => !v);
                    setNotifOpen(false);
                  }}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm hover:bg-slate-50"
                >
                  {profileImage ? (
                    <img src={profileImage} alt={user.name} className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-cyan-500 text-xs font-bold text-white">
                      {user.name?.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="hidden text-left md:block">
                    <p className="text-sm font-semibold leading-none">{user.name}</p>
                    <p className="text-xs text-slate-500">{user.role}</p>
                  </div>
                  <ChevronDownIcon />
                </button>
                {profileOpen && (
                  <div className="absolute right-0 mt-2 w-[calc(100vw-1.5rem)] max-w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
                    <p className="text-sm font-semibold text-slate-800">{user.name}</p>
                    <p className="mb-3 text-xs text-slate-500">{user.email}</p>
                    <button onClick={() => router.push(profileHref)} className="mb-2 w-full rounded-xl bg-sky-50 px-3 py-2 text-sm font-medium text-sky-700 hover:bg-sky-100">
                      Manajemen Profil
                    </button>
                    <button onClick={handleLogout} className="w-full rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-100">
                      Keluar
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-auto px-2 py-4 md:px-6">{children}</main>
      </div>
    </div>
  );
}

function HamburgerIcon() {
  return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>;
}

function BellIcon() {
  return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .53-.21 1.04-.59 1.41L4 17h5m6 0a3 3 0 11-6 0m6 0H9" /></svg>;
}

function ChevronDownIcon() {
  return <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>;
}
