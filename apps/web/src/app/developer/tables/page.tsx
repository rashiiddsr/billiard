'use client';

import { useEffect, useMemo, useState } from 'react';
import { iotApi, tablesApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';

const GPIO_OPTIONS = [23, 19, 18, 27, 26, 25, 33, 32, 14, 13, 12, 5, 17, 16, 4, 15];
const RELAY_CHANNEL_OPTIONS = Array.from({ length: 16 }, (_, i) => i);

export default function DeveloperTablesPage() {
  const [tables, setTables] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({ name: '', iotDeviceId: '', relayChannel: '', gpioPin: '', hourlyRate: '' });

  const deviceMap = useMemo(() => Object.fromEntries(devices.map((d) => [d.id, d])), [devices]);

  const load = async () => {
    setLoading(true);
    try {
      const [tableData, deviceData] = await Promise.all([tablesApi.list(true), iotApi.listDevices()]);
      setTables(tableData);
      setDevices(deviceData);
    } catch {
      toast.error('Gagal memuat data meja/device');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    if (devices.length === 0) {
      toast.error('Tambahkan device IoT terlebih dahulu di menu IoT Configurated');
      return;
    }

    setEditing(null);
    setForm({ name: '', iotDeviceId: devices[0].id, relayChannel: RELAY_CHANNEL_OPTIONS[0], gpioPin: GPIO_OPTIONS[0], hourlyRate: '' });
    setShowForm(true);
  };

  const openEdit = (t: any) => {
    setEditing(t);
    setForm({
      name: t.name,
      iotDeviceId: t.iotDeviceId,
      relayChannel: t.relayChannel,
      gpioPin: t.gpioPin,
      hourlyRate: t.hourlyRate,
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.name || !form.iotDeviceId || form.relayChannel === '' || form.gpioPin === '' || form.hourlyRate === '') {
      toast.error('Nama, device IoT, relay channel, GPIO, dan harga wajib diisi');
      return;
    }

    try {
      const payload = {
        name: form.name,
        iotDeviceId: form.iotDeviceId,
        relayChannel: Number(form.relayChannel),
        gpioPin: Number(form.gpioPin),
        hourlyRate: Number(form.hourlyRate),
      };

      if (editing) {
        await tablesApi.update(editing.id, payload);
        toast.success('Data meja diperbarui');
      } else {
        await tablesApi.create(payload);
        toast.success('Meja baru ditambahkan');
      }

      setShowForm(false);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal menyimpan meja');
    }
  };

  const toggleActive = async (table: any) => {
    try {
      await tablesApi.update(table.id, { isActive: !table.isActive });
      toast.success(`Meja ${!table.isActive ? 'diaktifkan' : 'dinonaktifkan'}`);
      load();
    } catch {
      toast.error('Gagal mengubah status meja');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Manajemen Meja (Developer)</h1>
        <button className="btn-primary" onClick={openCreate}>+ Tambah Meja</button>
      </div>

      <div className="text-sm text-slate-500">Urutan meja ditampilkan natural (Meja 1, 2, 3...10...) dan setiap meja wajib terhubung ke device + GPIO.</div>

      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 w-full max-w-lg p-4 space-y-3">
            <h3 className="font-semibold">{editing ? 'Edit Meja' : 'Tambah Meja Baru'}</h3>
            <input className="input" placeholder="Nama meja" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />

            <div>
              <label className="label">Device IoT</label>
              <select className="input" value={form.iotDeviceId} onChange={(e) => setForm({ ...form, iotDeviceId: e.target.value })}>
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>{d.name} ({d.id})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Relay Channel</label>
              <select className="input" value={form.relayChannel} onChange={(e) => setForm({ ...form, relayChannel: Number(e.target.value) })}>
                {RELAY_CHANNEL_OPTIONS.map((channel) => <option key={channel} value={channel}>{channel}</option>)}
              </select>
            </div>

            <div>
              <label className="label">GPIO Pin</label>
              <select className="input" value={form.gpioPin} onChange={(e) => setForm({ ...form, gpioPin: Number(e.target.value) })}>
                {GPIO_OPTIONS.map((pin) => <option key={pin} value={pin}>{pin}</option>)}
              </select>
            </div>

            <input type="number" className="input" placeholder="Harga per jam" value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })} />
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => setShowForm(false)}>Batal</button>
              <button className="btn-primary" onClick={save}>Simpan</button>
            </div>
          </div>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th><th>Nama</th><th>Device</th><th>Relay CH</th><th>GPIO</th><th>Harga/Jam</th><th>Status</th><th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={8} className="text-center py-6">Memuat...</td></tr> : tables.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-6 text-slate-500">Belum ada meja</td></tr>
              ) : tables.map((t) => (
                <tr key={t.id}>
                  <td className="font-mono text-xs">{t.id}</td>
                  <td>{t.name}</td>
                  <td>{deviceMap[t.iotDeviceId]?.name || '-'} <span className="text-xs text-slate-500">({t.iotDeviceId})</span></td>
                  <td>{t.relayChannel}</td>
                  <td>{t.gpioPin}</td>
                  <td>{formatCurrency(Number(t.hourlyRate))}</td>
                  <td>{t.isActive ? 'Aktif' : 'Nonaktif'}</td>
                  <td>
                    <div className="flex gap-2">
                      <button className="text-xs px-2 py-1 bg-slate-100 rounded" onClick={() => openEdit(t)}>Edit</button>
                      <button className="text-xs px-2 py-1 bg-slate-100 rounded" onClick={() => toggleActive(t)}>{t.isActive ? 'OFF' : 'ON'}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
