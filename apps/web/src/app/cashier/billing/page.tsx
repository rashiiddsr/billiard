'use client';

import { useEffect, useState, useCallback } from 'react';
import { tablesApi, billingApi, authApi } from '@/lib/api';
import { formatCurrency, getRemainingTime, getStatusLabel, formatTime } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import toast from 'react-hot-toast';

type ModalType = 'start' | 'extend' | 'stop' | 'reauth' | null;

export default function BillingPage() {
  const { user, isOwner } = useAuth();
  const [tables, setTables] = useState<any[]>([]);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalType>(null);
  const [selectedTable, setSelectedTable] = useState<any>(null);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [now, setNow] = useState(new Date());

  // Form state
  const [duration, setDuration] = useState(60);
  const [rateType, setRateType] = useState('HOURLY');
  const [manualRate, setManualRate] = useState('');
  const [extendMinutes, setExtendMinutes] = useState(30);
  const [pin, setPin] = useState('');
  const [reAuthToken, setReAuthToken] = useState('');
  const [reAuthPending, setReAuthPending] = useState<() => void>(() => () => {});
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [tablesData, sessionsData] = await Promise.all([
        tablesApi.list(),
        billingApi.getActiveSessions(),
      ]);
      setTables(tablesData);
      setActiveSessions(sessionsData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    const clockInterval = setInterval(() => setNow(new Date()), 1000);
    return () => { clearInterval(interval); clearInterval(clockInterval); };
  }, [fetchData]);

  const getSessionForTable = (tableId: string) =>
    activeSessions.find((s) => s.tableId === tableId);

  const openStartModal = (table: any) => {
    setSelectedTable(table);
    setDuration(60);
    setRateType('HOURLY');
    setManualRate('');

    if (isOwner) {
      // Owner needs re-auth
      setReAuthPending(() => () => startBilling(table, null));
      setPin('');
      setModal('reauth');
    } else {
      setModal('start');
    }
  };

  const handleReAuth = async () => {
    setSubmitting(true);
    try {
      const data = await authApi.reAuth(pin, 'pin');
      setReAuthToken(data.reAuthToken);
      setModal('start');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'PIN salah');
    } finally {
      setSubmitting(false);
    }
  };

  const startBilling = async (table?: any, token?: string | null) => {
    setSubmitting(true);
    try {
      const t = table || selectedTable;
      await billingApi.createSession({
        tableId: t.id,
        durationMinutes: duration,
        rateType,
        manualRatePerHour: rateType === 'MANUAL' ? parseFloat(manualRate) : undefined,
        reAuthToken: isOwner ? (token ?? reAuthToken) : undefined,
      });
      toast.success(`Billing dimulai untuk ${t.name}!`);
      setModal(null);
      setReAuthToken('');
      fetchData();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal memulai billing');
    } finally {
      setSubmitting(false);
    }
  };

  const extendSession = async () => {
    setSubmitting(true);
    try {
      await billingApi.extendSession(selectedSession.id, extendMinutes);
      toast.success('Sesi diperpanjang!');
      setModal(null);
      fetchData();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal memperpanjang sesi');
    } finally {
      setSubmitting(false);
    }
  };

  const stopSession = async () => {
    setSubmitting(true);
    try {
      await billingApi.stopSession(selectedSession.id);
      toast.success(`Sesi ${selectedSession.table?.name} dihentikan!`);
      setModal(null);
      fetchData();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal menghentikan sesi');
    } finally {
      setSubmitting(false);
    }
  };

  const estimatedCost = () => {
    if (!selectedTable) return 0;
    const rate = rateType === 'MANUAL' ? parseFloat(manualRate || '0') : parseFloat(selectedTable.hourlyRate);
    return Math.ceil((rate * duration) / 60);
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Billing Meja</h1>
        <p className="text-slate-400 font-mono">{formatTime(now)}</p>
      </div>

      {/* Table Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {tables.map((table) => {
          const session = getSessionForTable(table.id);
          const remaining = session ? getRemainingTime(session.endTime) : null;
          const isOccupied = !!session;
          const device = table.iotDevice;

          return (
            <div
              key={table.id}
              className={`card cursor-pointer hover:ring-2 transition-all ${
                isOccupied ? 'ring-1 ring-yellow-500/50 hover:ring-yellow-500' : 'hover:ring-blue-500'
              }`}
            >
              {/* Status indicator */}
              <div className="flex items-center justify-between mb-3">
                <span className={`badge text-xs ${isOccupied ? 'bg-yellow-500/20 text-yellow-300' : 'bg-green-500/20 text-green-300'}`}>
                  {isOccupied ? 'Aktif' : 'Kosong'}
                </span>
                {/* IoT lamp indicator */}
                <div className={`w-3 h-3 rounded-full ${
                  device?.isOnline
                    ? (isOccupied ? 'bg-yellow-400 shadow-yellow-400/50 shadow-md' : 'bg-slate-600')
                    : 'bg-red-500/50'
                }`} title={device?.isOnline ? 'Online' : 'Offline'} />
              </div>

              <h3 className="font-bold text-lg mb-1">{table.name}</h3>
              <p className="text-xs text-slate-400 mb-3">{formatCurrency(table.hourlyRate)}/jam</p>

              {session && remaining && (
                <div className="mb-3 p-2 bg-slate-700 rounded-lg">
                  <p className={`text-sm font-mono font-bold ${remaining.isWarning ? 'text-red-400 animate-pulse' : 'text-green-400'}`}>
                    {remaining.text}
                  </p>
                  <p className="text-xs text-slate-400">{formatCurrency(session.totalAmount)}</p>
                </div>
              )}

              <div className="flex flex-col gap-2">
                {!isOccupied ? (
                  <button
                    onClick={() => openStartModal(table)}
                    className="btn-primary text-xs py-1.5"
                  >
                    Mulai
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => { setSelectedSession(session); setExtendMinutes(30); setModal('extend'); }}
                      className="btn-secondary text-xs py-1.5"
                    >
                      Perpanjang
                    </button>
                    <button
                      onClick={() => { setSelectedSession(session); setModal('stop'); }}
                      className="btn-danger text-xs py-1.5"
                    >
                      Hentikan
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Active Sessions Summary */}
      {activeSessions.length > 0 && (
        <div className="card">
          <h2 className="font-semibold mb-4">Ringkasan Sesi Aktif</h2>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Meja</th>
                  <th>Mulai</th>
                  <th>Selesai</th>
                  <th>Sisa Waktu</th>
                  <th>Total</th>
                  <th>Kasir</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {activeSessions.map((s) => {
                  const remaining = getRemainingTime(s.endTime);
                  return (
                    <tr key={s.id}>
                      <td className="font-medium">{s.table?.name}</td>
                      <td className="text-slate-400 text-xs">{new Date(s.startTime).toLocaleTimeString('id-ID')}</td>
                      <td className="text-slate-400 text-xs">{new Date(s.endTime).toLocaleTimeString('id-ID')}</td>
                      <td>
                        <span className={`font-mono text-sm ${remaining.isWarning ? 'text-red-400 font-bold' : 'text-green-400'}`}>
                          {remaining.text}
                        </span>
                      </td>
                      <td className="font-medium">{formatCurrency(s.totalAmount)}</td>
                      <td className="text-slate-400 text-sm">{s.createdBy?.name}</td>
                      <td>
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setSelectedSession(s); setExtendMinutes(30); setModal('extend'); }}
                            className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded"
                          >
                            +Waktu
                          </button>
                          <button
                            onClick={() => { setSelectedSession(s); setModal('stop'); }}
                            className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 rounded"
                          >
                            Stop
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Re-Auth Modal (Owner) ── */}
      {modal === 'reauth' && (
        <Modal title="Verifikasi Owner" onClose={() => setModal(null)}>
          <p className="text-sm text-slate-400 mb-4">Masukkan PIN untuk memulai billing sebagai Owner.</p>
          <input
            type="password"
            className="input mb-4"
            placeholder="PIN 6 digit"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            maxLength={6}
            autoFocus
          />
          <div className="flex gap-2">
            <button onClick={() => setModal(null)} className="btn-secondary flex-1">Batal</button>
            <button onClick={handleReAuth} className="btn-primary flex-1" disabled={submitting || pin.length < 4}>
              {submitting ? 'Memverifikasi...' : 'Verifikasi'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Start Billing Modal ── */}
      {modal === 'start' && selectedTable && (
        <Modal title={`Mulai Billing — ${selectedTable.name}`} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div>
              <label className="label">Durasi (menit)</label>
              <div className="flex gap-2 mb-2">
                {[30, 60, 90, 120, 180].map((d) => (
                  <button
                    key={d}
                    onClick={() => setDuration(d)}
                    className={`flex-1 py-1.5 text-xs rounded-lg ${duration === d ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'}`}
                  >
                    {d}m
                  </button>
                ))}
              </div>
              <input
                type="number"
                className="input"
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value) || 60)}
                min={30}
                step={15}
              />
            </div>
            <div>
              <label className="label">Tipe Rate</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setRateType('HOURLY')}
                  className={`flex-1 py-2 rounded-lg text-sm ${rateType === 'HOURLY' ? 'bg-blue-600' : 'bg-slate-700'}`}
                >
                  Per Jam ({formatCurrency(selectedTable.hourlyRate)})
                </button>
                <button
                  onClick={() => setRateType('MANUAL')}
                  className={`flex-1 py-2 rounded-lg text-sm ${rateType === 'MANUAL' ? 'bg-blue-600' : 'bg-slate-700'}`}
                >
                  Manual
                </button>
              </div>
            </div>
            {rateType === 'MANUAL' && (
              <div>
                <label className="label">Rate per Jam (Rp)</label>
                <input
                  type="number"
                  className="input"
                  placeholder="30000"
                  value={manualRate}
                  onChange={(e) => setManualRate(e.target.value)}
                />
              </div>
            )}
            <div className="p-3 bg-slate-700 rounded-lg">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Durasi</span>
                <span>{duration} menit</span>
              </div>
              <div className="flex justify-between font-bold mt-1">
                <span className="text-slate-400">Estimasi Total</span>
                <span className="text-green-400">{formatCurrency(estimatedCost())}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setModal(null)} className="btn-secondary flex-1">Batal</button>
              <button onClick={() => startBilling()} className="btn-success flex-1" disabled={submitting}>
                {submitting ? 'Memulai...' : '🎱 Mulai Billing'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Extend Modal ── */}
      {modal === 'extend' && selectedSession && (
        <Modal title={`Perpanjang — ${selectedSession.table?.name}`} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div>
              <label className="label">Tambah Waktu (menit)</label>
              <div className="flex gap-2 mb-2">
                {[15, 30, 60, 90].map((d) => (
                  <button
                    key={d}
                    onClick={() => setExtendMinutes(d)}
                    className={`flex-1 py-1.5 text-xs rounded-lg ${extendMinutes === d ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'}`}
                  >
                    +{d}m
                  </button>
                ))}
              </div>
              <input
                type="number"
                className="input"
                value={extendMinutes}
                onChange={(e) => setExtendMinutes(parseInt(e.target.value) || 30)}
                min={15}
                step={15}
              />
            </div>
            <div className="p-3 bg-slate-700 rounded-lg text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Biaya tambahan</span>
                <span>{formatCurrency(Math.ceil(parseFloat(selectedSession.ratePerHour) * extendMinutes / 60))}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setModal(null)} className="btn-secondary flex-1">Batal</button>
              <button onClick={extendSession} className="btn-primary flex-1" disabled={submitting}>
                {submitting ? 'Memproses...' : 'Perpanjang'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Stop Modal ── */}
      {modal === 'stop' && selectedSession && (
        <Modal title="Hentikan Sesi?" onClose={() => setModal(null)}>
          <p className="text-slate-300 mb-4">
            Yakin hentikan sesi <span className="font-bold">{selectedSession.table?.name}</span>?
            Biaya akan dihitung berdasarkan waktu aktual.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setModal(null)} className="btn-secondary flex-1">Batal</button>
            <button onClick={stopSession} className="btn-danger flex-1" disabled={submitting}>
              {submitting ? 'Menghentikan...' : 'Hentikan Sesi'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
