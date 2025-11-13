import { create } from 'zustand';
import { nanoid } from 'nanoid/non-secure';
import type { DashboardPage, WidgetAggregation, WidgetConfig, WidgetFilter, WidgetType } from '../types';
import { fetchPagesFromApi, logPageStructure, publishPageToApi, savePagesToApi } from './usePages';

const STORAGE_KEY = 'origami:pages';
const STORAGE_VERSION = 5;

const MIN_WIDTH = 1;
const MAX_WIDTH = 12;
const MIN_HEIGHT = 1;
const MAX_HEIGHT = 12;

const allowedTypes: WidgetType[] = ['table', 'bar', 'line', 'pie'];
const allowedAggregations: WidgetAggregation[] = ['count', 'sum', 'avg'];
const allowedFilterOperators: WidgetFilter['operator'][] = ['=', '!=', '>', '>=', '<', '<=', 'contains'];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const sanitizeFields = (fields: unknown): string[] => {
  if (!Array.isArray(fields)) {
    return [];
  }
  return fields
    .map((field) => (field == null ? '' : String(field).trim()))
    .filter(Boolean);
};

const sanitizeFilters = (filters: unknown): WidgetFilter[] => {
  if (!Array.isArray(filters)) {
    return [];
  }
  return filters
    .map((filter) => {
      const field = filter?.field?.toString().trim();
      const operator = allowedFilterOperators.includes(filter?.operator as WidgetFilter['operator'])
        ? (filter.operator as WidgetFilter['operator'])
        : '=';
      const rawValue = filter?.value;
      const value = rawValue == null ? '' : String(rawValue).trim();
      if (!field || !value) {
        return null;
      }
      return { field, operator, value };
    })
    .filter((entry): entry is WidgetFilter => Boolean(entry));
};

const filtersEqual = (next: WidgetFilter[], prev: WidgetFilter[]): boolean => {
  if (next.length !== prev.length) {
    return false;
  }
  return next.every((filter, index) => {
    const previous = prev[index];
    return (
      filter.field === previous.field &&
      filter.operator === previous.operator &&
      filter.value === previous.value
    );
  });
};

const normalizeWidget = (widget: Partial<WidgetConfig>, pageId: string): WidgetConfig => {
  const type: WidgetType = allowedTypes.includes(widget.type as WidgetType)
    ? (widget.type as WidgetType)
    : 'table';
  const aggregation: WidgetAggregation = allowedAggregations.includes(widget.aggregation as WidgetAggregation)
    ? (widget.aggregation as WidgetAggregation)
    : 'count';

  return {
    id: widget.id ?? nanoid(),
    pageId,
    title: widget.title?.trim() || 'Untitled widget',
    type,
    entity: widget.entity ?? '',
    fields: sanitizeFields(widget.fields),
    aggregation,
    x: Math.max(0, Math.round(Number(widget.x ?? 0))),
    y: Math.max(0, Math.round(Number(widget.y ?? 0))),
    w: clamp(Math.round(Number(widget.w ?? 4)), MIN_WIDTH, MAX_WIDTH),
    h: clamp(Math.round(Number(widget.h ?? 4)), MIN_HEIGHT, MAX_HEIGHT),
    filters: sanitizeFilters(widget.filters)
  };
};

const normalizePage = (page: Partial<DashboardPage>): DashboardPage => {
  const id = page.id ?? nanoid();
  const name = page.name?.trim() || 'Page';
  const published = Boolean(page.published);
  const widgets = Array.isArray(page.widgets)
    ? page.widgets.map((widget) => normalizeWidget(widget, widget.pageId ?? id))
    : [];
  return { id, name, published, widgets };
};

const createPage = (name: string): DashboardPage => normalizePage({ name, published: false, widgets: [] });

const loadLocalState = (): { pages: DashboardPage[]; activePageId: string } => {
  if (typeof window === 'undefined') {
    return { pages: [], activePageId: '' };
  }
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return { pages: [], activePageId: '' };
    }
    const parsed = JSON.parse(stored);
    if (parsed && Array.isArray(parsed.pages)) {
      const pages = parsed.pages.map((page: DashboardPage) => normalizePage(page));
      const requestedActive = typeof parsed.activePageId === 'string' ? parsed.activePageId : '';
      const activeExists = requestedActive && pages.some((page) => page.id === requestedActive);
      return { pages, activePageId: activeExists ? requestedActive : '' };
    }
    if (Array.isArray(parsed)) {
      const legacyPage = normalizePage({ name: 'Page 1', published: true, widgets: parsed });
      return { pages: [legacyPage], activePageId: legacyPage.id };
    }
  } catch (error) {
    console.warn('Unable to load cached dashboard pages', error);
  }
  return { pages: [], activePageId: '' };
};

const persistLocalState = (pages: DashboardPage[], activePageId: string) => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ pages, activePageId, version: STORAGE_VERSION })
    );
  } catch (error) {
    console.warn('Unable to persist dashboard pages', error);
  }
};

let pendingLoad: Promise<void> | null = null;

interface WidgetsState {
  pages: DashboardPage[];
  activePageId: string;
  widgets: WidgetConfig[];
  editMode: boolean;
  dirty: boolean;
  hydrated: boolean;
  load: () => Promise<void>;
  savePages: () => Promise<void>;
  publishPage: (pageId: string) => Promise<void>;
  addPage: (name?: string) => void;
  renamePage: (id: string, name: string) => void;
  updatePage: (id: string, partial: Partial<Pick<DashboardPage, 'name' | 'published'>>) => void;
  removePage: (id: string) => void;
  setActivePage: (id: string) => void;
  addWidget: (config: Omit<WidgetConfig, 'id' | 'pageId'>) => void;
  updateWidget: (id: string, partial: Partial<WidgetConfig>) => void;
  removeWidget: (id: string) => void;
  setEditMode: (editing: boolean) => void;
  applyLayout: (layouts: Array<Pick<WidgetConfig, 'id' | 'x' | 'y' | 'w' | 'h'>>) => void;
}

export const useWidgets = create<WidgetsState>((set, get) => {
  const applyPagesUpdate = (pages: DashboardPage[], activePageId: string, dirty = true) => {
    const activePage = pages.find((page) => page.id === activePageId) ?? pages[0];
    set((state) => ({
      ...state,
      pages,
      activePageId,
      widgets: activePage?.widgets ?? [],
      dirty: dirty ? true : state.dirty
    }));
    persistLocalState(pages, activePageId);
  };

  const resolveActivePage = (pages: DashboardPage[], fallbackId?: string) => {
    if (fallbackId && pages.some((page) => page.id === fallbackId)) {
      return fallbackId;
    }
    const published = pages.find((page) => page.published);
    return published?.id ?? pages[0]?.id ?? '';
  };

  return {
    pages: [],
    activePageId: '',
    widgets: [],
    editMode: false,
    dirty: false,
    hydrated: false,
    async load() {
      if (pendingLoad) {
        await pendingLoad;
        return;
      }
      if (get().hydrated) {
        return;
      }
      pendingLoad = (async () => {
        const localState = loadLocalState();
        let remotePages: DashboardPage[] = [];
        let remoteLoaded = false;
        try {
          remotePages = (await fetchPagesFromApi()).map((page) => normalizePage(page));
          remoteLoaded = true;
        } catch (error) {
          console.warn('Falling back to cached dashboard pages', error);
        }
        const cachedPages = localState.pages.map((page) => normalizePage(page));
        let pages: DashboardPage[] = [];
        if (remoteLoaded) {
          pages = remotePages;
        } else if (cachedPages.length > 0) {
          pages = cachedPages;
        }
        if (!remoteLoaded && pages.length === 0) {
          pages = [createPage('Dashboard')];
        }
        const fallbackActiveId = !remoteLoaded ? localState.activePageId : '';
        const activePageId = pages.length > 0 ? resolveActivePage(pages, fallbackActiveId) : '';
        const activePage = pages.find((page) => page.id === activePageId);
        persistLocalState(pages, activePageId);
        set({
          pages,
          activePageId,
          widgets: activePage?.widgets ?? [],
          editMode: false,
          dirty: false,
          hydrated: true
        });
        logPageStructure(pages, 'load');
      })();
      try {
        await pendingLoad;
      } finally {
        pendingLoad = null;
      }
    },
    async savePages() {
      const { pages, activePageId } = get();
      persistLocalState(pages, activePageId);
      await savePagesToApi(pages);
      const activePage = pages.find((page) => page.id === activePageId);
      if (activePage) {
        console.info(`💾 Saved page "${activePage.name}" with ${activePage.widgets.length} widgets`);
      }
      logPageStructure(pages, 'save');
      set((state) => ({ ...state, dirty: false }));
    },
    async publishPage(pageId) {
      const currentPages = get().pages;
      const target = currentPages.find((page) => page.id === pageId);
      if (!target) {
        console.warn(`Cannot publish missing page ${pageId}`);
        return;
      }
      const published = await publishPageToApi(pageId);
      const pages = currentPages.map((page) => (page.id === pageId ? { ...page, published: true } : page));
      applyPagesUpdate(pages, pageId, false);
      console.info(`🚀 Published page "${published?.name ?? target.name}"`);
    },
    addPage(name) {
      const state = get();
      const nextName = name?.trim() || `Page ${state.pages.length + 1}`;
      const newPage = createPage(nextName);
      applyPagesUpdate([...state.pages, newPage], newPage.id);
    },
    renamePage(id, name) {
      get().updatePage(id, { name });
    },
    updatePage(id, partial) {
      const trimmedName = partial.name?.trim();
      if (partial.name !== undefined && !trimmedName) {
        console.warn('Page name cannot be empty.');
        return;
      }
      const state = get();
      let changed = false;
      const pages = state.pages.map((page) => {
        if (page.id !== id) {
          return page;
        }
        const next = {
          ...page,
          ...(trimmedName !== undefined ? { name: trimmedName } : {}),
          ...(partial.published === undefined ? {} : { published: Boolean(partial.published) })
        };
        if (next.name === page.name && next.published === page.published) {
          return page;
        }
        changed = true;
        return { ...next };
      });
      if (!changed) {
        return;
      }
      const activePageId = resolveActivePage(pages, state.activePageId);
      applyPagesUpdate(pages, activePageId);
    },
    removePage(id) {
      const state = get();
      if (state.pages.length <= 1) {
        console.warn('Cannot remove the last dashboard page.');
        return;
      }
      const pages = state.pages.filter((page) => page.id !== id);
      if (pages.length === state.pages.length) {
        return;
      }
      const nextActive = resolveActivePage(pages, state.activePageId === id ? undefined : state.activePageId);
      applyPagesUpdate(pages, nextActive);
    },
    setActivePage(id) {
      const state = get();
      const target = state.pages.find((page) => page.id === id);
      if (!target) {
        return;
      }
      set((prev) => ({ ...prev, activePageId: target.id, widgets: target.widgets }));
      persistLocalState(state.pages, target.id);
    },
    addWidget(config) {
      const state = get();
      const pageId = state.activePageId || state.pages[0]?.id;
      if (!pageId) {
        const defaultPage = createPage('Dashboard');
        const widget = normalizeWidget({ ...config, pageId: defaultPage.id }, defaultPage.id);
        applyPagesUpdate([{ ...defaultPage, widgets: [widget] }], defaultPage.id);
        console.info(`🧱 Added widget: ${widget.entity} (${widget.type})`);
        return;
      }
      const pages = state.pages.map((page) => {
        if (page.id !== pageId) {
          return page;
        }
        const fallbackY = page.widgets.length > 0 ? Math.max(...page.widgets.map((widget) => widget.y + widget.h)) : 0;
        const widget = normalizeWidget(
          {
            ...config,
            pageId,
            x: config.x ?? 0,
            y: config.y ?? fallbackY,
            w: config.w ?? 4,
            h: config.h ?? 4
          },
          pageId
        );
        console.info(`🧱 Added widget: ${widget.entity} (${widget.type})`);
        return { ...page, widgets: [...page.widgets, widget] };
      });
      applyPagesUpdate(pages, pageId);
    },
    updateWidget(id, partial) {
      const state = get();
      const pageId = state.activePageId;
      if (!pageId) {
        return;
      }
      let changed = false;
      const pages = state.pages.map((page) => {
        if (page.id !== pageId) {
          return page;
        }
        const widgets = page.widgets.map((widget) => {
          if (widget.id !== id) {
            return widget;
          }
          const next = normalizeWidget({ ...widget, ...partial, id: widget.id, pageId }, pageId);
          if (
            next.title === widget.title &&
            next.type === widget.type &&
            next.entity === widget.entity &&
            next.aggregation === widget.aggregation &&
            next.x === widget.x &&
            next.y === widget.y &&
            next.w === widget.w &&
            next.h === widget.h &&
            next.fields.join('|') === widget.fields.join('|') &&
            filtersEqual(next.filters, widget.filters)
          ) {
            return widget;
          }
          changed = true;
          return next;
        });
        if (!changed) {
          return page;
        }
        return { ...page, widgets };
      });
      if (!changed) {
        return;
      }
      applyPagesUpdate(pages, pageId);
    },
    removeWidget(id) {
      const state = get();
      const pageId = state.activePageId;
      if (!pageId) {
        return;
      }
      let changed = false;
      const pages = state.pages.map((page) => {
        if (page.id !== pageId) {
          return page;
        }
        const widgets = page.widgets.filter((widget) => widget.id !== id);
        if (widgets.length === page.widgets.length) {
          return page;
        }
        changed = true;
        return { ...page, widgets };
      });
      if (!changed) {
        return;
      }
      applyPagesUpdate(pages, pageId);
    },
    setEditMode(editing) {
      set((state) => ({ ...state, editMode: editing }));
    },
    applyLayout(layouts) {
      const state = get();
      const pageId = state.activePageId;
      if (!pageId || layouts.length === 0) {
        return;
      }
      const layoutMap = new Map(layouts.map((layout) => [layout.id, layout]));
      let changed = false;
      const pages = state.pages.map((page) => {
        if (page.id !== pageId) {
          return page;
        }
        const widgets = page.widgets.map((widget) => {
          const layout = layoutMap.get(widget.id);
          if (!layout) {
            return widget;
          }
          const next = {
            ...widget,
            x: Math.max(0, Math.round(layout.x)),
            y: Math.max(0, Math.round(layout.y)),
            w: clamp(Math.round(layout.w), MIN_WIDTH, MAX_WIDTH),
            h: clamp(Math.round(layout.h), MIN_HEIGHT, MAX_HEIGHT)
          };
          if (
            next.x === widget.x &&
            next.y === widget.y &&
            next.w === widget.w &&
            next.h === widget.h
          ) {
            return widget;
          }
          changed = true;
          return next;
        });
        if (!changed) {
          return page;
        }
        return { ...page, widgets };
      });
      if (!changed) {
        return;
      }
      applyPagesUpdate(pages, pageId);
    }
  };
});

export default useWidgets;
