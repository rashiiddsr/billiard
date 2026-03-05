'use client';

import { useEffect, useState } from 'react';
import { iotApi } from '@/lib/api';
import toast from 'react-hot-toast';

const DEFAULT_GPIO_PINS = [23, 19, 18, 27, 26, 25, 33, 32, 14, 13, 12, 5, 17, 16, 4, 15];

type DeviceForm = { name: string; gpioPins: number[] };

export default function DeveloperIotPage() {
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tokenModal, setTokenModal] = useState<{ title: string; token: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<DeviceForm>({ name: '', gpioPins: [...DEFAULT_GPIO_PINS] });

  const load = async () => {
    setLoading(true);
    try {
      setDevices(await iotApi.listDevices());
    } catch {
      toast.error('Gagal memuat device IoT');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', gpioPins: [...DEFAULT_GPIO_PINS] });
    setShowForm(true);
  };

  const openEdit = (device: any) => {
    setEditing(device);
    setForm({ name: device.name, gpioPins: [...(device.gpioPins?.length ? device.gpioPins : DEFAULT_GPIO_PINS)] });
    setShowForm(true);
  };

  const setGpioPin = (channel: number, pin: number) => {
    setForm((prev) => {
      const next = [...prev.gpioPins];
      next[channel] = pin;
      return { ...prev, gpioPins: next };
    });
  };

  const saveDevice = async () => {
    if (!form.name.trim()) {
      toast.error('Nama device wajib diisi');
      return;
    }

    if (new Set(form.gpioPins).size !== form.gpioPins.length) {
      toast.error('GPIO pin tidak boleh duplikat di dalam satu device');
      return;
    }

    try {
      if (editing) {
        await iotApi.updateDevice(editing.id, { name: form.name.trim(), gpioPins: form.gpioPins });
        toast.success('Device berhasil diperbarui');
      } else {
        const result = await iotApi.createDevice(form.name.trim());
        setTokenModal({ title: `Token Device ${result.device.name}`, token: result.privateToken });
        toast.success('Device IoT berhasil dibuat');
      }
      setShowForm(false);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal menyimpan device');
    }
  };

  const toggleActive = async (device: any) => {
    try {
      await iotApi.updateDevice(device.id, { isActive: !device.isActive });
      toast.success(`Device berhasil ${device.isActive ? 'dinonaktifkan' : 'diaktifkan'}`);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal mengubah status device');
    }
  };

  const rotateToken = async (deviceId: string, name: string) => {
    try {
      const result = await iotApi.rotateToken(deviceId);
      setTokenModal({ title: `Token Baru ${name}`, token: result.privateToken });
      toast.success('Token device berhasil digenerate ulang');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal generate token');
    }
  };

  const testConnection = async (deviceId: string) => {
    try {
      const result = await iotApi.testConnection(deviceId);
      toast.success(result.message);
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Tes koneksi gagal');
    }
  };

  const copyToken = async () => {
    if (!tokenModal?.token) return;

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(tokenModal.token);
      toast.success('Token berhasil dicopy');
      return;
    }

    try {
      const textarea = document.createElement('textarea');
      textarea.value = tokenModal.token;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      toast.success('Token berhasil dicopy');
    } catch {
      toast.error('Clipboard tidak tersedia di browser ini');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">IoT Configurated</h1>
          <p className="text-slate-500">Kelola device ESP gateway, test koneksi, dan generate token private.</p>
        </div>
        <button className="btn-primary" onClick={openCreate}>+ Tambah Device</button>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 w-full max-w-3xl p-4 space-y-3">
            <h3 className="font-semibold">{editing ? 'Edit Device IoT' : 'Tambah Device IoT'}</h3>
            <div>
              <label className="label">Nama Device <span className="text-red-500">*</span></label>
              <input className="input" placeholder="Nama device (misal: ESP Lantai 1)" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
            </div>

            {editing && (
              <div className="space-y-2">
                <label className="label">Daftar GPIO Relay (index 0-15)</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-72 overflow-auto rounded border border-slate-200 p-3">
                  {form.gpioPins.map((pin, channel) => (
                    <div key={channel} className="flex items-center gap-2">
                      <span className="w-24 text-sm text-slate-600">Index {channel}</span>
                      <input
                        className="input"
                        type="number"
                        value={pin}
                        onChange={(e) => setGpioPin(channel, Number(e.target.value))}
                        placeholder="Contoh: 23"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setShowForm(false)}>Batal</button>
              <button className="btn-primary" onClick={saveDevice}>Simpan</button>
            </div>
          </div>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nama Device</th>
                <th>Device ID</th>
                <th>Koneksi</th>
                <th>Status</th>
                <th>Meja Terpasang</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8">Memuat...</td></tr>
              ) : devices.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-slate-500">Belum ada device IoT</td></tr>
              ) : (
                devices.map((d) => (
                  <tr key={d.id}>
                    <td className="font-medium">{d.name}</td>
                    <td className="font-mono text-xs">{d.id}</td>
                    <td>{d.isOnline ? 'Online' : 'Offline'}</td>
                    <td>
                      <button type="button" onClick={() => toggleActive(d)} className={`toggle-switch ${d.isActive ? 'active' : ''}`} title={d.isActive ? 'Aktif' : 'Nonaktif'} />
                    </td>
                    <td>{d._count?.tables || 0}/16</td>
                    <td>
                      <div className="flex gap-2">
                        <button
                          className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700 hover:bg-amber-200"
                          onClick={() => openEdit(d)}
                        >
                          Edit
                        </button>
                        <button
                          className="text-xs px-2 py-1 rounded bg-sky-100 text-sky-700 hover:bg-sky-200"
                          onClick={() => testConnection(d.id)}
                        >
                          Test
                        </button>
                        <button
                          className="text-xs px-2 py-1 rounded bg-violet-100 text-violet-700 hover:bg-violet-200"
                          onClick={() => rotateToken(d.id, d.name)}
                        >
                          Generate Token Baru
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {tokenModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 w-full max-w-xl p-4 space-y-3">
            <h3 className="font-semibold">{tokenModal.title}</h3>
            <p className="text-sm text-red-600">Simpan token ini sekarang. Token hanya ditampilkan sekali.</p>
            <div className="rounded bg-slate-100 p-3 font-mono text-sm break-all">{tokenModal.token}</div>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setTokenModal(null)}>Tutup</button>
              <button className="btn-primary" onClick={copyToken}>Copy Token</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
