import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DashboardCanvas from '../components/DashboardCanvas';
import WidgetModal from '../components/WidgetModal';
import { usePages } from '../hooks/usePages';
import { useEntities } from '../store/useEntities';
import { useSession } from '../store/useSession';
import { fetchWidgetPreview, fetchWidgetRecords } from '../services/origami';
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
    setPagePublished,
    applyLayout
  } = usePages();
  const { entities } = useEntities();
  const [dataMap, setDataMap] = useState<Record<string, OrigamiRecord[]>>({});
  const [loading, setLoading] = useState(false);
  const [widgetLoading, setWidgetLoading] = useState<Record<string, boolean>>({});
  const [widgetErrors, setWidgetErrors] = useState<Record<string, string>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editingWidget, setEditingWidget] = useState<WidgetConfig | null>(null);
  const [editActionPending, setEditActionPending] = useState(false);
  const [publishPending, setPublishPending] = useState(false);

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
      setWidgetLoading({});
      setWidgetErrors({});
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
      setWidgetLoading({});
      setWidgetErrors({});
      setLoading(false);
      return;
    }

    const loadPreview = async (
      group: { widgetIds: string[]; representative: string },
      representativeWidget: WidgetConfig,
      fallbackMessage?: string
    ) => {
      const friendly =
        fallbackMessage ?? 'Save the page and refresh to view this widget.';
      try {
        const preview = await fetchWidgetPreview(representativeWidget);
        return group.widgetIds.map((id) => ({ id, records: preview, error: null as string | null }));
      } catch (previewError) {
        console.error('Failed to generate widget preview', { widgetId: group.representative, error: previewError });
        const message =
          (previewError as { response?: { data?: { message?: string } } }).response?.data?.message ??
          friendly;
        return group.widgetIds.map((id) => ({ id, records: [], error: message }));
      }
    };

    const load = async () => {
      setLoading(true);
      const pendingState: Record<string, boolean> = {};
      activePage.widgets.forEach((widget) => {
        pendingState[widget.id] = true;
      });
      setWidgetLoading(pendingState);
      setWidgetErrors({});
      try {
        const results = await Promise.all(
          Array.from(groups.values()).map(async (group) => {
            const representativeWidget = activePage.widgets.find((widget) => widget.id === group.representative);
            if (!representativeWidget) {
              return group.widgetIds.map((id) => ({
                id,
                records: [],
                error: 'Widget configuration missing.'
              }));
            }
            if (dirty) {
              return loadPreview(group, representativeWidget);
            }
            try {
              const response = await fetchWidgetRecords(group.representative);
              return group.widgetIds.map((id) => ({ id, records: response, error: null as string | null }));
            } catch (error) {
              const status = (error as { response?: { status?: number } }).response?.status;
              if (status === 404) {
                return loadPreview(group, representativeWidget, 'Save the page and refresh to view this widget.');
              }
              console.error('Failed to load widget data', { widgetId: group.representative, error });
              const message =
                (error as { response?: { data?: { message?: string } } }).response?.data?.message ??
                (error instanceof Error ? error.message : 'Unable to load widget data.');
              return group.widgetIds.map((id) => ({ id, records: [], error: message }));
            }
          })
        );
        if (!cancelled) {
          const flat = results.flat();
          const nextData = Object.fromEntries(flat.map(({ id, records }) => [id, records]));
          const nextLoadingState = flat.reduce<Record<string, boolean>>((acc, item) => {
            acc[item.id] = false;
            return acc;
          }, {});
          const nextErrors = flat.reduce<Record<string, string>>((acc, item) => {
            if (item.error) {
              acc[item.id] = item.error;
            }
            return acc;
          }, {});
          setDataMap(nextData);
          setWidgetLoading((prev) => ({ ...prev, ...nextLoadingState }));
          setWidgetErrors(nextErrors);
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
  }, [activePage, widgetDataSignature, dirty]);
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

  const handleEditToggle = async () => {
    if (!canEdit) return;
    if (!editMode) {
      setEditMode(true);
      return;
    }
    setEditActionPending(true);
    try {
      if (dirty) {
        await savePages();
      }
    } catch (error) {
      console.error('Failed to save page', error);
    } finally {
      setEditActionPending(false);
      setEditMode(false);
    }
  };

  const handleTogglePublish = async () => {
    if (!activePage || !canEdit) return;
    setPublishPending(true);
    try {
      await setPagePublished(activePage.id, !activePage.published);
    } finally {
      setPublishPending(false);
    }
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
              type="button"
              onClick={handleAddWidget}
              className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-primary/90"
            >
              + Add widget
            </button>
            <button
              type="button"
              onClick={handleEditToggle}
              disabled={editActionPending}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                editMode
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-soft text-muted hover:border-primary/40 hover:text-primary'
              } disabled:cursor-not-allowed`}
            >
              {editMode ? (editActionPending ? 'Saving…' : 'Save changes') : 'Edit page'}
            </button>
            <button
              type="button"
              onClick={handleTogglePublish}
              disabled={publishPending}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                activePage.published
                  ? 'border-amber-300 text-amber-600 hover:bg-amber-50'
                  : 'border-emerald-400 text-emerald-600 hover:bg-emerald-50'
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {publishPending ? 'Updating…' : activePage.published ? 'Unpublish page' : 'Publish page'}
            </button>
            <button
              type="button"
              onClick={handleRenamePage}
              className="rounded-full border border-soft px-4 py-2 text-xs font-semibold text-muted transition hover:border-primary/40 hover:text-primary"
            >
              Rename
            </button>
            <button
              type="button"
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
            widgetLoading={widgetLoading}
            widgetErrors={widgetErrors}
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
