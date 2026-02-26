'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AxiosError } from 'axios';
import toast from 'react-hot-toast';
import { usersApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1').replace('/api/v1', '');

const resolveProfileImage = (path?: string | null) => {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${API_ORIGIN}${path}`;
};

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const photoUrl = useMemo(() => resolveProfileImage(user?.profileImageUrl), [user?.profileImageUrl]);

  useEffect(() => {
    const load = async () => {
      try {
        const profile = await usersApi.getMyProfile();
        setName(profile.name || '');
        setEmail(profile.email || '');
        setActivityLogs(profile.activityLogs || []);
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

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload: any = { name, email };
      if (password.trim()) {
        payload.password = password;
      }

      const updated = await usersApi.updateMyProfile(payload);
      if (user) {
        setUser({ ...user, name: updated.name, email: updated.email, profileImageUrl: updated.profileImageUrl });
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

  const uploadPhoto = async (file?: File) => {
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

    const formData = new FormData();
    formData.append('photo', file);

    setUploading(true);
    try {
      const updated = await usersApi.uploadMyPhoto(formData);
      if (user) {
        setUser({ ...user, profileImageUrl: updated.profileImageUrl, name: updated.name, email: updated.email });
      }
      toast.success('Foto profil berhasil diupload');
    } catch {
      toast.error('Gagal upload foto profil');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return <div className="rounded-2xl bg-white p-6 shadow-sm">Memuat profil...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-slate-800">Profil Saya</h1>
        <p className="mb-6 text-sm text-slate-500">Kelola nama, email, password, foto profil, dan aktivitas akun Anda.</p>

        <div className="mb-6 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
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
            onChange={(event) => uploadPhoto(event.target.files?.[0])}
          />
          <p className="text-xs text-slate-500">Klik lingkaran untuk upload dari galeri/file. Maksimal 5MB (JPG/PNG).</p>
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

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-slate-800">Activity Log Saya</h2>
        <div className="space-y-2">
          {activityLogs.length === 0 && <p className="text-sm text-slate-500">Belum ada aktivitas.</p>}
          {activityLogs.map((log) => (
            <div key={log.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-700">{log.action} • {log.entity}</p>
              <p className="text-xs text-slate-500">{new Date(log.createdAt).toLocaleString('id-ID')}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
