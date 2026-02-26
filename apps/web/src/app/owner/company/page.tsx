'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { AxiosError } from 'axios';
import { companyApi } from '@/lib/api';
import { useCompany } from '@/lib/company';

const logoNote = 'Rekomendasi logo: format PNG/SVG, rasio 1:1, minimal 512x512px agar optimal untuk sidebar, favicon, dan elemen UI lainnya.';

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
  return `${getApiOrigin()}${path.startsWith('/') ? path : `/${path}`}`;
};

export default function OwnerCompanyPage() {
  const { refreshCompany } = useCompany();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const logoPreview = useMemo(() => (logoFile ? URL.createObjectURL(logoFile) : resolveImageUrl(logoUrl)), [logoFile, logoUrl]);

  useEffect(() => {
    const load = async () => {
      try {
        const profile = await companyApi.getProfile();
        setName(profile.name || '');
        setAddress(profile.address || '');
        setPhoneNumber(profile.phoneNumber || '');
        setLogoUrl(profile.logoUrl || null);
      } catch {
        toast.error('Gagal memuat data perusahaan');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  useEffect(() => {
    return () => {
      if (logoFile && logoPreview?.startsWith('blob:')) {
        URL.revokeObjectURL(logoPreview);
      }
    };
  }, [logoFile, logoPreview]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const updated = await companyApi.updateProfile({ name: name.trim() || null, address, phoneNumber });
      let latest = updated;
      if (logoFile) {
        const formData = new FormData();
        formData.append('logo', logoFile);
        latest = await companyApi.uploadLogo(formData);
        setLogoFile(null);
      }
      setLogoUrl(latest.logoUrl || null);
      await refreshCompany();
      toast.success('Data perusahaan berhasil disimpan');
    } catch (error) {
      const message = error instanceof AxiosError ? error.response?.data?.message : null;
      toast.error(Array.isArray(message) ? message[0] : message || 'Gagal menyimpan data perusahaan');
    } finally {
      setSaving(false);
    }
  };

  const resetLogo = async () => {
    setSaving(true);
    try {
      const updated = await companyApi.resetLogo();
      setLogoUrl(updated.logoUrl || null);
      setLogoFile(null);
      await refreshCompany();
      toast.success('Logo dikembalikan ke default');
    } catch {
      toast.error('Gagal reset logo');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="rounded-2xl bg-white p-6 shadow-sm">Memuat data perusahaan...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-slate-800">Data Perusahaan</h1>
        <p className="mb-6 text-sm text-slate-500">Atur nama perusahaan, alamat, nomor HP, dan logo aplikasi.</p>

        <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">Nama Perusahaan</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2" placeholder="Contoh: V-Luxe Billiard" />
            <p className="mt-1 text-xs text-slate-500">Jika dikosongkan, nama aplikasi otomatis: Billiard Club OS.</p>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">Alamat</label>
            <textarea value={address} onChange={(e) => setAddress(e.target.value)} className="min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2" required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Nomor HP</label>
            <input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2" required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Logo Perusahaan</label>
            <input type="file" accept="image/png,image/jpeg,image/svg+xml" className="w-full rounded-xl border border-slate-300 px-3 py-2" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} />
            <p className="mt-1 text-xs text-slate-500">{logoNote}</p>
          </div>

          <div className="md:col-span-2 flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              {logoPreview ? <img src={logoPreview} alt="Logo perusahaan" className="h-full w-full object-cover" /> : <span className="text-xs text-slate-500">Default</span>}
            </div>
            <button type="button" onClick={resetLogo} disabled={saving} className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
              Reset Logo
            </button>
          </div>

          <div className="md:col-span-2">
            <button disabled={saving} className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60">
              {saving ? 'Menyimpan...' : 'Simpan Data Perusahaan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
