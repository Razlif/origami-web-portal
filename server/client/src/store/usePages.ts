import api from '../services/api';
import type { DashboardPage } from '../types';

const pluralize = (value: number, noun: string) => `${value} ${noun}${value === 1 ? '' : 's'}`;

export const fetchPagesFromApi = async (): Promise<DashboardPage[]> => {
  try {
    const response = await api.get<DashboardPage[] | { pages?: DashboardPage[] }>('/pages');
    const payload = Array.isArray(response.data) ? response.data : response.data?.pages;
    const pages = Array.isArray(payload) ? payload : [];
    console.info(`✅ Loaded pages: ${pages.length}`);
    return pages;
  } catch (error) {
    const status = (error as { response?: { status?: number } }).response?.status;
    if (status === 404) {
      console.info('/api/pages returned 404. Starting with an empty dashboard.');
      return [];
    }
    console.error('Failed to fetch dashboard pages', error);
    throw error;
  }
};

export const savePagesToApi = async (pages: DashboardPage[]): Promise<void> => {
  try {
    await api.post('/pages', pages);
    const names = pages.map((page) => `${page.name} (${page.widgets.length} widget${page.widgets.length === 1 ? '' : 's'})`);
    console.info(`Persisted ${pluralize(pages.length, 'page')} to /api/pages → ${names.join(', ')}`);
  } catch (error) {
    console.error('Failed to persist dashboard pages', error);
    throw error;
  }
};

export const publishPageToApi = async (pageId: string) => {
  try {
    const response = await api.post<{ page?: DashboardPage }>(`/pages/${pageId}/publish`);
    return response.data?.page;
  } catch (error) {
    console.error('Failed to publish dashboard page', error);
    throw error;
  }
};

export const unpublishPageToApi = async (pageId: string) => {
  try {
    const response = await api.post<{ page?: DashboardPage }>(`/pages/${pageId}/unpublish`);
    return response.data?.page;
  } catch (error) {
    console.error('Failed to unpublish dashboard page', error);
    throw error;
  }
};

export const logPageStructure = (pages: DashboardPage[], context: string) => {
  if (import.meta.env.PROD) {
    return;
  }
  const header = context ? `Dashboard pages (${context})` : 'Dashboard pages';
  console.groupCollapsed(header);
  if (pages.length === 0) {
    console.log('• No pages configured');
  }
  for (const page of pages) {
    console.log(`• ${page.name} [${page.published ? 'Published' : 'Draft'}] — ${page.widgets.length} widget(s)`);
    for (const widget of page.widgets) {
      console.log(
        `   ↳ ${widget.title ?? widget.id} · ${widget.type?.toUpperCase()} · ${widget.aggregation?.toUpperCase()} @ (${widget.x}, ${widget.y}) ${widget.w}×${widget.h}`
      );
    }
  }
  console.groupEnd();
};
