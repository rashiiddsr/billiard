'use client';

import { useEffect, useState } from 'react';
import { auditApi, usersApi } from '@/lib/api';
import { formatDate } from '@/lib/utils';

const ACTIONS = [
  'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'FAILED_AUTH',
  'START_BILLING', 'STOP_BILLING', 'EXTEND_BILLING', 'PAYMENT', 'DISCOUNT_APPROVED',
];

export default function AuditPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const [filterUserId, setFilterUserId] = useState('');
  const [filterEntity, setFilterEntity] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');

  useEffect(() => {
    usersApi.list().then(setUsers).catch(console.error);
    fetchLogs();
  }, []);

  const fetchLogs = async (p = 1) => {
    setLoading(true);
    try {
      const data = await auditApi.list({
        userId: filterUserId || undefined,
        entity: filterEntity || undefined,
        action: filterAction || undefined,
        startDate: filterStart ? new Date(filterStart + 'T00:00:00').toISOString() : undefined,
        endDate: filterEnd ? new Date(filterEnd + 'T23:59:59').toISOString() : undefined,
        page: p,
        limit: 50,
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

  const getActionColor = (action: string) => {
    const map: Record<string, string> = {
      CREATE: 'bg-green-500/20 text-green-300',
      UPDATE: 'bg-blue-500/20 text-blue-300',
      DELETE: 'bg-red-500/20 text-red-300',
      LOGIN: 'bg-slate-500/20 text-slate-300',
      LOGOUT: 'bg-slate-500/20 text-slate-300',
      FAILED_AUTH: 'bg-red-500/20 text-red-300',
      START_BILLING: 'bg-green-500/20 text-green-300',
      STOP_BILLING: 'bg-orange-500/20 text-orange-300',
      EXTEND_BILLING: 'bg-yellow-500/20 text-yellow-300',
      PAYMENT: 'bg-purple-500/20 text-purple-300',
      DISCOUNT_APPROVED: 'bg-pink-500/20 text-pink-300',
    };
    return map[action] || 'bg-slate-500/20 text-slate-300';
  };

  const totalPages = Math.ceil(total / 50);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Audit Log</h1>

      {/* Filters */}
      <div className="card">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
        <div className="mt-3 flex gap-2">
          <button onClick={() => fetchLogs(1)} className="btn-primary text-sm py-2" disabled={loading}>
            {loading ? 'Memuat...' : 'Filter'}
          </button>
          <button onClick={() => {
            setFilterUserId(''); setFilterEntity(''); setFilterAction('');
            setFilterStart(''); setFilterEnd('');
          }} className="btn-secondary text-sm py-2">Reset</button>
        </div>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b border-slate-700">
          <p className="text-sm text-slate-400">{total} entri ditemukan</p>
        </div>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Waktu</th>
                <th>User</th>
                <th>Aksi</th>
                <th>Entity</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-slate-400 py-8">Tidak ada data</td></tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td className="text-xs text-slate-400 whitespace-nowrap">{formatDate(log.createdAt)}</td>
                    <td>
                      <div>
                        <p className="text-sm font-medium">{log.user?.name || 'System'}</p>
                        <p className="text-xs text-slate-400">{log.user?.role}</p>
                      </div>
                    </td>
                    <td>
                      <span className={`badge text-xs ${getActionColor(log.action)}`}>{log.action}</span>
                    </td>
                    <td>
                      <p className="text-sm">{log.entity}</p>
                      {log.entityId && <p className="text-xs text-slate-400 font-mono">{log.entityId.substring(0, 12)}...</p>}
                    </td>
                    <td className="max-w-xs">
                      {log.afterData && (
                        <p className="text-xs text-slate-400 truncate">
                          {JSON.stringify(log.afterData).substring(0, 80)}
                        </p>
                      )}
                      {log.metadata && (
                        <p className="text-xs text-slate-500 truncate">
                          {JSON.stringify(log.metadata).substring(0, 60)}
                        </p>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 flex items-center justify-between border-t border-slate-700">
            <p className="text-sm text-slate-400">Halaman {page} dari {totalPages}</p>
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
