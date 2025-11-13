import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createUser, deleteUser, getUsers, updateUser } from '../services/users';
import { usePages } from '../hooks/usePages';
import type { PortalUser, UserRole } from '../types';

interface UserFormState {
  username: string;
  password: string;
  role: UserRole;
  allowedPages: string[];
}

const defaultFormState: UserFormState = {
  username: '',
  password: '',
  role: 'user',
  allowedPages: []
};

const roleOptions: UserRole[] = ['user', 'admin'];

export const AdminUsersPage = () => {
  const [users, setUsers] = useState<PortalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [form, setForm] = useState<UserFormState>(defaultFormState);
  const [creating, setCreating] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<UserFormState>(defaultFormState);
  const { pages } = usePages();

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const data = await getUsers();
        setUsers(data);
        setError('');
      } catch (loadError) {
        console.error('Failed to load users', loadError);
        setError('לא ניתן לטעון את רשימת המשתמשים.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const timeout = setTimeout(() => setFeedback(''), 2500);
    return () => clearTimeout(timeout);
  }, [feedback]);

  const sortedUsers = useMemo(
    () => users.slice().sort((a, b) => a.username.localeCompare(b.username)),
    [users]
  );

  const sortedPages = useMemo(
    () => pages.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [pages]
  );

  const createPagesDisabled = form.role === 'admin';
  const editPagesDisabled = editForm.role === 'admin';

  const handleCreateAllowedPageToggle = (pageId: string, checked: boolean) => {
    setForm((state) => {
      const next = new Set(state.allowedPages);
      if (checked) {
        next.add(pageId);
      } else {
        next.delete(pageId);
      }
      return { ...state, allowedPages: Array.from(next) };
    });
  };

  const handleEditAllowedPageToggle = (pageId: string, checked: boolean) => {
    setEditForm((state) => {
      const next = new Set(state.allowedPages);
      if (checked) {
        next.add(pageId);
      } else {
        next.delete(pageId);
      }
      return { ...state, allowedPages: Array.from(next) };
    });
  };

  const resetForm = () => {
    setForm(defaultFormState);
  };

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.username || !form.password) {
      setError('שם משתמש וסיסמה הם שדות חובה.');
      return;
    }
    setCreating(true);
    try {
      const created = await createUser({
        username: form.username.trim(),
        password: form.password,
        role: form.role,
        allowedPages: form.allowedPages
      });
      setUsers((current) => [...current, created]);
      resetForm();
      setFeedback('המשתמש נוצר בהצלחה.');
      setError('');
    } catch (createError: unknown) {
      console.error('Failed to create user', createError);
      const message =
        (createError as { response?: { data?: { message?: string } } }).response?.data?.message ??
        'לא ניתן ליצור משתמש.';
      setError(message);
    } finally {
      setCreating(false);
    }
  };

  const beginEdit = (user: PortalUser) => {
    setEditingId(user.id);
    setEditForm({
      username: user.username,
      password: '',
      role: user.role,
      allowedPages: user.allowedPages ?? []
    });
    setError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(defaultFormState);
  };

  const handleEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingId) return;
    setActionInProgress(true);
    try {
      const payload: Partial<UserFormState> = {
        username: editForm.username.trim(),
        role: editForm.role,
        allowedPages: editForm.allowedPages
      };
      if (editForm.password) {
        payload.password = editForm.password;
      }
      const updated = await updateUser(editingId, payload);
      setUsers((current) => current.map((user) => (user.id === updated.id ? updated : user)));
      setFeedback('המשתמש עודכן בהצלחה.');
      cancelEdit();
    } catch (updateError: unknown) {
      console.error('Failed to update user', updateError);
      const message =
        (updateError as { response?: { data?: { message?: string } } }).response?.data?.message ??
        'לא ניתן לעדכן את המשתמש.';
      setError(message);
    } finally {
      setActionInProgress(false);
    }
  };

  const handleDelete = async (user: PortalUser) => {
    const confirmed = window.confirm(
      `למחוק את המשתמש "${user.username}"? פעולה זו אינה ניתנת לביטול.`
    );
    if (!confirmed) return;
    setActionInProgress(true);
    try {
      await deleteUser(user.id);
      setUsers((current) => current.filter((entry) => entry.id !== user.id));
      setFeedback('המשתמש הוסר.');
    } catch (deleteError: unknown) {
      console.error('Failed to delete user', deleteError);
      const message =
        (deleteError as { response?: { data?: { message?: string } } }).response?.data?.message ??
        'לא ניתן למחוק את המשתמש.';
      setError(message);
    } finally {
      setActionInProgress(false);
    }
  };

  return (
    <div className="flex-1 space-y-6 p-6 text-right">
      <header className="space-y-2">
        <h2 className="text-2xl font-bold text-strong">ניהול משתמשים</h2>
        <p className="text-sm text-muted">ניהול משתמשי הפורטל. הסיסמאות מאוחסנות בצורה מאובטחת באמצעות הצפנת bcrypt.</p>
      </header>

      <section className="panel space-y-6 p-6">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-strong">יצירת משתמש</h3>
          <p className="text-sm text-muted">הזינו שם משתמש ייחודי, סיסמה בטוחה ובחרו תפקיד מתאים.</p>
        </div>
        <form onSubmit={handleCreate} className="grid gap-4 md:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase text-muted">שם משתמש</span>
            <input
              type="text"
              value={form.username}
              onChange={(event) => setForm((state) => ({ ...state, username: event.target.value }))}
              className="w-full rounded-full border border-soft bg-surface px-4 py-3 text-sm text-strong focus:border-primary focus:outline-none"
              required
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase text-muted">סיסמה</span>
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm((state) => ({ ...state, password: event.target.value }))}
              className="w-full rounded-full border border-soft bg-surface px-4 py-3 text-sm text-strong focus:border-primary focus:outline-none"
              required
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase text-muted">תפקיד</span>
            <select
              value={form.role}
              onChange={(event) =>
                setForm((state) => ({ ...state, role: event.target.value as UserRole }))
              }
              className="w-full rounded-full border border-soft bg-surface px-4 py-3 text-sm text-strong focus:border-primary focus:outline-none"
            >
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {role === 'admin' ? 'מנהל מערכת' : 'צופה'}
                </option>
              ))}
            </select>
          </label>
          <div className="md:col-span-3 text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase text-muted">דפים נגישים</span>
            {createPagesDisabled ? (
              <p className="rounded-2xl border border-soft bg-surface-elevated px-4 py-3 text-xs text-muted">
                מנהלי מערכת רואים את כל הדפים ואין צורך להקצות הרשאות ייחודיות.
              </p>
            ) : sortedPages.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {sortedPages.map((page) => {
                  const checked = form.allowedPages.includes(page.id);
                  return (
                    <label
                      key={page.id}
                      className={`flex items-center justify-between gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold transition ${
                        checked ? 'border-primary/60 bg-primary/10 text-primary' : 'border-soft text-muted'
                      }`}
                    >
                      <span className="truncate">{page.name}</span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) =>
                          handleCreateAllowedPageToggle(page.id, event.target.checked)
                        }
                        className="h-4 w-4 accent-primary"
                      />
                    </label>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed border-soft bg-surface-elevated px-4 py-3 text-xs text-muted">
                אין דפים זמינים כרגע. צרו דפים באזור העיצוב ולאחר מכן שייכו אותם למשתמשים.
              </p>
            )}
          </div>
          <div className="md:col-span-3">
            <button
              type="submit"
              disabled={creating}
              className="rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white shadow-soft transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {creating ? 'שומר…' : 'הוספת משתמש'}
            </button>
          </div>
        </form>
      </section>

      <section className="panel space-y-6 p-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-strong">משתמשים קיימים</h3>
          {loading ? <span className="text-xs text-muted">טוען משתמשים…</span> : null}
        </div>
        {error ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</p>
        ) : null}
        {feedback ? (
          <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-600">{feedback}</p>
        ) : null}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[var(--color-border)] text-sm">
            <thead className="bg-surface-elevated">
              <tr>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted">שם משתמש</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted">תפקיד</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted">דפים</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted">נוצר</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted">עודכן</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)] bg-surface">
              {sortedUsers.map((user) => (
                <tr key={user.id} className="transition hover:bg-surface-elevated">
                  <td className="px-3 py-2 font-semibold text-strong">{user.username}</td>
                  <td className="px-3 py-2 text-muted">{user.role}</td>
                  <td className="px-3 py-2 text-muted">
                    {user.role === 'admin'
                      ? 'כל הדפים'
                      : user.allowedPages.length > 0
                      ? `${user.allowedPages.length} דפים`
                      : 'ללא'}
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {user.createdAt ? new Date(user.createdAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-3 py-2 text-muted">
                    {user.updatedAt ? new Date(user.updatedAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-row-reverse items-center gap-2">
                      <button
                        onClick={() => beginEdit(user)}
                        disabled={actionInProgress}
                        className="rounded-full bg-surface-elevated px-3 py-1 text-xs font-semibold text-muted transition hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        עריכה
                      </button>
                      <button
                        onClick={() => handleDelete(user)}
                        disabled={actionInProgress}
                        className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-600 transition hover:bg-red-200 disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        מחיקה
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {sortedUsers.length === 0 && !loading ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted">
                    לא נמצאו משתמשים.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {editingId ? (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-lg space-y-4 rounded-3xl border border-soft bg-surface p-6 shadow-soft">
            <div className="space-y-2 text-right">
              <h3 className="text-lg font-semibold text-strong">עריכת משתמש</h3>
              <p className="text-sm text-muted">עדכנו את פרטי המשתמש. השאירו את שדה הסיסמה ריק כדי להשאיר את הערך הקיים.</p>
            </div>
            <form onSubmit={handleEditSubmit} className="space-y-4 text-right">
              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase text-muted">שם משתמש</span>
                <input
                  type="text"
                  value={editForm.username}
                  onChange={(event) =>
                    setEditForm((state) => ({ ...state, username: event.target.value }))
                  }
                  className="w-full rounded-full border border-soft bg-surface px-4 py-3 text-sm text-strong focus:border-primary focus:outline-none"
                  required
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase text-muted">סיסמה חדשה</span>
                <input
                  type="password"
                  value={editForm.password}
                  onChange={(event) =>
                    setEditForm((state) => ({ ...state, password: event.target.value }))
                  }
                  placeholder="השאירו ריק לשמירת הסיסמה הנוכחית"
                  className="w-full rounded-full border border-soft bg-surface px-4 py-3 text-sm text-strong focus:border-primary focus:outline-none"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase text-muted">תפקיד</span>
                <select
                  value={editForm.role}
                  onChange={(event) =>
                    setEditForm((state) => ({ ...state, role: event.target.value as UserRole }))
                  }
                  className="w-full rounded-full border border-soft bg-surface px-4 py-3 text-sm text-strong focus:border-primary focus:outline-none"
                >
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>
                      {role === 'admin' ? 'מנהל מערכת' : 'צופה'}
                    </option>
                  ))}
                </select>
              </label>
              <div className="space-y-2 text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase text-muted">דפים נגישים</span>
                {editPagesDisabled ? (
                  <p className="rounded-2xl border border-soft bg-surface-elevated px-4 py-3 text-xs text-muted">
                    מנהלי מערכת רואים את כל הדפים ואין צורך לעדכן הרשאות.
                  </p>
                ) : sortedPages.length > 0 ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {sortedPages.map((page) => {
                      const checked = editForm.allowedPages.includes(page.id);
                      return (
                        <label
                          key={page.id}
                          className={`flex items-center justify-between gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold transition ${
                            checked ? 'border-primary/60 bg-primary/10 text-primary' : 'border-soft text-muted'
                          }`}
                        >
                          <span className="truncate">{page.name}</span>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) =>
                              handleEditAllowedPageToggle(page.id, event.target.checked)
                            }
                            className="h-4 w-4 accent-primary"
                          />
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <p className="rounded-2xl border border-dashed border-soft bg-surface-elevated px-4 py-3 text-xs text-muted">
                    אין דפים זמינים כרגע.
                  </p>
                )}
              </div>
              <div className="flex flex-row-reverse items-center gap-2">
                <button
                  type="submit"
                  disabled={actionInProgress}
                  className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {actionInProgress ? 'שומר…' : 'שמירת שינויים'}
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="rounded-full border border-soft px-5 py-2 text-sm font-semibold text-muted transition hover:border-primary/40 hover:text-primary"
                >
                  ביטול
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default AdminUsersPage;
