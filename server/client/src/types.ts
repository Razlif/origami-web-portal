export interface EntityFieldOption {
  value: string;
  label?: string;
}

export interface EntityField {
  name: string;
  dataName: string;
  label: string;
  type: string;
  hidden?: boolean;
  options?: EntityFieldOption[];
  constraints?: Record<string, unknown>;
}

export interface EntityGroupPermissions {
  [permission: string]: boolean;
}

export interface EntityGroup {
  name: string;
  dataName: string;
  repeatable: boolean;
  permissions: EntityGroupPermissions;
  fields: EntityField[];
}

export interface EntityDefinition {
  name: string;
  dataName: string;
  label: string;
  groups: EntityGroup[];
  fields: EntityField[];
}

export type WidgetType = 'table' | 'bar' | 'line' | 'pie';
export type WidgetAggregation = 'count' | 'sum' | 'avg';
export type WidgetFilterOperator = '=' | '!=' | '>' | '>=' | '<' | '<=' | 'contains';
export type UserRole = 'admin' | 'user';

export interface WidgetFilter {
  field: string;
  operator: WidgetFilterOperator;
  value: string;
}

export interface PortalUser {
  id: string;
  username: string;
  role: UserRole;
  allowedPages: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface WidgetConfig {
  id: string;
  pageId: string;
  title: string;
  type: WidgetType;
  entity: string;
  fields: string[];
  aggregation: WidgetAggregation;
  x: number;
  y: number;
  w: number;
  h: number;
  filters: WidgetFilter[];
}

export interface DashboardPage {
  id: string;
  name: string;
  published: boolean;
  widgets: WidgetConfig[];
}

export interface OrigamiRecord {
  [key: string]: string | number | null;
}
