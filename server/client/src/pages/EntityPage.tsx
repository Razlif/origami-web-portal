import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchEntityData } from '../services/origami';
import { useEntities } from '../store/useEntities';
import { createRefreshManager } from '../utils/refreshManager';
import TableView from '../components/TableView';
import type { OrigamiRecord } from '../types';

const refreshInterval = Number(
  import.meta.env.VITE_PORTAL_REFRESH_INTERVAL ??
    import.meta.env.PORTAL_REFRESH_INTERVAL ??
    300000
);

export const EntityPage = () => {
  const { entityName } = useParams();
  const { entities } = useEntities();
  const [records, setRecords] = useState<OrigamiRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const entity = useMemo(
    () => entities.find((candidate) => candidate.name === entityName),
    [entities, entityName]
  );

  useEffect(() => {
    if (!entityName) return;
    let isMounted = true;
    const manager = createRefreshManager(refreshInterval);

    const load = async () => {
      if (!entityName) return;
      setLoading(true);
      try {
        const data = await fetchEntityData(entityName);
        if (isMounted) {
          setRecords(data);
          setError('');
        }
      } catch (loadError) {
        setError('Unable to load entity data.');
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    load();
    manager.register(`entity:${entityName}`, load, refreshInterval);
    const manualRefresh = () => manager.trigger(`entity:${entityName}`);
    if (typeof window !== 'undefined') {
      window.addEventListener('origami:data-refresh', manualRefresh);
    }

    return () => {
      isMounted = false;
      if (typeof window !== 'undefined') {
        window.removeEventListener('origami:data-refresh', manualRefresh);
      }
      manager.dispose();
    };
  }, [entityName]);

  if (!entity) {
    return <p className="p-6 text-sm text-muted">Entity not found.</p>;
  }

  return (
    <div className="flex-1 space-y-4 p-6 text-right">
      <header className="flex flex-col gap-4 rounded-3xl border border-soft bg-surface-elevated p-6 shadow-soft sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-strong">{entity.label ?? entity.name}</h2>
          <p className="text-sm text-muted">Auto refresh every {refreshInterval / 60000} minutes.</p>
        </div>
        <button
          onClick={async () => {
            if (!entityName) return;
            setLoading(true);
            try {
              const data = await fetchEntityData(entityName);
              setRecords(data);
              setError('');
            } finally {
              setLoading(false);
            }
          }}
          className="rounded-full border border-primary px-5 py-2 text-sm font-semibold text-primary transition hover:bg-primary/10"
        >
          Refresh data
        </button>
      </header>
      {error ? <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</p> : null}
      {loading ? <p className="text-sm text-muted">Loading data…</p> : null}
      <TableView fields={entity.fields} records={records} />
    </div>
  );
};

export default EntityPage;
