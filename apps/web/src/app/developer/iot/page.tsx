'use client';

import { useEffect, useMemo, useState } from 'react';
import { iotApi } from '@/lib/api';
import toast from 'react-hot-toast';

export default function DeveloperIotPage() {
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDeviceName, setNewDeviceName] = useState('');
  const [tokenModal, setTokenModal] = useState<{ title: string; token: string } | null>(null);

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

  const allowedGpios = useMemo(() => [23, 19, 18, 27, 26, 25, 33, 32, 14, 13, 12, 5, 17, 16, 4, 15], []);

  const addDevice = async () => {
    if (!newDeviceName.trim()) {
      toast.error('Nama device wajib diisi');
      return;
    }

    try {
      const result = await iotApi.createDevice(newDeviceName.trim());
      setTokenModal({ title: `Token Device ${result.device.name}`, token: result.privateToken });
      setNewDeviceName('');
      toast.success('Device IoT berhasil dibuat');
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal menambah device');
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
    await navigator.clipboard.writeText(tokenModal.token);
    toast.success('Token berhasil dicopy');
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">IoT Configurated (Developer)</h1>
        <p className="text-slate-500">Kelola device ESP gateway, test koneksi, dan generate token private.</p>
      </div>

      <div className="card space-y-3">
        <h2 className="font-semibold">Tambah Device IoT</h2>
        <div className="grid md:grid-cols-[1fr_auto] gap-2">
          <input className="input" placeholder="Nama device (misal: ESP Lantai 1)" value={newDeviceName} onChange={(e) => setNewDeviceName(e.target.value)} />
          <button className="btn-primary" onClick={addDevice}>+ Tambah Device</button>
        </div>
        <p className="text-xs text-slate-500">Setiap device menyediakan 16 GPIO: {allowedGpios.join(', ')}</p>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nama Device</th>
                <th>Device ID</th>
                <th>Status</th>
                <th>Meja Terpasang</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-8">Memuat...</td></tr>
              ) : devices.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-slate-500">Belum ada device IoT</td></tr>
              ) : (
                devices.map((d) => (
                  <tr key={d.id}>
                    <td className="font-medium">{d.name}</td>
                    <td className="font-mono text-xs">{d.id}</td>
                    <td>{d.isOnline ? 'Online' : 'Offline'}</td>
                    <td>{d._count?.tables || 0}/16</td>
                    <td>
                      <div className="flex gap-2">
                        <button className="text-xs px-2 py-1 bg-slate-100 rounded" onClick={() => testConnection(d.id)}>Test</button>
                        <button className="text-xs px-2 py-1 bg-slate-100 rounded" onClick={() => rotateToken(d.id, d.name)}>Generate Token Baru</button>
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
              <button className="btn-primary" onClick={copyToken}>Copy</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
