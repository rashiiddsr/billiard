'use client';

import { useEffect, useMemo, useState } from 'react';
import { iotApi, tablesApi } from '@/lib/api';

export default function DeveloperDashboardPage() {
  const [tables, setTables] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const [t, d] = await Promise.all([tablesApi.list(true), iotApi.listDevices()]);
      setTables(t);
      setDevices(d);
    };
    load();
  }, []);

  const activeTables = useMemo(() => tables.filter((t) => t.isActive).length, [tables]);
  const onlineDevices = useMemo(() => devices.filter((d) => d.isOnline).length, [devices]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard Developer</h1>
        <p className="text-slate-500">Ringkasan manajemen meja dan koneksi IoT.</p>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <Card title="Total Meja" value={String(tables.length)} />
        <Card title="Meja Aktif" value={String(activeTables)} />
        <Card title="Device Online" value={`${onlineDevices}/${devices.length}`} />
      </div>
    </div>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="card">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  );
}
