'use client';

import { useEffect, useState } from 'react';
import { usersApi } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';

type Role = 'OWNER' | 'MANAGER' | 'CASHIER';

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('CASHIER');
  const [pin, setPin] = useState('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const data = await usersApi.list();
      setUsers(data);
    } catch (e) {
      toast.error('Gagal memuat users');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditUser(null);
    setName(''); setEmail(''); setPassword(''); setRole('CASHIER'); setPin(''); setIsActive(true);
    setShowForm(true);
  };

  const openEdit = (user: any) => {
    setEditUser(user);
    setName(user.name); setEmail(user.email); setPassword(''); setRole(user.role);
    setPin(''); setIsActive(user.isActive);
    setShowForm(true);
  };

  const submit = async () => {
    if (!name || !email) { toast.error('Nama dan email wajib diisi'); return; }
    if (!editUser && !password) { toast.error('Password wajib untuk user baru'); return; }
    setSubmitting(true);
    try {
      const data: any = { name, email, role, isActive };
      if (password) data.password = password;
      if (pin) data.pin = pin;

      if (editUser) {
        await usersApi.update(editUser.id, data);
        toast.success('User diperbarui');
      } else {
        await usersApi.create(data);
        toast.success('User dibuat');
      }
      setShowForm(false);
      fetchUsers();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Gagal');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (user: any) => {
    try {
      await usersApi.update(user.id, { isActive: !user.isActive });
      toast.success(`User ${!user.isActive ? 'diaktifkan' : 'dinonaktifkan'}`);
      fetchUsers();
    } catch (e) {
      toast.error('Gagal');
    }
  };

  const roleColor: Record<Role, string> = {
    OWNER: 'bg-yellow-500/20 text-yellow-300',
    MANAGER: 'bg-blue-500/20 text-blue-300',
    CASHIER: 'bg-green-500/20 text-green-300',
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Manajemen User</h1>
        <button onClick={openCreate} className="btn-primary">+ Tambah User</button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h3 className="font-semibold">{editUser ? 'Edit User' : 'Tambah User Baru'}</h3>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="label">Nama</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label className="label">Email</label>
                <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label className="label">Password {editUser && '(kosongkan jika tidak diubah)'}</label>
                <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div>
                <label className="label">Role</label>
                <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  <option value="CASHIER">CASHIER</option>
                  <option value="MANAGER">MANAGER</option>
                  <option value="OWNER">OWNER</option>
                </select>
              </div>
              {role === 'OWNER' && (
                <div>
                  <label className="label">PIN (6 digit, untuk re-auth billing)</label>
                  <input type="password" className="input" maxLength={6} placeholder="123456" value={pin} onChange={(e) => setPin(e.target.value)} />
                </div>
              )}
              {editUser && (
                <div className="flex items-center gap-3">
                  <input type="checkbox" id="isActive" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                  <label htmlFor="isActive" className="text-sm">Aktif</label>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">Batal</button>
                <button onClick={submit} className="btn-primary flex-1" disabled={submitting}>
                  {submitting ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="card p-0 overflow-hidden">
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Dibuat</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8 text-slate-400">Memuat...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-slate-400">Tidak ada user</td></tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id}>
                    <td className="font-medium">{user.name}</td>
                    <td className="text-slate-400">{user.email}</td>
                    <td>
                      <span className={`badge ${roleColor[user.role as Role]}`}>{user.role}</span>
                    </td>
                    <td>
                      <span className={`badge ${user.isActive ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                        {user.isActive ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="text-slate-400 text-sm">{formatDate(user.createdAt)}</td>
                    <td>
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(user)} className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded">
                          Edit
                        </button>
                        <button onClick={() => toggleActive(user)} className={`text-xs px-2 py-1 rounded ${user.isActive ? 'bg-red-600/20 hover:bg-red-600/40 text-red-400' : 'bg-green-600/20 hover:bg-green-600/40 text-green-400'}`}>
                          {user.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
