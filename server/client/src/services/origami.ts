import api from './api';
import type { EntityDefinition, OrigamiRecord, WidgetConfig } from '../types';

export const fetchStructure = async (): Promise<{ entities: EntityDefinition[] }> => {
  const endpoint = '/structure';
  const response = await api.get(endpoint);
  console.info(`Origami API GET ${endpoint} → ${response.status}`);
  if (!response?.data?.entities) {
    console.warn('No entities received from Origami.', {
      endpoint,
      status: response?.status,
      payload: response?.data
    });
    return { entities: [] };
  }
  return response.data;
};

export const refreshStructure = async (): Promise<{ entities: EntityDefinition[] }> => {
  const endpoint = '/structure/fetch';
  const response = await api.post(endpoint);
  console.info(`Origami API POST ${endpoint} → ${response.status}`);
  if (!response?.data?.entities) {
    console.warn('No entities received from Origami during refresh.', {
      endpoint,
      status: response?.status,
      payload: response?.data
    });
    return { entities: [] };
  }
  return response.data;
};

export const testConnection = async (): Promise<boolean> => {
  try {
    const response = await api.get('/connection/test');
    return response.data?.status === 'ok';
  } catch (error) {
    console.error('Connection test failed', error);
    return false;
  }
};

export const fetchEntityData = async (entity: string): Promise<OrigamiRecord[]> => {
  const response = await api.get(`/data/${entity}`);
  return response.data;
};

export const fetchWidgetRecords = async (widgetId: string): Promise<OrigamiRecord[]> => {
  const response = await api.get(`/widgets/${widgetId}/data`);
  return Array.isArray(response.data?.records) ? response.data.records : [];
};

export const fetchWidgetPreview = async (widget: WidgetConfig): Promise<OrigamiRecord[]> => {
  const response = await api.post('/widgets/preview', widget);
  return Array.isArray(response.data?.records) ? response.data.records : [];
};

export const refreshEntityData = async (entity: string): Promise<OrigamiRecord[]> => {
  const response = await api.post(`/data/${entity}/refresh`);
  return response.data;
};

export const refreshAllData = async (): Promise<void> => {
  await api.post('/data/refresh-all');
};

export const updateRecord = async (_entity: string, _record: OrigamiRecord): Promise<void> => {
  throw new Error('updateRecord is disabled in the read-only edition');
};

export const exportLayout = (widgets: WidgetConfig[]) => JSON.stringify({ widgets });

export const importLayout = (payload: string): WidgetConfig[] => {
  const parsed = JSON.parse(payload);
  return parsed.widgets ?? [];
};
