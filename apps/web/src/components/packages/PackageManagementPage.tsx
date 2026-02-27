'use client';

import { useEffect, useState } from 'react';
import { menuApi, packagesApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';

const emptyForm = { name: '', durationMinutes: 120, price: 0, isActive: true, items: [{ type: 'BILLING', quantity: 1, unitPrice: 0 }] as any[] };

export default function PackageManagementPage() {
  const [data, setData] = useState<any[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [form, setForm] = useState<any>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = async () => {
    const [pkg, menu] = await Promise.all([packagesApi.list(), menuApi.list({ limit: 200 })]);
    setData(pkg || []);
    setMenuItems(menu.data || []);
  };

  useEffect(() => { load().catch(() => undefined); }, []);

  const submit = async () => {
    try {
      if (editingId) await packagesApi.update(editingId, form);
      else await packagesApi.create(form);
      toast.success(editingId ? 'Paket diperbarui' : 'Paket dibuat');
      setForm(emptyForm);
      setEditingId(null);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal simpan paket');
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <h1 className="text-2xl font-bold">Manajemen Paket</h1>
      <div className="card space-y-3">
        <input className="input" placeholder="Nama paket" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <div className="grid grid-cols-2 gap-2">
          <input className="input" type="number" value={form.durationMinutes || ''} onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) || undefined })} placeholder="Durasi (menit, opsional)" />
          <input className="input" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) || 0 })} placeholder="Harga paket" />
        </div>
        {form.items.map((item: any, idx: number) => (
          <div key={idx} className="grid grid-cols-4 gap-2">
            <select className="input" value={item.type} onChange={(e) => {
              const next = [...form.items]; next[idx] = { ...item, type: e.target.value, menuItemId: undefined }; setForm({ ...form, items: next });
            }}><option value="BILLING">Billing</option><option value="MENU_ITEM">F&B</option></select>
            {item.type === 'MENU_ITEM' ? (
              <select className="input" value={item.menuItemId || ''} onChange={(e) => {
                const chosen = menuItems.find((m: any) => m.id === e.target.value);
                const next = [...form.items];
                next[idx] = { ...item, menuItemId: e.target.value, unitPrice: Number(chosen?.price || 0) };
                setForm({ ...form, items: next });
              }}>
                <option value="">Pilih menu</option>
                {menuItems.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            ) : <input className="input" value="Durasi billing" readOnly />}
            <input className="input" type="number" value={item.quantity} onChange={(e) => {
              const next = [...form.items]; next[idx] = { ...item, quantity: Number(e.target.value) || 1 }; setForm({ ...form, items: next });
            }} />
            <input className="input" type="number" value={item.unitPrice} onChange={(e) => {
              const next = [...form.items]; next[idx] = { ...item, unitPrice: Number(e.target.value) || 0 }; setForm({ ...form, items: next });
            }} />
          </div>
        ))}
        <button className="btn-secondary" onClick={() => setForm({ ...form, items: [...form.items, { type: 'MENU_ITEM', quantity: 1, unitPrice: 0 }] })}>Tambah Item</button>
        <button className="btn-primary" onClick={submit}>{editingId ? 'Update Paket' : 'Simpan Paket'}</button>
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">Daftar Paket</h2>
        <div className="space-y-2">
          {data.map((pkg) => (
            <div key={pkg.id} className="rounded border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{pkg.name} • {formatCurrency(pkg.price)}</p>
                  <p className="text-xs text-slate-500">Durasi: {pkg.durationMinutes || '-'} menit</p>
                </div>
                <div className="space-x-2">
                  <button className="btn-secondary" onClick={() => { setEditingId(pkg.id); setForm({ name: pkg.name, durationMinutes: pkg.durationMinutes, price: Number(pkg.price), isActive: pkg.isActive, items: pkg.items.map((x: any) => ({ type: x.type, menuItemId: x.menuItemId || undefined, quantity: x.quantity, unitPrice: Number(x.unitPrice) })) }); }}>Edit</button>
                  <button className="btn-danger" onClick={async () => { await packagesApi.remove(pkg.id); load(); }}>Hapus</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
