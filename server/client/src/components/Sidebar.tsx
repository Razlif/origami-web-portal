import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { useEntities } from '../store/useEntities';
import { useSession } from '../store/useSession';
import { usePages } from '../hooks/usePages';
import { refreshAllData, refreshStructure } from '../services/origami';
import ThemeToggle from './ThemeToggle';

const ENTITY_COLLAPSE_KEY = 'origami:entities-collapsed';

const entityLinkClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded-xl px-3 py-2 text-xs font-semibold transition text-right hover:bg-primary/10 ${
    isActive ? 'bg-primary/20 text-primary shadow-soft' : 'text-muted'
  }`;

export const Sidebar = () => {
  const { entities, setStructure } = useEntities();
  const { role, logout } = useSession();
  const { pages, activePageId, setActivePage, addPage } = usePages();
  const [busy, setBusy] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [entitiesCollapsed, setEntitiesCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    try {
      return window.localStorage.getItem(ENTITY_COLLAPSE_KEY) === 'true';
    } catch (error) {
      console.warn('Failed to read entity sidebar state', error);
      return false;
    }
  });
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (location.pathname === '/') {
      navigate('/pages');
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(ENTITY_COLLAPSE_KEY, entitiesCollapsed ? 'true' : 'false');
    } catch (error) {
      console.warn('Failed to persist entity sidebar state', error);
    }
  }, [entitiesCollapsed]);

  useEffect(() => {
    if (!refreshMessage) {
      return;
    }
    const timer = window.setTimeout(() => setRefreshMessage(null), 5000);
    return () => window.clearTimeout(timer);
  }, [refreshMessage]);

  const handleRefreshData = async () => {
    setBusy(true);
    try {
      await refreshAllData();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('origami:data-refresh'));
      }
      setRefreshMessage('Data cache cleared. Widgets will reload shortly.');
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } }).response?.data?.message ??
        (error instanceof Error ? error.message : 'Failed to refresh Origami data.');
      console.error('Failed to refresh Origami data', error);
      setRefreshMessage(`Unable to refresh data: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleRefreshStructure = async () => {
    setBusy(true);
    try {
      const structure = await refreshStructure();
      setStructure(structure.entities);
      setRefreshMessage('Structure refresh triggered. Latest layout will load when ready.');
    } catch (error) {
      const message =
        (error as { response?: { data?: { message?: string } } }).response?.data?.message ??
        (error instanceof Error ? error.message : 'Failed to refresh structure.');
      console.error('Failed to refresh Origami structure', error);
      setRefreshMessage(`Unable to refresh structure: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  const canEdit = role === 'admin';
  const viewablePages = useMemo(
    () => (canEdit ? pages : pages.filter((page) => page.published)),
    [canEdit, pages]
  );

  return (
    <aside className="flex min-h-screen w-80 flex-col border-l border-soft bg-surface px-6 py-6 shadow-soft backdrop-blur">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
            className="rounded-full border border-soft px-4 py-1 text-xs font-semibold text-muted transition hover:border-primary/40 hover:text-primary"
          >
            Sign out
          </button>
          <ThemeToggle />
        </div>
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-strong">Origami Portal</h1>
          <p className="text-xs text-muted">Read-only dashboards</p>
        </div>
      </div>

      <nav className="mt-6 flex-1 space-y-6 overflow-y-auto pr-2 text-right">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted">Pages</p>
            {canEdit ? (
              <button
                onClick={() => {
                  const suggested = `Page ${pages.length + 1}`;
                  const name =
                    typeof window !== 'undefined'
                      ? window.prompt('Name for the new page', suggested)
                      : suggested;
                  if (name) {
                    addPage(name);
                  }
                }}
                className="rounded-full border border-dashed border-soft px-3 py-1 text-[11px] font-semibold text-muted transition hover:border-primary/40 hover:text-primary"
              >
                + Add page
              </button>
            ) : null}
          </div>
          <div className="space-y-1">
            {viewablePages.map((page) => (
              <button
                key={page.id}
                onClick={() => {
                  setActivePage(page.id);
                  navigate(`/pages/${page.id}`);
                }}
                className={`w-full rounded-2xl px-4 py-2 text-right text-xs font-semibold transition ${
                  page.id === activePageId
                    ? 'bg-primary/20 text-primary shadow-soft'
                    : 'text-muted hover:bg-primary/10 hover:text-primary'
                }`}
              >
                {canEdit ? `${page.name}${page.published ? '' : ' (draft)'}` : page.name}
              </button>
            ))}
            {viewablePages.length === 0 ? (
              <p className="rounded-2xl border border-soft bg-surface-elevated px-4 py-3 text-xs text-muted">
                No published pages yet.
              </p>
            ) : null}
          </div>
        </section>

        {canEdit ? (
          <section className="space-y-2">
            <button
              type="button"
              onClick={() => setEntitiesCollapsed((state) => !state)}
              className={`flex w-full items-center justify-between rounded-xl px-2 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                entitiesCollapsed ? 'text-muted hover:text-primary' : 'text-primary'
              }`}
              aria-expanded={!entitiesCollapsed}
            >
              <span>Entities</span>
              <span aria-hidden>{entitiesCollapsed ? '+' : '−'}</span>
            </button>
            {!entitiesCollapsed ? (
              <div className="space-y-1">
                {entities.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-soft bg-surface px-3 py-2 text-[11px] text-muted">
                    Entities load when Origami is connected.
                  </p>
                ) : null}
                {entities.map((entity) => (
                  <NavLink key={entity.name} to={`/entity/${entity.name}`} className={entityLinkClass}>
                    {entity.label ?? entity.name}
                  </NavLink>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {canEdit ? (
          <section className="space-y-1">
            <p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted">Admin</p>
            <NavLink to="/admin/users" className={entityLinkClass}>
              User management
            </NavLink>
          </section>
        ) : null}
      </nav>

      {role === 'admin' ? (
        <div className="mt-6 space-y-3 border-t border-soft pt-4 text-sm text-right">
          {refreshMessage ? (
            <p className="text-xs text-muted">{refreshMessage}</p>
          ) : null}
          <button
            type="button"
            onClick={handleRefreshData}
            disabled={busy}
            className="w-full rounded-full bg-primary px-4 py-3 font-semibold text-white shadow-soft transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            Refresh data
          </button>
          <button
            type="button"
            onClick={handleRefreshStructure}
            disabled={busy}
            className="w-full rounded-full border border-primary px-4 py-3 font-semibold text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-70"
          >
            Refresh structure
          </button>
        </div>
      ) : null}
    </aside>
  );
};

export default Sidebar;
