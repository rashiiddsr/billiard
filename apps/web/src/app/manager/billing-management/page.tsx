'use client';

import { useCallback, useEffect, useState } from 'react';
import { billingApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function ManagerBillingManagementPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const data = await billingApi.getSessions({ status: 'COMPLETED', limit: 300 });
      const unpaid = (data.data || []).filter((session: any) => (session.payments || []).length === 0);
      setSessions(unpaid);
    } catch {
      toast.error('Gagal memuat data billing selesai');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = async (session: any) => {
    if (!confirm(`Hapus billing ${session.table?.name || '-'} (${new Date(session.startTime).toLocaleString('id-ID')})?`)) return;
    setDeletingId(session.id);
    try {
      await billingApi.deleteSession(session.id);
      toast.success('Billing selesai berhasil dihapus');
      setSessions((prev) => prev.filter((x) => x.id !== session.id));
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal menghapus billing');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-bold">Manajemen Billing</h1>
        <p className="text-sm text-slate-500">Hapus billing yang sudah selesai tetapi belum dibayar.</p>
      </div>

      <div className="card p-0">
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Meja</th>
                <th>Mulai</th>
                <th>Selesai</th>
                <th>Durasi</th>
                <th>Total</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="py-8 text-center text-slate-500">Memuat...</td></tr>
              ) : sessions.length === 0 ? (
                <tr><td colSpan={6} className="py-8 text-center text-slate-500">Tidak ada billing selesai yang belum dibayar</td></tr>
              ) : sessions.map((x) => (
                <tr key={x.id}>
                  <td>{x.table?.name || '-'}</td>
                  <td>{new Date(x.startTime).toLocaleString('id-ID')}</td>
                  <td>{new Date(x.actualEndTime || x.endTime).toLocaleString('id-ID')}</td>
                  <td>{x.durationMinutes} menit</td>
                  <td className="font-semibold">{formatCurrency(x.totalAmount || 0)}</td>
                  <td>
                    <button className="rounded bg-red-100 px-2 py-1 text-xs text-red-700" onClick={() => handleDelete(x)} disabled={deletingId === x.id}>
                      {deletingId === x.id ? 'Menghapus...' : 'Hapus'}
                    </button>
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
