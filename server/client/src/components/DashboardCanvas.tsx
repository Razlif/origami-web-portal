import { useCallback, useMemo, useState } from 'react';
import { Responsive, WidthProvider, type Layout, type Layouts } from 'react-grid-layout';
import { motion } from 'framer-motion';
import type { EntityDefinition, OrigamiRecord, WidgetConfig } from '../types';
import WidgetPreview from './WidgetPreview';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import '../styles/react-grid.css';

interface DashboardCanvasProps {
  widgets: WidgetConfig[];
  editMode: boolean;
  canEdit: boolean;
  dataMap: Record<string, OrigamiRecord[]>;
  entityLookup: Record<string, EntityDefinition>;
  widgetLoading: Record<string, boolean>;
  widgetErrors: Record<string, string>;
  onLayoutChange: (layouts: Array<{ id: string; x: number; y: number; w: number; h: number }>) => void;
  onEditWidget: (widget: WidgetConfig) => void;
  onRemoveWidget: (id: string) => void;
}

const ROW_HEIGHT = 120;
const GRID_MARGIN: [number, number] = [16, 16];

const BREAKPOINTS = {
  lg: 1200,
  md: 992,
  sm: 768,
  xs: 560,
  xxs: 0
} as const;

const COLUMNS = {
  lg: 12,
  md: 8,
  sm: 4,
  xs: 2,
  xxs: 1
} as const;

const ResponsiveGridLayout = WidthProvider(Responsive);

type BreakpointKey = keyof typeof COLUMNS;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const createLayoutForColumns = (widgets: WidgetConfig[], columns: number): Layout[] => {
  return widgets.map((widget) => {
    const width = clamp(widget.w, 1, columns);
    const maxX = Math.max(columns - width, 0);
    const x = clamp(widget.x, 0, maxX);
    return {
      i: widget.id,
      x,
      y: Math.max(0, Math.round(widget.y)),
      w: width,
      h: clamp(Math.round(widget.h), 1, 12),
      minW: 1,
      minH: 1,
      maxW: columns
    } as Layout;
  });
};

const createLayouts = (widgets: WidgetConfig[]): Layouts => ({
  lg: createLayoutForColumns(widgets, COLUMNS.lg),
  md: createLayoutForColumns(widgets, COLUMNS.md),
  sm: createLayoutForColumns(widgets, COLUMNS.sm),
  xs: createLayoutForColumns(widgets, COLUMNS.xs),
  xxs: createLayoutForColumns(widgets, COLUMNS.xxs)
});

const convertLayoutToBase = (layout: Layout[], breakpoint: BreakpointKey) => {
  const columns = COLUMNS[breakpoint] ?? COLUMNS.lg;
  if (columns === COLUMNS.lg) {
    return layout.map((item) => ({ id: item.i, x: item.x, y: item.y, w: item.w, h: item.h }));
  }
  const ratio = COLUMNS.lg / columns;
  return layout.map((item) => {
    const width = clamp(Math.round(item.w * ratio), 1, COLUMNS.lg);
    const maxX = Math.max(COLUMNS.lg - width, 0);
    const x = clamp(Math.round(item.x * ratio), 0, maxX);
    return {
      id: item.i,
      x,
      y: item.y,
      w: width,
      h: item.h
    };
  });
};

const WidgetCard = ({
  widget,
  editMode,
  canEdit,
  records,
  entity,
  loading,
  error,
  onEditWidget,
  onRemoveWidget
}: {
  widget: WidgetConfig;
  editMode: boolean;
  canEdit: boolean;
  records: OrigamiRecord[];
  entity?: EntityDefinition;
  loading: boolean;
  error?: string;
  onEditWidget: (widget: WidgetConfig) => void;
  onRemoveWidget: (id: string) => void;
}) => (
  <motion.div
    layout
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.25 }}
    className="h-full"
  >
    <div className="relative flex h-full flex-col overflow-hidden rounded-3xl border border-soft bg-surface shadow-soft">
      <div className="widget-drag-handle flex items-start justify-between gap-3 border-b border-soft px-4 py-3">
        <div className="flex-1 text-right">
          <h3 className="text-sm font-semibold text-strong">{widget.title}</h3>
          <p className="text-[11px] uppercase tracking-wide text-muted">
            {widget.entity} · {widget.type}
          </p>
        </div>
        {canEdit ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => onEditWidget(widget)}
              className="rounded-full border border-soft px-3 py-1 text-[11px] font-semibold text-muted transition hover:border-primary/40 hover:text-primary"
            >
              Edit
            </button>
            <button
              onClick={() => onRemoveWidget(widget.id)}
              className="rounded-full border border-red-200 px-3 py-1 text-[11px] font-semibold text-red-600 transition hover:bg-red-50"
            >
              Remove
            </button>
          </div>
        ) : null}
      </div>
      <div className="flex-1 overflow-hidden p-3">
        {loading ? (
          <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-soft bg-surface p-6 text-xs text-muted">
            Loading widget data…
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center rounded-2xl border border-red-200 bg-red-50/40 p-6 text-center text-xs text-red-600">
            {error}
          </div>
        ) : (
          <WidgetPreview widget={widget} records={records} entity={entity} canEdit={canEdit} />
        )}
      </div>
      {editMode ? (
        <div className="pointer-events-none absolute inset-0 rounded-3xl border-2 border-dashed border-primary/30" aria-hidden />
      ) : null}
    </div>
  </motion.div>
);

export const DashboardCanvas = ({
  widgets,
  editMode,
  canEdit,
  dataMap,
  entityLookup,
  widgetLoading,
  widgetErrors,
  onLayoutChange,
  onEditWidget,
  onRemoveWidget
}: DashboardCanvasProps) => {
  const [breakpoint, setBreakpoint] = useState<BreakpointKey>('lg');

  const layouts = useMemo(() => createLayouts(widgets), [widgets]);

  const handleLayoutChange = useCallback(
    (layout: Layout[]) => {
      if (!editMode) {
        return;
      }
      const normalized = convertLayoutToBase(layout, breakpoint);
      onLayoutChange(normalized);
    },
    [breakpoint, editMode, onLayoutChange]
  );

  return (
    <ResponsiveGridLayout
      className={`origami-grid${editMode ? ' editable' : ''}`}
      breakpoints={BREAKPOINTS}
      cols={COLUMNS}
      layouts={layouts}
      rowHeight={ROW_HEIGHT}
      margin={GRID_MARGIN}
      containerPadding={[0, 0]}
      isDraggable={editMode}
      isResizable={editMode}
      compactType="vertical"
      draggableHandle=".widget-drag-handle"
      preventCollision={false}
      onLayoutChange={handleLayoutChange}
      onBreakpointChange={(next) => setBreakpoint(next as BreakpointKey)}
      style={{ direction: 'ltr' }}
    >
      {widgets.map((widget) => (
        <div key={widget.id} className="h-full">
          <WidgetCard
            widget={widget}
            editMode={editMode}
            canEdit={canEdit}
            records={dataMap[widget.id] ?? []}
            entity={entityLookup[widget.entity]}
            loading={Boolean(widgetLoading[widget.id])}
            error={widgetErrors[widget.id]}
            onEditWidget={onEditWidget}
            onRemoveWidget={onRemoveWidget}
          />
        </div>
      ))}
    </ResponsiveGridLayout>
  );
};

export default DashboardCanvas;
