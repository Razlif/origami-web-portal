import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DashboardCanvas from '../components/DashboardCanvas';
import WidgetModal from '../components/WidgetModal';
import { usePages } from '../hooks/usePages';
import { useEntities } from '../store/useEntities';
import { useSession } from '../store/useSession';
import { fetchWidgetRecords } from '../services/origami';
import type { EntityDefinition, OrigamiRecord, WidgetConfig } from '../types';

const buildEntityLookup = (entities: EntityDefinition[]) =>
  entities.reduce<Record<string, EntityDefinition>>((acc, entity) => {
    acc[entity.name] = entity;
    return acc;
  }, {});

export const PageEditor = () => {
  const { pageId } = useParams();
  const navigate = useNavigate();
  const { role } = useSession();
  const {
    pages,
    widgets,
    activePageId,
    editMode,
    setEditMode,
    dirty,
    hydrated,
    setActivePage,
    addWidget,
    updateWidget,
    removeWidget,
    savePages,
    renamePage,
    removePage,
    publishPage,
    applyLayout
  } = usePages();
  const { entities } = useEntities();
  const [dataMap, setDataMap] = useState<Record<string, OrigamiRecord[]>>({});
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingWidget, setEditingWidget] = useState<WidgetConfig | null>(null);

  const canEdit = role === 'admin';

  const viewablePages = useMemo(
    () => (canEdit ? pages : pages.filter((page) => page.published)),
    [canEdit, pages]
  );

  const activePage = useMemo(
    () => pages.find((page) => page.id === activePageId) ?? null,
    [pages, activePageId]
  );

  const entityLookup = useMemo(() => buildEntityLookup(entities), [entities]);

  useEffect(() => {
    if (!hydrated || pages.length === 0) {
      return;
    }
    const candidateId = pageId && pages.some((page) => page.id === pageId) ? pageId : activePageId;
    if (!candidateId) {
      const fallback = viewablePages[0]?.id;
      if (fallback) {
        setActivePage(fallback);
        navigate(`/pages/${fallback}`, { replace: true });
      }
      return;
    }
    if (candidateId !== activePageId) {
      setActivePage(candidateId);
    }
    if (candidateId && candidateId !== pageId) {
      navigate(`/pages/${candidateId}`, { replace: true });
    }
  }, [pageId, pages, activePageId, viewablePages, hydrated, setActivePage, navigate]);

  useEffect(() => {
    if (!canEdit && editMode) {
      setEditMode(false);
    }
  }, [canEdit, editMode, setEditMode]);

  const widgetDataSignature = useMemo(() => {
    if (!activePage) {
      return '';
    }
    return activePage.widgets
      .map((widget) => `${widget.id}:${widget.entity}:${JSON.stringify(widget.filters ?? [])}`)
      .sort()
      .join('|');
  }, [activePage]);

  useEffect(() => {
    let cancelled = false;
    if (!activePage || activePage.widgets.length === 0) {
      setDataMap({});
      setLoading(false);
      return;
    }

    const groups = new Map<
      string,
      { widgetIds: string[]; representative: string }
    >();

    for (const widget of activePage.widgets) {
      if (!widget.entity) {
        continue;
      }
      const signature = JSON.stringify({ entity: widget.entity, filters: widget.filters ?? [] });
      if (groups.has(signature)) {
        groups.get(signature)?.widgetIds.push(widget.id);
      } else {
        groups.set(signature, { widgetIds: [widget.id], representative: widget.id });
      }
    }

    if (groups.size === 0) {
      setDataMap({});
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const results = await Promise.all(
          Array.from(groups.values()).map(async (group) => {
            try {
              const response = await fetchWidgetRecords(group.representative);
              return group.widgetIds.map((id) => [id, response] as const);
            } catch (error) {
              console.error('Failed to load widget data', { widgetId: group.representative, error });
              return group.widgetIds.map((id) => [id, []] as const);
            }
          })
        );
        if (!cancelled) {
          setDataMap(Object.fromEntries(results.flat()));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [activePage, widgetDataSignature]);

  const handleAddWidget = () => {
    setEditingWidget(null);
    setModalOpen(true);
  };

  const handleEditWidget = (widget: WidgetConfig) => {
    setEditingWidget(widget);
    setModalOpen(true);
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setEditingWidget(null);
  };

  const handleModalSubmit = useCallback(
    (input: Omit<WidgetConfig, 'id' | 'pageId' | 'x' | 'y'>) => {
      if (editingWidget) {
        updateWidget(editingWidget.id, input);
      } else {
        addWidget(input);
      }
      handleModalClose();
    },
    [addWidget, editingWidget, updateWidget]
  );

  const handleRenamePage = () => {
    if (!activePage || !canEdit) return;
    const nextName =
      typeof window !== 'undefined'
        ? window.prompt('Rename page', activePage.name)
        : activePage.name;
    if (nextName) {
      renamePage(activePage.id, nextName);
    }
  };

  const handleDeletePage = () => {
    if (!activePage || !canEdit) return;
    const confirmed =
      typeof window === 'undefined'
        ? true
        : window.confirm(`Delete "${activePage.name}"? This cannot be undone.`);
    if (confirmed) {
      removePage(activePage.id);
    }
  };

  const handlePublish = async () => {
    if (!activePage || !canEdit) return;
    await publishPage(activePage.id);
  };

  const handleLayoutChange = useCallback(
    (layouts: Array<{ id: string; x: number; y: number; w: number; h: number }>) => {
      applyLayout(layouts);
    },
    [applyLayout]
  );

  if (!hydrated) {
    return <div className="flex-1 p-6 text-sm text-muted">Loading pages…</div>;
  }

  if (!activePage) {
    return (
      <div className="flex-1 p-6">
        <div className="rounded-3xl border border-dashed border-soft bg-surface p-10 text-center text-sm text-muted">
          {canEdit
            ? 'Create your first dashboard page from the sidebar to begin.'
            : 'No pages are available yet. Please contact your administrator.'}
        </div>
      </div>
    );
  }

  const publishedBadge = activePage.published
    ? 'bg-emerald-100 text-emerald-700'
    : 'bg-amber-100 text-amber-700';

  return (
    <div className="flex-1 space-y-6 p-6 text-right">
      <header className="flex flex-col gap-4 rounded-3xl border border-soft bg-surface-elevated p-6 shadow-soft lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2 text-right">
          <h2 className="text-2xl font-bold text-strong">{activePage.name}</h2>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase ${publishedBadge}`}>
              {activePage.published ? 'Published' : 'Draft'}
            </span>
            {dirty ? <span className="text-xs font-semibold uppercase text-amber-500">Unsaved changes</span> : null}
          </div>
        </div>
        {canEdit ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              onClick={handleAddWidget}
              className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-primary/90"
            >
              + Add widget
            </button>
            <button
              onClick={() => void savePages()}
              disabled={!dirty}
              className="rounded-full border border-primary px-4 py-2 text-sm font-semibold text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save page
            </button>
            <button
              onClick={() => setEditMode(!editMode)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                editMode
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-soft text-muted hover:border-primary/40 hover:text-primary'
              }`}
            >
              {editMode ? 'Editing layout' : 'Edit layout'}
            </button>
            <button
              onClick={handlePublish}
              disabled={activePage.published}
              className="rounded-full border border-emerald-400 px-4 py-2 text-sm font-semibold text-emerald-600 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Publish page
            </button>
            <button
              onClick={handleRenamePage}
              className="rounded-full border border-soft px-4 py-2 text-xs font-semibold text-muted transition hover:border-primary/40 hover:text-primary"
            >
              Rename
            </button>
            <button
              onClick={handleDeletePage}
              className="rounded-full border border-red-200 px-4 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        ) : null}
      </header>

      {loading ? <p className="text-xs text-muted">Loading widget data…</p> : null}

      {widgets.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-soft bg-surface-elevated p-10 text-center text-sm text-muted">
          {canEdit ? 'Add widgets to start building this dashboard.' : 'No widgets configured for this page yet.'}
        </div>
      ) : (
        <div className="rounded-3xl border border-soft bg-surface-elevated p-4 shadow-soft">
          <DashboardCanvas
            widgets={widgets}
            editMode={canEdit && editMode}
            onLayoutChange={handleLayoutChange}
            onEditWidget={handleEditWidget}
            onRemoveWidget={removeWidget}
            entityLookup={entityLookup}
            dataMap={dataMap}
            canEdit={canEdit}
          />
        </div>
      )}

      {canEdit ? (
        <WidgetModal
          isOpen={modalOpen}
          onClose={handleModalClose}
          onSubmit={handleModalSubmit}
          entities={entities}
          initialWidget={editingWidget}
        />
      ) : null}
    </div>
  );
};

export default PageEditor;
