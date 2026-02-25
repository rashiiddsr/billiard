'use client';

import { useEffect, useMemo, useState } from 'react';
import { iotApi } from '@/lib/api';
import toast from 'react-hot-toast';

export default function DeveloperIotPage() {
  const [devices, setDevices] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [routeEditing, setRouteEditing] = useState<Record<string, { relayChannel: number; gpioPin: string }>>({});
  const [testResult, setTestResult] = useState<any>(null);

  const load = async () => {
    try {
      const [deviceData, settingData] = await Promise.all([iotApi.listDevices(), iotApi.getSettings()]);
      setDevices(deviceData);
      setSettings(settingData);
      setSelectedDeviceId(settingData?.gatewayDeviceId || deviceData?.[0]?.id || '');

      const initialRouteState: Record<string, { relayChannel: number; gpioPin: string }> = {};
      (settingData?.relayRoutes || []).forEach((route: any) => {
        initialRouteState[route.tableId] = {
          relayChannel: route.relayChannel,
          gpioPin: String(route.gpioPin ?? ''),
        };
      });
      setRouteEditing(initialRouteState);
    } catch {
      toast.error('Gagal memuat IoT config');
    }
  };

  useEffect(() => { load(); }, []);

  const saveGateway = async () => {
    if (!selectedDeviceId) return;
    await iotApi.setGateway(selectedDeviceId);
    toast.success('Gateway disimpan');
    load();
  };

  const relayRoutes = useMemo(() => settings?.relayRoutes || [], [settings]);

  const saveRoute = async (tableId: string) => {
    const value = routeEditing[tableId];
    if (!value) return;
    try {
      await iotApi.setRoute(tableId, Number(value.relayChannel), value.gpioPin === '' ? null : Number(value.gpioPin));
      toast.success('Route meja tersimpan');
      load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal simpan route');
    }
  };

  const testConnection = async () => {
    if (!selectedDeviceId) return;
    try {
      const res = await iotApi.testConnection(selectedDeviceId);
      setTestResult(res);
      toast.success(res.message);
    } catch {
      toast.error('Tes koneksi gagal');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">IoT Configurated (Developer)</h1>
        <p className="text-slate-500">Konfigurasi koneksi gateway, status online/offline, dan test koneksi.</p>
      </div>

      <div className="card space-y-3">
        <label className="label">Gateway Device</label>
        <select className="input" value={selectedDeviceId} onChange={(e) => setSelectedDeviceId(e.target.value)}>
          <option value="">-- pilih device --</option>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>{d.id} • {d.isOnline ? 'online' : 'offline'}</option>
          ))}
        </select>
        <div className="flex gap-2">
          <button className="btn-primary" onClick={saveGateway}>Simpan Gateway</button>
          <button className="btn-secondary" onClick={testConnection}>Test Koneksi</button>
        </div>
        {testResult && <p className="text-sm">Status: <b>{testResult.online ? 'Online' : 'Offline'}</b> — {testResult.message}</p>}
      </div>

      <div className="card">
        <h2 className="font-semibold mb-3">Routing Relay per Meja</h2>
        <div className="space-y-2">
          {relayRoutes.map((route: any) => {
            const current = routeEditing[route.tableId];
            return (
              <div key={route.tableId} className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-2 rounded">
                <div className="col-span-4 text-sm">
                  <p className="font-medium">{route.tableName}</p>
                  <p className="text-xs font-mono">{route.tableId}</p>
                </div>
                <input type="number" className="input col-span-2" value={current?.relayChannel ?? ''} onChange={(e) => setRouteEditing((v) => ({ ...v, [route.tableId]: { ...v[route.tableId], relayChannel: Number(e.target.value) } }))} />
                <input type="number" className="input col-span-2" value={current?.gpioPin ?? ''} onChange={(e) => setRouteEditing((v) => ({ ...v, [route.tableId]: { ...v[route.tableId], gpioPin: e.target.value } }))} />
                <button className="btn-primary col-span-2" onClick={() => saveRoute(route.tableId)}>Simpan</button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
