'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { iotApi } from '@/lib/api';

export default function OwnerIotSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [routeEditing, setRouteEditing] = useState<Record<string, { relayChannel: number; gpioPin: string }>>({});

  const loadData = async () => {
    setLoading(true);
    try {
      const [deviceData, settingData] = await Promise.all([
        iotApi.listDevices(),
        iotApi.getSettings(),
      ]);
      const list = Array.isArray(deviceData) ? deviceData : [];
      setDevices(list);
      setSettings(settingData);
      setSelectedDeviceId(settingData?.gatewayDeviceId || list[0]?.id || '');

      const initialRouteState: Record<string, { relayChannel: number; gpioPin: string }> = {};
      (settingData?.relayRoutes || []).forEach((route: any) => {
        initialRouteState[route.tableId] = {
          relayChannel: route.relayChannel,
          gpioPin: route.gpioPin === null || route.gpioPin === undefined ? '' : String(route.gpioPin),
        };
      });
      setRouteEditing(initialRouteState);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.response?.data?.message || 'Gagal memuat IoT settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const saveGateway = async () => {
    if (!selectedDeviceId) return;
    setSaving(true);
    try {
      const data = await iotApi.setGateway(selectedDeviceId);
      setSettings(data);
      toast.success('Gateway ESP berhasil disimpan');
    } catch (error: any) {
      console.error(error);
      toast.error(error?.response?.data?.message || 'Gagal menyimpan gateway');
    } finally {
      setSaving(false);
    }
  };

  const clearOverride = async () => {
    setSaving(true);
    try {
      const data = await iotApi.clearGatewayOverride();
      setSettings(data);
      toast.success('Override gateway dihapus (kembali ke env)');
    } catch (error: any) {
      console.error(error);
      toast.error(error?.response?.data?.message || 'Gagal menghapus override');
    } finally {
      setSaving(false);
    }
  };

  const relayRoutes = useMemo(() => settings?.relayRoutes || [], [settings]);

  const saveRoute = async (tableId: string) => {
    const value = routeEditing[tableId];
    if (!value) return;

    setSaving(true);
    try {
      const data = await iotApi.setRoute(
        tableId,
        Number(value.relayChannel),
        value.gpioPin === '' ? null : Number(value.gpioPin),
      );
      setSettings(data);
      toast.success('Routing meja berhasil disimpan');
    } catch (error: any) {
      console.error(error);
      toast.error(error?.response?.data?.message || 'Gagal menyimpan routing meja');
    } finally {
      setSaving(false);
    }
  };

  const resetRoute = async (tableId: string) => {
    setSaving(true);
    try {
      const data = await iotApi.clearRoute(tableId);
      setSettings(data);
      toast.success('Routing meja kembali ke default');
    } catch (error: any) {
      console.error(error);
      toast.error(error?.response?.data?.message || 'Gagal reset routing meja');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">IoT Settings (Owner)</h1>
        <p className="text-slate-400">
          Sistem IoT mode <b>Single ESP Gateway</b>: 1 ESP mengontrol semua relay meja.
          Web mengirim payload per meja berisi relay channel/gpio agar ESP tidak lagi tergantung 1-device-1-meja.
        </p>
      </div>

      <div className="card space-y-4">
        <div>
          <p className="text-sm text-slate-400">Mode</p>
          <p className="font-semibold">{settings?.mode || 'SINGLE_GATEWAY'}</p>
        </div>

        <div>
          <label className="text-sm text-slate-300 block mb-2">Pilih Gateway Device (ESP utama)</label>
          <select
            value={selectedDeviceId}
            onChange={(e) => setSelectedDeviceId(e.target.value)}
            className="input w-full"
          >
            <option value="">-- pilih device --</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.id} {d.table?.name ? `(${d.table.name})` : ''} {d.isOnline ? '• online' : '• offline'}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-3">
          <button
            onClick={saveGateway}
            disabled={saving || !selectedDeviceId}
            className="btn btn-primary disabled:opacity-50"
          >
            {saving ? 'Menyimpan...' : 'Simpan Gateway'}
          </button>
          <button
            onClick={clearOverride}
            disabled={saving}
            className="btn bg-slate-700 hover:bg-slate-600 disabled:opacity-50"
          >
            Reset ke ENV
          </button>
        </div>

        <div className="text-sm text-slate-400 bg-slate-800/60 border border-slate-700 rounded-lg p-3 space-y-1">
          <p>Gateway aktif: <span className="font-mono text-slate-200">{settings?.gatewayDeviceId || '-'}</span></p>
          <p>Override runtime: {settings?.hasOverride ? 'Ya' : 'Tidak'}</p>
          <p>GPIO map dari ENV: <span className="font-mono text-slate-200">[{(settings?.gpioMapFromEnv || []).join(', ')}]</span></p>
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Routing Relay per Meja</h2>
        <p className="text-sm text-slate-400 mb-4">
          Atur channel relay (0-15) dan GPIO output target yang akan dibaca ESP untuk setiap meja.
        </p>

        <div className="space-y-2">
          {relayRoutes.map((route: any) => {
            const current = routeEditing[route.tableId] || {
              relayChannel: route.relayChannel,
              gpioPin: route.gpioPin === null || route.gpioPin === undefined ? '' : String(route.gpioPin),
            };

            return (
              <div key={route.tableId} className="grid grid-cols-12 gap-3 items-center p-3 bg-slate-700 rounded-lg text-sm">
                <div className="col-span-4">
                  <p className="font-medium">{route.tableName}</p>
                  <p className="text-xs font-mono text-slate-400">{route.tableId}</p>
                </div>

                <div className="col-span-2">
                  <label className="text-xs text-slate-400">Relay CH</label>
                  <input
                    type="number"
                    min={0}
                    max={15}
                    value={current.relayChannel}
                    onChange={(e) => setRouteEditing((prev) => ({
                      ...prev,
                      [route.tableId]: {
                        ...(prev[route.tableId] || current),
                        relayChannel: Number(e.target.value),
                      },
                    }))}
                    className="input"
                  />
                </div>

                <div className="col-span-2">
                  <label className="text-xs text-slate-400">GPIO Pin</label>
                  <input
                    type="number"
                    placeholder="optional"
                    value={current.gpioPin}
                    onChange={(e) => setRouteEditing((prev) => ({
                      ...prev,
                      [route.tableId]: {
                        ...(prev[route.tableId] || current),
                        gpioPin: e.target.value,
                      },
                    }))}
                    className="input"
                  />
                </div>

                <div className="col-span-4 flex gap-2 justify-end">
                  <button
                    onClick={() => saveRoute(route.tableId)}
                    disabled={saving}
                    className="btn btn-primary disabled:opacity-50"
                  >
                    Simpan
                  </button>
                  <button
                    onClick={() => resetRoute(route.tableId)}
                    disabled={saving}
                    className="btn bg-slate-600 hover:bg-slate-500 disabled:opacity-50"
                  >
                    Default
                  </button>
                </div>
              </div>
            );
          })}
          {relayRoutes.length === 0 && (
            <p className="text-slate-400 text-sm">Belum ada meja terdaftar.</p>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Daftar Device IoT</h2>
        <div className="space-y-2">
          {devices.map((d) => (
            <div key={d.id} className="flex justify-between items-center p-3 bg-slate-700 rounded-lg text-sm">
              <div>
                <p className="font-mono text-xs">{d.id}</p>
                <p className="text-slate-300">Table relasi lama: {d.table?.name || '-'}</p>
              </div>
              <span className={`badge ${d.isOnline ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                {d.isOnline ? 'Online' : 'Offline'}
              </span>
            </div>
          ))}
          {devices.length === 0 && (
            <p className="text-slate-400 text-sm">Belum ada device IoT terdaftar.</p>
          )}
        </div>
      </div>
    </div>
  );
}
