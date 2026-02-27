'use client';

import { useEffect, useState } from 'react';
import { billingApi } from '@/lib/api';

export default function OwnerHistoryPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detail, setDetail] = useState<any>(null);

  useEffect(() => {
    billingApi.getSessions({ limit: 200 }).then((r) => {
      const rows = (r.data || []).filter((x: any) => x.rateType === 'OWNER_LOCK');
      setSessions(rows);
    });
  }, []);

  const openDetail = async (session: any) => {
    setSelected(session);
    setDetail(null);
    setLoadingDetail(true);
    try {
      const data = await billingApi.getSession(session.id);
      setDetail(data);
    } finally {
      setLoadingDetail(false);
    }
  };

  const durationText = (start: string, end?: string | null) => {
    if (!end) return '-';
    const minutes = Math.max(0, Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 60000));
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}j ${m}m`;
  };

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-bold">Histori</h1>
      <div className="card p-0">
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Meja</th>
                <th>Mulai</th>
                <th>Selesai</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td>{s.table?.name}</td>
                  <td>{new Date(s.startTime).toLocaleString('id-ID')}</td>
                  <td>{s.actualEndTime ? new Date(s.actualEndTime).toLocaleString('id-ID') : '-'}</td>
                  <td>{s.status}</td>
                  <td>
                    <button onClick={() => openDetail(s)} className="rounded-lg bg-indigo-100 px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-200">
                      Detail
                    </button>
                  </td>
                </tr>
              ))}
              {sessions.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm text-slate-500">
                    Belum ada histori sesi.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-4">
              <h3 className="font-semibold">Detail Histori — {selected.table?.name}</h3>
              <button onClick={() => setSelected(null)} className="text-slate-500 hover:text-slate-700">✕</button>
            </div>
            <div className="space-y-3 p-4 text-sm">
              {loadingDetail && <p className="text-slate-500">Memuat detail...</p>}
              {!loadingDetail && detail && (
                <>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex justify-between"><span className="text-slate-500">Mulai</span><span>{new Date(detail.startTime).toLocaleString('id-ID')}</span></div>
                    <div className="mt-1 flex justify-between"><span className="text-slate-500">Selesai</span><span>{detail.actualEndTime ? new Date(detail.actualEndTime).toLocaleString('id-ID') : '-'}</span></div>
                    <div className="mt-1 flex justify-between"><span className="text-slate-500">Lama Pakai</span><span>{durationText(detail.startTime, detail.actualEndTime)}</span></div>
                  </div>

                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="mb-2 font-semibold">Makanan/Minuman Selama Sesi</p>
                    {(detail.orders || []).length === 0 && <p className="text-slate-500">Tidak ada pesanan F&B.</p>}
                    <div className="space-y-2">
                      {(detail.orders || []).map((order: any) => (
                        <div key={order.id} className="rounded border border-slate-200 bg-slate-50 p-2">
                          <p className="text-xs font-semibold">{order.orderNumber}</p>
                          <ul className="mt-1 space-y-1 text-xs text-slate-600">
                            {(order.items || []).map((item: any) => (
                              <li key={item.id}>• {item.menuItem?.name || 'Menu'} × {item.quantity}</li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
