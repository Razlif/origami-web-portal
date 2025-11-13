import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import type { EntityDefinition, EntityField, OrigamiRecord, WidgetConfig } from '../types';
import { useTheme } from '../store/useTheme';

const palette = ['#1c7ed6', '#74c0fc', '#f59f00', '#f76707', '#9775fa', '#20c997'];

const resolveFieldMeta = (entity: EntityDefinition | undefined, fieldName: string): EntityField | undefined => {
  if (!entity) {
    return undefined;
  }
  return entity.fields.find((field) => field.name === fieldName || field.dataName === fieldName);
};

const aggregateRecords = (widget: WidgetConfig, records: OrigamiRecord[]) => {
  const [valueField, groupField] = widget.fields;
  const aggregation = widget.aggregation ?? 'count';

  if (!groupField && !valueField) {
    return [
      {
        name: 'Total',
        value: records.length
      }
    ];
  }

  if (!groupField) {
    if (aggregation === 'count') {
      return [
        {
          name: valueField ?? 'Records',
          value: records.length
        }
      ];
    }
    const total = records.reduce((sum, record) => sum + Number(record[valueField ?? ''] ?? 0), 0);
    const value = aggregation === 'avg' ? (records.length > 0 ? total / records.length : 0) : total;
    return [
      {
        name: valueField ?? 'Value',
        value
      }
    ];
  }

  const grouped = new Map<string, { sum: number; count: number }>();
  for (const record of records) {
    const key = String(record[groupField] ?? 'Unknown');
    if (!grouped.has(key)) {
      grouped.set(key, { sum: 0, count: 0 });
    }
    const payload = grouped.get(key)!;
    if (aggregation === 'count') {
      payload.count += 1;
    } else if (valueField) {
      payload.sum += Number(record[valueField] ?? 0);
      payload.count += 1;
    }
  }

  return Array.from(grouped.entries()).map(([name, payload]) => {
    let value = payload.count;
    if (aggregation === 'sum') {
      value = payload.sum;
    } else if (aggregation === 'avg') {
      value = payload.count > 0 ? payload.sum / payload.count : 0;
    }
    return { name, value };
  });
};

interface WidgetPreviewProps {
  widget: WidgetConfig;
  records: OrigamiRecord[];
  entity?: EntityDefinition;
  canEdit: boolean;
}

export const WidgetPreview = ({ widget, records, entity, canEdit }: WidgetPreviewProps) => {
  const { theme } = useTheme();
  const axisColor = theme === 'dark' ? '#cbd5f5' : '#475569';
  const legendColor = theme === 'dark' ? '#e2e8f0' : '#475569';
  const tooltipStyle = {
    backgroundColor: theme === 'dark' ? '#111c33' : '#ffffff',
    borderRadius: '12px',
    borderColor: theme === 'dark' ? '#1f2f4f' : '#d8e0f0',
    color: legendColor
  } as const;

  if (widget.type === 'table') {
    const tableFields = widget.fields
      .map((field) => resolveFieldMeta(entity, field))
      .filter((field): field is EntityField => Boolean(field));
    if (tableFields.length === 0) {
      return (
        <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-soft bg-surface p-6 text-xs text-muted">
          {canEdit ? 'Select fields for this table widget.' : 'No fields selected.'}
        </div>
      );
    }
    if (records.length === 0) {
      return (
        <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-soft bg-surface p-6 text-xs text-muted">
          No data available.
        </div>
      );
    }
    return (
      <div className="h-full overflow-auto rounded-2xl border border-soft">
        <table className="min-w-full divide-y divide-[var(--color-border)] text-xs">
          <thead className="bg-surface-elevated">
            <tr>
              {tableFields.map((field) => (
                <th key={field.name} className="px-3 py-2 text-right font-semibold uppercase tracking-wide text-muted">
                  {field.label ?? field.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)] bg-surface">
            {records.slice(0, 30).map((record, index) => (
              <tr key={index} className="transition hover:bg-surface-elevated">
                {tableFields.map((field) => (
                  <td key={field.name} className="whitespace-nowrap px-3 py-2 text-right text-strong">
                    {record[field.dataName] ?? record[field.name] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const chartData = aggregateRecords(widget, records);

  if (chartData.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-soft bg-surface p-6 text-xs text-muted">
        No data to visualise.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      {widget.type === 'bar' ? (
        <BarChart data={chartData} barCategoryGap={16}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#1f2f4f' : '#e2e8f0'} />
          <XAxis dataKey="name" stroke={axisColor} fontSize={12} tickMargin={8} />
          <YAxis stroke={axisColor} fontSize={12} allowDecimals tickMargin={8} />
          <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: legendColor }} cursor={{ fill: 'rgba(28, 126, 214, 0.08)' }} />
          <Legend wrapperStyle={{ color: legendColor }} iconType="circle" />
          <Bar dataKey="value" fill="#1c7ed6">
            {chartData.map((entry, index) => (
              <Cell key={entry.name} fill={palette[index % palette.length]} />
            ))}
          </Bar>
        </BarChart>
      ) : widget.type === 'line' ? (
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#1f2f4f' : '#e2e8f0'} />
          <XAxis dataKey="name" stroke={axisColor} fontSize={12} tickMargin={8} />
          <YAxis stroke={axisColor} fontSize={12} allowDecimals tickMargin={8} />
          <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: legendColor }} />
          <Legend wrapperStyle={{ color: legendColor }} iconType="circle" />
          <Line type="monotone" dataKey="value" stroke="#1c7ed6" strokeWidth={2} dot />
        </LineChart>
      ) : (
        <PieChart>
          <Pie dataKey="value" data={chartData} outerRadius="80%" label>
            {chartData.map((entry, index) => (
              <Cell key={entry.name} fill={palette[index % palette.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: legendColor }} />
          <Legend wrapperStyle={{ color: legendColor }} iconType="circle" />
        </PieChart>
      )}
    </ResponsiveContainer>
  );
};

export default WidgetPreview;
