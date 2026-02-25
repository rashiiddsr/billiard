'use client';

import { useEffect, useState, useCallback } from 'react';
import { tablesApi, billingApi, authApi } from '@/lib/api';
import { formatCurrency, getRemainingTime, formatTime } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import toast from 'react-hot-toast';

type ModalType = 'start' | 'extend' | 'stop' | 'reauth' | null;

export default function BillingPage() {
  const { isOwner } = useAuth();
  const [tables, setTables] = useState<any[]>([]);
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalType>(null);
  const [selectedTable, setSelectedTable] = useState<any>(null);
  const [selectedSession, setSelectedSession] = useState<any>(null);
  const [now, setNow] = useState(new Date());

  const [duration, setDuration] = useState(60);
  const [rateType, setRateType] = useState('HOURLY');
  const [manualRate, setManualRate] = useState('');
  const [extendMinutes, setExtendMinutes] = useState(30);
  const [pin, setPin] = useState('');
  const [reAuthToken, setReAuthToken] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [tablesData, sessionsData] = await Promise.all([tablesApi.list(), billingApi.getActiveSessions()]);
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
    return () => {
      clearInterval(interval);
      clearInterval(clockInterval);
    };
  }, [fetchData]);

  const getSessionForTable = (tableId: string) => activeSessions.find((s) => s.tableId === tableId);

  const openStartModal = (table: any) => {
    setSelectedTable(table);
    setDuration(60);
    setRateType('HOURLY');
    setManualRate('');

    if (isOwner) {
      setPin('');
      setModal('reauth');
      return;
    }
    setModal('start');
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

  const startBilling = async () => {
    setSubmitting(true);
    try {
      await billingApi.createSession({
        tableId: selectedTable.id,
        durationMinutes: duration,
        rateType,
        manualRatePerHour: rateType === 'MANUAL' ? parseFloat(manualRate) : undefined,
        reAuthToken: isOwner ? reAuthToken : undefined,
      });
      toast.success(`Billing dimulai untuk ${selectedTable.name}!`);
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

  const occupiedCount = activeSessions.length;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-cyan-400 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="card bg-gradient-to-r from-slate-900/90 via-blue-900/30 to-cyan-900/30">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Live Control</p>
            <h1 className="mt-1 text-2xl font-bold">Billing Meja Interaktif</h1>
            <p className="mt-1 text-sm text-slate-300">Pilih meja secara visual, mulai sesi, perpanjang waktu, dan monitor status real-time.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm sm:min-w-[260px]">
            <SummaryBox label="Sesi Aktif" value={occupiedCount.toString()} accent="text-amber-300" />
            <SummaryBox label="Meja Kosong" value={(tables.length - occupiedCount).toString()} accent="text-emerald-300" />
            <SummaryBox label="Total Meja" value={tables.length.toString()} accent="text-cyan-300" />
            <SummaryBox label="Jam" value={formatTime(now)} accent="text-white" mono />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {tables.map((table) => {
          const session = getSessionForTable(table.id);
          const remaining = session ? getRemainingTime(session.endTime) : null;
          const isOccupied = !!session;
          const device = table.iotDevice;

          return (
            <div key={table.id} className="card transition-all hover:-translate-y-0.5 hover:border-cyan-400/40">
              <div className="mb-4 flex items-center justify-between">
                <span className={`badge ${isOccupied ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}`}>
                  {isOccupied ? 'Sedang Main' : 'Siap Pakai'}
                </span>
                <span className={`h-2.5 w-2.5 rounded-full ${device?.isOnline ? 'bg-emerald-400' : 'bg-red-500'}`} title={device?.isOnline ? 'Online' : 'Offline'} />
              </div>

              <div className="mb-3">
                <h3 className="text-lg font-bold">{table.name}</h3>
                <p className="text-xs text-slate-400">{formatCurrency(table.hourlyRate)}/jam</p>
              </div>

              <TablePreview occupied={isOccupied} warning={remaining?.isWarning} />

              {session && remaining && (
                <div className="mb-3 rounded-xl border border-white/10 bg-slate-800/80 p-3">
                  <p className={`font-mono text-sm font-bold ${remaining.isWarning ? 'animate-pulse text-red-400' : 'text-emerald-400'}`}>{remaining.text}</p>
                  <p className="mt-1 text-xs text-slate-400">Tagihan sementara: {formatCurrency(session.totalAmount)}</p>
                </div>
              )}

              <div className="flex flex-col gap-2">
                {!isOccupied ? (
                  <button onClick={() => openStartModal(table)} className="btn-primary py-2 text-sm">
                    Mulai Billing
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setSelectedSession(session);
                        setExtendMinutes(30);
                        setModal('extend');
                      }}
                      className="btn-secondary py-2 text-sm"
                    >
                      Perpanjang Waktu
                    </button>
                    <button
                      onClick={() => {
                        setSelectedSession(session);
                        setModal('stop');
                      }}
                      className="btn-danger py-2 text-sm"
                    >
                      Hentikan Sesi
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {activeSessions.length > 0 && (
        <div className="card">
          <h2 className="mb-4 font-semibold">Ringkasan Sesi Aktif</h2>
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
                      <td className="text-xs text-slate-400">{new Date(s.startTime).toLocaleTimeString('id-ID')}</td>
                      <td className="text-xs text-slate-400">{new Date(s.endTime).toLocaleTimeString('id-ID')}</td>
                      <td>
                        <span className={`font-mono text-sm ${remaining.isWarning ? 'font-bold text-red-400' : 'text-emerald-400'}`}>{remaining.text}</span>
                      </td>
                      <td className="font-medium">{formatCurrency(s.totalAmount)}</td>
                      <td className="text-sm text-slate-400">{s.createdBy?.name}</td>
                      <td>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setSelectedSession(s);
                              setExtendMinutes(30);
                              setModal('extend');
                            }}
                            className="rounded-lg bg-slate-700 px-2 py-1 text-xs hover:bg-slate-600"
                          >
                            +Waktu
                          </button>
                          <button
                            onClick={() => {
                              setSelectedSession(s);
                              setModal('stop');
                            }}
                            className="rounded-lg bg-red-600 px-2 py-1 text-xs hover:bg-red-500"
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

      {modal === 'reauth' && (
        <Modal title="Verifikasi Owner" onClose={() => setModal(null)}>
          <p className="mb-4 text-sm text-slate-400">Masukkan PIN untuk memulai billing sebagai Owner.</p>
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

      {modal === 'start' && selectedTable && (
        <Modal title={`Mulai Billing — ${selectedTable.name}`} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div>
              <label className="label">Durasi (menit)</label>
              <div className="mb-2 grid grid-cols-5 gap-2">
                {[30, 60, 90, 120, 180].map((d) => (
                  <button key={d} onClick={() => setDuration(d)} className={`rounded-lg py-1.5 text-xs ${duration === d ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'}`}>
                    {d}m
                  </button>
                ))}
              </div>
              <input type="number" className="input" value={duration} onChange={(e) => setDuration(parseInt(e.target.value) || 60)} min={30} step={15} />
            </div>
            <div>
              <label className="label">Tipe Rate</label>
              <div className="flex gap-2">
                <button onClick={() => setRateType('HOURLY')} className={`flex-1 rounded-lg py-2 text-sm ${rateType === 'HOURLY' ? 'bg-blue-600' : 'bg-slate-700'}`}>
                  Per Jam ({formatCurrency(selectedTable.hourlyRate)})
                </button>
                <button onClick={() => setRateType('MANUAL')} className={`flex-1 rounded-lg py-2 text-sm ${rateType === 'MANUAL' ? 'bg-blue-600' : 'bg-slate-700'}`}>
                  Manual
                </button>
              </div>
            </div>
            {rateType === 'MANUAL' && (
              <div>
                <label className="label">Rate per Jam (Rp)</label>
                <input type="number" className="input" placeholder="30000" value={manualRate} onChange={(e) => setManualRate(e.target.value)} />
              </div>
            )}
            <div className="rounded-lg border border-white/10 bg-slate-800/80 p-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Durasi</span>
                <span>{duration} menit</span>
              </div>
              <div className="mt-1 flex justify-between font-bold">
                <span className="text-slate-400">Estimasi Total</span>
                <span className="text-emerald-400">{formatCurrency(estimatedCost())}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setModal(null)} className="btn-secondary flex-1">Batal</button>
              <button onClick={startBilling} className="btn-success flex-1" disabled={submitting}>
                {submitting ? 'Memulai...' : '🎱 Mulai Billing'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {modal === 'extend' && selectedSession && (
        <Modal title={`Perpanjang — ${selectedSession.table?.name}`} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <div>
              <label className="label">Tambah Waktu (menit)</label>
              <div className="mb-2 flex gap-2">
                {[15, 30, 60, 90].map((d) => (
                  <button key={d} onClick={() => setExtendMinutes(d)} className={`flex-1 rounded-lg py-1.5 text-xs ${extendMinutes === d ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'}`}>
                    +{d}m
                  </button>
                ))}
              </div>
              <input type="number" className="input" value={extendMinutes} onChange={(e) => setExtendMinutes(parseInt(e.target.value) || 30)} min={15} step={15} />
            </div>
            <div className="rounded-lg border border-white/10 bg-slate-800/80 p-3 text-sm">
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

      {modal === 'stop' && selectedSession && (
        <Modal title="Hentikan Sesi?" onClose={() => setModal(null)}>
          <p className="mb-4 text-slate-300">
            Yakin hentikan sesi <span className="font-bold">{selectedSession.table?.name}</span>? Biaya akan dihitung berdasarkan waktu aktual.
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

function SummaryBox({ label, value, accent, mono }: { label: string; value: string; accent: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-800/70 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`text-base font-semibold ${accent} ${mono ? 'font-mono text-sm' : ''}`}>{value}</p>
    </div>
  );
}

function TablePreview({ occupied, warning }: { occupied: boolean; warning?: boolean }) {
  return (
    <div className="mb-4 rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-800 p-4">
      <div className="relative mx-auto h-24 w-36">
        <div className={`absolute left-5 top-6 h-12 w-24 rounded-xl border-2 ${occupied ? 'border-amber-400 bg-amber-400/10' : 'border-cyan-400 bg-cyan-400/10'}`} />
        <div className="absolute left-0 top-2 h-5 w-5 rounded-full border border-slate-500 bg-slate-700" />
        <div className="absolute right-0 top-2 h-5 w-5 rounded-full border border-slate-500 bg-slate-700" />
        <div className="absolute bottom-0 left-0 h-5 w-5 rounded-full border border-slate-500 bg-slate-700" />
        <div className="absolute bottom-0 right-0 h-5 w-5 rounded-full border border-slate-500 bg-slate-700" />
      </div>
      <p className={`mt-2 text-center text-xs ${warning ? 'text-red-400' : 'text-slate-400'}`}>{occupied ? 'Meja sedang digunakan' : 'Meja siap dimainkan'}</p>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/95 shadow-2xl shadow-black/60">
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
