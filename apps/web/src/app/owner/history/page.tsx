'use client';

import { useEffect, useState } from 'react';
import { billingApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

export default function OwnerHistoryPage() {
  const [sessions, setSessions] = useState<any[]>([]);

  useEffect(() => {
    billingApi.getSessions({ limit: 200 }).then((r) => {
      const rows = (r.data || []).filter((x: any) => x.rateType === 'OWNER_LOCK');
      setSessions(rows);
    });
  }, []);

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-bold">Histori Owner</h1>
      <div className="card p-0"><div className="table-wrapper"><table className="data-table"><thead><tr><th>Meja</th><th>Mulai</th><th>Selesai</th><th>Status</th><th>Total</th></tr></thead><tbody>{sessions.map((s) => <tr key={s.id}><td>{s.table?.name}</td><td>{new Date(s.startTime).toLocaleString('id-ID')}</td><td>{s.actualEndTime ? new Date(s.actualEndTime).toLocaleString('id-ID') : '-'}</td><td>{s.status}</td><td>{formatCurrency(s.totalAmount)}</td></tr>)}</tbody></table></div></div>
    </div>
  );
}
