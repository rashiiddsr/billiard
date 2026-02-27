'use client';

import { useEffect, useMemo, useState } from 'react';
import { iotApi, tablesApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';

const DEFAULT_GPIO_OPTIONS = [23, 19, 18, 27, 26, 25, 33, 32, 14, 13, 12, 5, 17, 16, 4, 15];
const RELAY_CHANNEL_OPTIONS = Array.from({ length: 16 }, (_, i) => i);

const formatRemaining = (seconds: number) => {
  const safe = Math.max(0, seconds || 0);
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export default function DeveloperTablesPage() {
  const [tables, setTables] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({ name: '', iotDeviceId: '', relayChannel: '', gpioPin: '', hourlyRate: '' });
  const [testingTable, setTestingTable] = useState<any>(null);
  const [testingMinutes, setTestingMinutes] = useState('5');
  const [testingSubmitting, setTestingSubmitting] = useState(false);

  const deviceMap = useMemo(() => Object.fromEntries(devices.map((d) => [d.id, d])), [devices]);

  const getDeviceGpioOptions = (iotDeviceId: string) => {
    const pins = deviceMap[iotDeviceId]?.gpioPins;
    return Array.isArray(pins) && pins.length > 0 ? pins : DEFAULT_GPIO_OPTIONS;
  };

  const load = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const [tableData, deviceData] = await Promise.all([tablesApi.list(true), iotApi.listDevices()]);
      setTables(tableData);
      setDevices(deviceData);
    } catch {
      toast.error('Gagal memuat data meja/device');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => { load(true); }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      setTables((prev) => prev.map((table) => ({
        ...table,
        testingRemainingSeconds: Math.max(0, Number(table.testingRemainingSeconds || 0) - 1),
      })));
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const timer = setInterval(() => load(false), 10000);
    return () => clearInterval(timer);
  }, []);

  const deviceUsageMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of tables) map[t.iotDeviceId] = (map[t.iotDeviceId] || 0) + 1;
    return map;
  }, [tables]);

  const availableDevices = useMemo(() => {
    return devices.filter((d) => {
      const used = deviceUsageMap[d.id] || 0;
      const occupiedByEditing = editing?.iotDeviceId === d.id ? 1 : 0;
      return d.isActive && used - occupiedByEditing < 16;
    });
  }, [devices, deviceUsageMap, editing]);

  const usedByDevice = useMemo(() => {
    const usedRelay: Record<string, Set<number>> = {};
    const usedGpio: Record<string, Set<number>> = {};
    for (const t of tables) {
      if (editing?.id === t.id) continue;
      if (!usedRelay[t.iotDeviceId]) usedRelay[t.iotDeviceId] = new Set();
      if (!usedGpio[t.iotDeviceId]) usedGpio[t.iotDeviceId] = new Set();
      usedRelay[t.iotDeviceId].add(t.relayChannel);
      usedGpio[t.iotDeviceId].add(t.gpioPin);
    }
    return { usedRelay, usedGpio };
  }, [tables, editing]);

  const openCreate = () => {
    if (availableDevices.length === 0) {
      toast.error('Tidak ada device aktif dengan slot kosong. Tambahkan/aktifkan device IoT terlebih dahulu.');
      return;
    }

    const firstDeviceId = availableDevices[0].id;
    const firstRelay = RELAY_CHANNEL_OPTIONS.find((ch) => !usedByDevice.usedRelay[firstDeviceId]?.has(ch));
    const firstGpio = getDeviceGpioOptions(firstDeviceId).find((pin: number) => !usedByDevice.usedGpio[firstDeviceId]?.has(pin));

    setEditing(null);
    setForm({ name: '', iotDeviceId: firstDeviceId, relayChannel: firstRelay ?? '', gpioPin: firstGpio ?? '', hourlyRate: '' });
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

  const onChangeDevice = (iotDeviceId: string) => {
    const nextRelay = RELAY_CHANNEL_OPTIONS.find((ch) => !usedByDevice.usedRelay[iotDeviceId]?.has(ch));
    const nextGpio = getDeviceGpioOptions(iotDeviceId).find((pin: number) => !usedByDevice.usedGpio[iotDeviceId]?.has(pin));
    setForm({ ...form, iotDeviceId, relayChannel: nextRelay ?? '', gpioPin: nextGpio ?? '' });
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
      load(false);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal menyimpan meja');
    }
  };

  const hasActiveBilling = (table: any) => (table.billingSessions || []).length > 0 || table.status === 'OCCUPIED';
  const canEditTable = (table: any) => !hasActiveBilling(table);
  const canStartTesting = (table: any) => table.status === 'AVAILABLE' && !hasActiveBilling(table);
  const isTesting = (table: any) => table.status === 'MAINTENANCE';

  const openTestingModal = (table: any) => {
    if (!canStartTesting(table)) {
      toast.error('Testing hanya bisa dilakukan saat meja free (tidak sedang billing)');
      return;
    }
    setTestingTable(table);
    setTestingMinutes('5');
  };

  const startTesting = async () => {
    if (!testingTable) return;
    const minutes = Number(testingMinutes);
    if (Number.isNaN(minutes) || minutes <= 0) {
      toast.error('Durasi testing wajib berupa angka menit > 0');
      return;
    }

    setTestingSubmitting(true);
    try {
      await tablesApi.testing(testingTable.id, minutes);
      toast.success(`Lampu ${testingTable.name} hidup selama ${minutes} menit`);
      setTestingTable(null);
      load(false);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal memulai testing meja');
    } finally {
      setTestingSubmitting(false);
    }
  };

  const stopTesting = async (table: any) => {
    try {
      await tablesApi.stopTesting(table.id);
      toast.success(`Testing ${table.name} dihentikan`);
      load(false);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal menghentikan testing meja');
    }
  };

  const toggleActive = async (table: any) => {
    try {
      await tablesApi.update(table.id, { isActive: !table.isActive });
      toast.success(`Meja ${!table.isActive ? 'diaktifkan' : 'dinonaktifkan'}`);
      load(false);
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

      {showForm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 w-full max-w-lg p-4 space-y-3">
            <h3 className="font-semibold">{editing ? 'Edit Meja' : 'Tambah Meja Baru'}</h3>
            <div>
              <label className="label">Nama Meja <span className="text-red-500">*</span></label>
              <input className="input" placeholder="Nama meja" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>

            <div>
              <label className="label">Device IoT <span className="text-red-500">*</span></label>
              <select className="input" value={form.iotDeviceId} onChange={(e) => onChangeDevice(e.target.value)}>
                {availableDevices.map((d) => (
                  <option key={d.id} value={d.id}>{d.name} ({d.id})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Relay Channel <span className="text-red-500">*</span></label>
              <select className="input" value={form.relayChannel} onChange={(e) => setForm({ ...form, relayChannel: Number(e.target.value) })}>
                {RELAY_CHANNEL_OPTIONS.map((channel) => (
                  <option key={channel} value={channel} disabled={!!usedByDevice.usedRelay[form.iotDeviceId]?.has(channel)}>
                    {channel}{usedByDevice.usedRelay[form.iotDeviceId]?.has(channel) ? ' (terpakai)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">GPIO Pin <span className="text-red-500">*</span></label>
              <select className="input" value={form.gpioPin} onChange={(e) => setForm({ ...form, gpioPin: Number(e.target.value) })}>
                {getDeviceGpioOptions(form.iotDeviceId).map((pin: number) => (
                  <option key={pin} value={pin} disabled={!!usedByDevice.usedGpio[form.iotDeviceId]?.has(pin)}>
                    {pin}{usedByDevice.usedGpio[form.iotDeviceId]?.has(pin) ? ' (terpakai)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Harga per Jam <span className="text-red-500">*</span></label>
              <input type="number" className="input" placeholder="Harga per jam" value={form.hourlyRate} onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })} />
            </div>

            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => setShowForm(false)}>Batal</button>
              <button className="btn-primary" onClick={save}>Simpan</button>
            </div>
          </div>
        </div>
      )}

      {testingTable && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 w-full max-w-md p-4 space-y-3">
            <h3 className="font-semibold">Testing Lampu Meja</h3>
            <p className="text-sm text-slate-600">Masukkan durasi menit untuk menyalakan lampu meja <span className="font-semibold">{testingTable.name}</span>.</p>
            <div>
              <label className="label">Durasi (menit)</label>
              <input type="number" min={1} className="input" value={testingMinutes} onChange={(e) => setTestingMinutes(e.target.value)} />
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn-secondary" onClick={() => setTestingTable(null)} disabled={testingSubmitting}>Batal</button>
              <button className="text-xs px-3 py-2 bg-violet-600 text-white rounded hover:bg-violet-700 disabled:opacity-50" onClick={startTesting} disabled={testingSubmitting}>
                {testingSubmitting ? 'Memproses...' : 'Konfirmasi Testing'}
              </button>
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
                  <td>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => toggleActive(t)} className={`toggle-switch ${t.isActive ? 'active' : ''}`} title={t.isActive ? 'Aktif' : 'Nonaktif'} />
                      {isTesting(t) && <span className="text-xs font-semibold text-violet-700">Testing ({formatRemaining(t.testingRemainingSeconds)})</span>}
                    </div>
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button
                        className="text-xs px-2 py-1 bg-slate-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => openEdit(t)}
                        disabled={!canEditTable(t)}
                      >
                        Edit
                      </button>
                      {isTesting(t) ? (
                        <button className="text-xs px-2 py-1 bg-violet-600 text-white rounded hover:bg-violet-700" onClick={() => stopTesting(t)}>
                          Hentikan
                        </button>
                      ) : (
                        <button
                          className="text-xs px-2 py-1 bg-violet-100 text-violet-700 rounded hover:bg-violet-200 disabled:opacity-50 disabled:cursor-not-allowed"
                          onClick={() => openTestingModal(t)}
                          disabled={!canStartTesting(t)}
                        >
                          Testing
                        </button>
                      )}
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
