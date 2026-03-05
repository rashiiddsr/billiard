'use client';

import { useEffect, useMemo, useState } from 'react';
import { auditApi, usersApi } from '@/lib/api';
import { formatDate } from '@/lib/utils';

const ACTIONS = [
  'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'FAILED_AUTH',
  'CONFIRM_ORDER', 'CANCEL_ORDER',
  'START_BILLING', 'STOP_BILLING', 'AUTO_STOP_BILLING', 'EXTEND_BILLING',
  'PAYMENT', 'PRINT_PAYMENT', 'VOID_PAYMENT', 'DELETE_PAYMENT',
];

export default function AuditPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  const [filterUserId, setFilterUserId] = useState('');
  const [filterEntity, setFilterEntity] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');

  useEffect(() => {
    usersApi.list().then(setUsers).catch(console.error);
  }, []);

  const fetchLogs = async (p = 1) => {
    setLoading(true);
    try {
      const data = await auditApi.list({
        userId: filterUserId || undefined,
        entity: filterEntity || undefined,
        action: filterAction || undefined,
        startDate: filterStart ? new Date(`${filterStart}T00:00:00`).toISOString() : undefined,
        endDate: filterEnd ? new Date(`${filterEnd}T23:59:59`).toISOString() : undefined,
        page: p,
        limit: 20,
      });
      setLogs(data.data);
      setTotal(data.total);
      setPage(p);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(1);
  }, [filterUserId, filterEntity, filterAction, filterStart, filterEnd]);

  const getActionColor = (action: string) => {
    const map: Record<string, string> = {
      CREATE: 'bg-green-100 text-green-700',
      UPDATE: 'bg-blue-100 text-blue-700',
      DELETE: 'bg-red-100 text-red-700',
      LOGIN: 'bg-slate-100 text-slate-700',
      LOGOUT: 'bg-slate-100 text-slate-700',
      FAILED_AUTH: 'bg-red-100 text-red-700',
      CONFIRM_ORDER: 'bg-emerald-100 text-emerald-700',
      CANCEL_ORDER: 'bg-rose-100 text-rose-700',
      AUTO_STOP_BILLING: 'bg-orange-100 text-orange-700',
      PRINT_PAYMENT: 'bg-indigo-100 text-indigo-700',
      VOID_PAYMENT: 'bg-red-100 text-red-700',
      DELETE_PAYMENT: 'bg-red-100 text-red-700',
      START_BILLING: 'bg-green-100 text-green-700',
      STOP_BILLING: 'bg-orange-100 text-orange-700',
      EXTEND_BILLING: 'bg-yellow-100 text-yellow-700',
      PAYMENT: 'bg-purple-100 text-purple-700',
    };
    return map[action] || 'bg-slate-100 text-slate-700';
  };

  const totalPages = Math.ceil(total / 20);

  const selectedLogDetail = useMemo(() => {
    if (!selectedLog) return [];
    const readable = selectedLog.metadata?.readable;
    const chunks = [
      { label: 'Ringkasan Aksi', value: readable?.title || `${selectedLog.action} ${selectedLog.entity}` },
      { label: 'Penjelasan', value: readable?.description || '-' },
      { label: 'Entity ID', value: selectedLog.entityId || '-' },
      { label: 'IP Address', value: selectedLog.ipAddress || '-' },
      { label: 'User Agent', value: selectedLog.userAgent || '-' },
      { label: 'Data Sebelum', value: selectedLog.beforeData ? JSON.stringify(selectedLog.beforeData, null, 2) : '-' },
      { label: 'Data Sesudah', value: selectedLog.afterData ? JSON.stringify(selectedLog.afterData, null, 2) : '-' },
      { label: 'Metadata Tambahan', value: selectedLog.metadata ? JSON.stringify(selectedLog.metadata, null, 2) : '-' },
    ];
    return chunks;
  }, [selectedLog]);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Audit Log</h1>

      {selectedLog && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 w-full max-w-2xl">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="font-semibold">Detail Audit Log</h3>
              <button onClick={() => setSelectedLog(null)} className="text-slate-500 hover:text-slate-700">✕</button>
            </div>
            <div className="p-4 space-y-2">
              <p className="text-sm text-slate-500">{formatDate(selectedLog.createdAt)} • {selectedLog.user?.name || 'System'} • {selectedLog.action} • {selectedLog.entity}</p>
              <div className="space-y-2 max-h-[360px] overflow-auto">
                {selectedLogDetail.map((item: any) => (
                  <div key={item.label} className="rounded border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-semibold text-slate-500">{item.label}</p>
                    <pre className="whitespace-pre-wrap text-xs text-slate-700">{item.value}</pre>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <select className="input text-sm" value={filterUserId} onChange={(e) => setFilterUserId(e.target.value)}>
            <option value="">Semua User</option>
            {users.map((u: any) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
          </select>
          <input className="input text-sm" placeholder="Entity..." value={filterEntity} onChange={(e) => setFilterEntity(e.target.value)} />
          <select className="input text-sm" value={filterAction} onChange={(e) => setFilterAction(e.target.value)}>
            <option value="">Semua Aksi</option>
            {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <input type="date" className="input text-sm" value={filterStart} onChange={(e) => setFilterStart(e.target.value)} />
          <input type="date" className="input text-sm" value={filterEnd} onChange={(e) => setFilterEnd(e.target.value)} />
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <p className="text-sm text-slate-500">{loading ? 'Memuat...' : `${total} entri ditemukan`}</p>
        </div>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Waktu</th>
                <th>User</th>
                <th>Aksi</th>
                <th>Entity</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {!loading && logs.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-slate-500 py-8">Tidak ada data</td></tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td className="text-xs text-slate-500 whitespace-nowrap">{formatDate(log.createdAt)}</td>
                    <td>
                      <div>
                        <p className="text-sm font-medium text-slate-900">{log.user?.name || 'System'}</p>
                        <p className="text-xs text-slate-500">{log.user?.role}</p>
                      </div>
                    </td>
                    <td>
                      <span className={`badge text-xs ${getActionColor(log.action)}`}>{log.action}</span>
                    </td>
                    <td>
                      <p className="text-sm text-slate-900">{log.entity}</p>
                    </td>
                    <td>
                      <button onClick={() => setSelectedLog(log)} className="text-xs px-2 py-1 rounded bg-sky-100 text-sky-700 hover:bg-sky-200">Detail</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="p-4 flex items-center justify-between border-t border-slate-200">
            <p className="text-sm text-slate-500">Halaman {page} dari {totalPages}</p>
            <div className="flex gap-2">
              <button onClick={() => fetchLogs(page - 1)} disabled={page <= 1} className="btn-secondary text-sm py-1 px-3">← Prev</button>
              <button onClick={() => fetchLogs(page + 1)} disabled={page >= totalPages} className="btn-secondary text-sm py-1 px-3">Next →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
