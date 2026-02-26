'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AxiosError } from 'axios';
import toast from 'react-hot-toast';
import { usersApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';

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

const todayDate = () => new Date().toISOString().slice(0, 10);

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logLoading, setLogLoading] = useState(false);
  const [showLogModal, setShowLogModal] = useState(false);
  const [logStartDate, setLogStartDate] = useState(todayDate());
  const [logEndDate, setLogEndDate] = useState(todayDate());
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedPhotoPreview = useMemo(
    () => (selectedPhoto ? URL.createObjectURL(selectedPhoto) : null),
    [selectedPhoto],
  );

  const photoUrl = useMemo(
    () => selectedPhotoPreview || resolveProfileImage(user?.profileImageUrl),
    [selectedPhotoPreview, user?.profileImageUrl],
  );

  useEffect(() => {
    return () => {
      if (selectedPhotoPreview) {
        URL.revokeObjectURL(selectedPhotoPreview);
      }
    };
  }, [selectedPhotoPreview]);

  useEffect(() => {
    const load = async () => {
      try {
        const profile = await usersApi.getMyProfile();
        setName(profile.name || '');
        setEmail(profile.email || '');
        if (user) {
          setUser({ ...user, name: profile.name, email: profile.email, profileImageUrl: profile.profileImageUrl });
        }
      } catch {
        toast.error('Gagal memuat profil');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  useEffect(() => {
    if (!showLogModal) return;

    const loadLogs = async () => {
      setLogLoading(true);
      try {
        const profile = await usersApi.getMyProfile({ startDate: logStartDate, endDate: logEndDate });
        setActivityLogs(profile.activityLogs || []);
      } catch {
        toast.error('Gagal memuat activity log');
      } finally {
        setLogLoading(false);
      }
    };

    loadLogs();
  }, [showLogModal, logStartDate, logEndDate]);

  const onSelectPhoto = (file?: File) => {
    if (!file) return;
    const isAllowed = ['image/jpeg', 'image/png'].includes(file.type);
    if (!isAllowed) {
      toast.error('Format file harus JPG/PNG');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Ukuran maksimal file adalah 5MB');
      return;
    }
    setSelectedPhoto(file);
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload: any = { name, email };
      if (password.trim()) {
        payload.password = password;
      }

      const updated = await usersApi.updateMyProfile(payload);
      let latestProfile = updated;

      if (selectedPhoto) {
        const formData = new FormData();
        formData.append('photo', selectedPhoto);
        latestProfile = await usersApi.uploadMyPhoto(formData);
        setSelectedPhoto(null);
      }

      if (user) {
        setUser({
          ...user,
          name: latestProfile.name,
          email: latestProfile.email,
          profileImageUrl: latestProfile.profileImageUrl,
        });
      }

      setPassword('');
      toast.success('Profil berhasil disimpan');
    } catch (error) {
      const message = error instanceof AxiosError ? error.response?.data?.message : null;
      toast.error(Array.isArray(message) ? message[0] : message || 'Gagal menyimpan profil');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="rounded-2xl bg-white p-6 shadow-sm">Memuat profil...</div>;
  }

  return (
    <>
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold text-slate-800">Profil Saya</h1>
          <p className="mb-6 text-sm text-slate-500">Kelola nama, email, password, dan foto profil akun Anda.</p>

          <div className="mb-6 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={saving}
              className="flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100 disabled:opacity-60"
            >
              {photoUrl ? (
                <img src={photoUrl} alt="Foto profil" className="h-full w-full object-cover" />
              ) : (
                <span className="text-3xl font-bold">{user?.name?.slice(0, 2).toUpperCase()}</span>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(event) => onSelectPhoto(event.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => setShowLogModal(true)}
              className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              View Log
            </button>
          </div>

          <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Nama</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2" required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="w-full rounded-xl border border-slate-300 px-3 py-2" required />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700">Password baru (opsional)</label>
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" minLength={6} className="w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="Kosongkan jika tidak diubah" />
            </div>
            <div className="md:col-span-2">
              <button disabled={saving} className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60">
                {saving ? 'Menyimpan...' : 'Simpan Profil'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {showLogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800">Activity Log Saya</h2>
              <button onClick={() => setShowLogModal(false)} className="text-slate-500 hover:text-slate-700">✕</button>
            </div>

            <div className="mb-4 grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Dari Tanggal</label>
                <input type="date" value={logStartDate} onChange={(e) => setLogStartDate(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Sampai Tanggal</label>
                <input type="date" value={logEndDate} onChange={(e) => setLogEndDate(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
              </div>
            </div>

            <div className="space-y-2">
              {logLoading ? (
                <p className="text-sm text-slate-500">Memuat activity log...</p>
              ) : activityLogs.length === 0 ? (
                <p className="text-sm text-slate-500">Belum ada aktivitas pada rentang tanggal ini.</p>
              ) : (
                activityLogs.map((log) => (
                  <div key={log.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <p className="text-sm font-semibold text-slate-700">{log.action} • {log.entity}</p>
                    <p className="text-xs text-slate-500">{new Date(log.createdAt).toLocaleString('id-ID')}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
