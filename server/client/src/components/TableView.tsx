import type { EntityField, OrigamiRecord } from '../types';

interface TableViewProps {
  fields: EntityField[];
  records: OrigamiRecord[];
}

export const TableView = ({ fields, records }: TableViewProps) => {
  const visibleFields = fields;

  if (records.length === 0) {
    return (
      <p className="rounded-3xl border border-dashed border-soft bg-surface p-6 text-center text-sm text-muted">
        No records to display.
      </p>
    );
  }

  return (
    <div className="overflow-auto rounded-3xl border border-soft bg-surface shadow-soft">
      <table className="min-w-full divide-y divide-[var(--color-border)] text-sm">
        <thead className="bg-surface-elevated">
          <tr>
            {visibleFields.map((field) => (
              <th
                key={field.name}
                className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted"
              >
                {field.label ?? field.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)] bg-surface">
          {records.map((record, rowIndex) => (
            <tr key={rowIndex} className="transition hover:bg-surface-elevated">
              {visibleFields.map((field) => (
                <td key={field.name} className="whitespace-nowrap px-4 py-3 text-right text-strong">
                  {record[field.name] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TableView;
