import { Fragment, useEffect, useMemo, useState } from 'react';
import { nanoid } from 'nanoid/non-secure';
import type { EntityDefinition, WidgetAggregation, WidgetConfig, WidgetFilterOperator, WidgetType } from '../types';

interface WidgetModalProps {
  isOpen: boolean;
  entities: EntityDefinition[];
  initialWidget: WidgetConfig | null;
  onClose: () => void;
  onSubmit: (config: Omit<WidgetConfig, 'id' | 'pageId' | 'x' | 'y'>) => void;
}

const visualizationTypes: WidgetType[] = ['table', 'bar', 'line', 'pie'];
const aggregations: WidgetAggregation[] = ['count', 'sum', 'avg'];
const filterOperators: WidgetFilterOperator[] = ['=', '!=', '>', '>=', '<', '<=', 'contains'];

interface FilterDraft {
  id: string;
  field: string;
  operator: WidgetFilterOperator;
  value: string;
  dynamic: boolean;
}

const createFilterDraft = (): FilterDraft => ({
  id: nanoid(),
  field: '',
  operator: '=',
  value: '',
  dynamic: false
});

export const WidgetModal = ({ isOpen, entities, initialWidget, onClose, onSubmit }: WidgetModalProps) => {
  const [selectedEntity, setSelectedEntity] = useState(entities[0]?.name ?? '');
  const [visualization, setVisualization] = useState<WidgetType>('table');
  const [aggregation, setAggregation] = useState<WidgetAggregation>('count');
  const [tableFields, setTableFields] = useState<string[]>([]);
  const [valueField, setValueField] = useState('');
  const [groupField, setGroupField] = useState('');
  const [title, setTitle] = useState('');
  const [filters, setFilters] = useState<FilterDraft[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    if (initialWidget) {
      setSelectedEntity(initialWidget.entity);
      setVisualization(initialWidget.type);
      setAggregation(initialWidget.aggregation ?? 'count');
      setTitle(initialWidget.title);
      setFilters(
        Array.isArray(initialWidget.filters)
          ? initialWidget.filters.map((filter) => {
              const raw = filter?.value ?? '';
              const match = typeof raw === 'string' ? raw.match(/^\{\{\s*(.+?)\s*\}\}$/) : null;
              return {
                id: nanoid(),
                field: filter?.field ?? '',
                operator: filter?.operator ?? '=',
                value: match ? match[1] : String(raw ?? ''),
                dynamic: Boolean(match)
              };
            })
          : []
      );
      if (initialWidget.type === 'table') {
        setTableFields(initialWidget.fields);
        setValueField('');
        setGroupField('');
      } else {
        if (initialWidget.aggregation === 'count') {
          setValueField('');
          setGroupField(initialWidget.fields[0] ?? '');
        } else {
          setValueField(initialWidget.fields[0] ?? '');
          setGroupField(initialWidget.fields[1] ?? '');
        }
        setTableFields([]);
      }
    } else {
      setSelectedEntity(entities[0]?.name ?? '');
      setVisualization('table');
      setAggregation('count');
      setTableFields([]);
      setValueField('');
      setGroupField('');
      setTitle('');
      setFilters([]);
    }
    setError('');
  }, [initialWidget, entities, isOpen]);

  const entity = useMemo(
    () => entities.find((candidate) => candidate.name === selectedEntity),
    [entities, selectedEntity]
  );

  useEffect(() => {
    if (aggregation === 'count') {
      setValueField('');
    }
  }, [aggregation]);

  useEffect(() => {
    if (entity && !entity.fields.some((field) => field.name === valueField || field.dataName === valueField)) {
      setValueField('');
    }
    if (entity && !entity.fields.some((field) => field.name === groupField || field.dataName === groupField)) {
      setGroupField('');
    }
    if (entity) {
      setTableFields((fields) => fields.filter((field) => entity.fields.some((f) => f.name === field || f.dataName === field)));
      setFilters((entries) =>
        entries.map((entry) => {
          if (!entry.field) {
            return entry;
          }
          const exists = entity.fields.some((candidate) => candidate.name === entry.field || candidate.dataName === entry.field);
          return exists ? entry : { ...entry, field: '' };
        })
      );
    }
  }, [entity, valueField, groupField]);

  if (!isOpen) {
    return null;
  }

  const handleFieldToggle = (fieldName: string) => {
    setTableFields((fields) =>
      fields.includes(fieldName) ? fields.filter((field) => field !== fieldName) : [...fields, fieldName]
    );
  };

  const handleAddFilter = () => {
    setFilters((entries) => [...entries, createFilterDraft()]);
  };

  const handleFilterFieldChange = (id: string, fieldName: string) => {
    setFilters((entries) => entries.map((entry) => (entry.id === id ? { ...entry, field: fieldName } : entry)));
  };

  const handleFilterOperatorChange = (id: string, operator: WidgetFilterOperator) => {
    setFilters((entries) => entries.map((entry) => (entry.id === id ? { ...entry, operator } : entry)));
  };

  const handleFilterValueChange = (id: string, value: string) => {
    setFilters((entries) => entries.map((entry) => (entry.id === id ? { ...entry, value } : entry)));
  };

  const handleFilterDynamicToggle = (id: string, dynamic: boolean) => {
    setFilters((entries) =>
      entries.map((entry) => {
        if (entry.id !== id) {
          return entry;
        }
        const trimmed = entry.value.trim();
        return {
          ...entry,
          dynamic,
          value: dynamic ? trimmed || 'current_user.' : trimmed
        };
      })
    );
  };

  const handleRemoveFilter = (id: string) => {
    setFilters((entries) => entries.filter((entry) => entry.id !== id));
  };

  const handleSubmit = () => {
    if (!selectedEntity) {
      setError('Select an entity for this widget.');
      return;
    }

    const normalizedFilters: WidgetConfig['filters'] = [];
    for (const filter of filters) {
      if (!filter.field) {
        continue;
      }
      const trimmedValue = filter.value.trim();
      if (!trimmedValue) {
        setError('Filters must include a value.');
        return;
      }
      let normalizedValue = trimmedValue;
      if (filter.dynamic) {
        let tokenPath = trimmedValue;
        if (tokenPath.startsWith('{{') && tokenPath.endsWith('}}')) {
          tokenPath = tokenPath.slice(2, -2).trim();
        }
        tokenPath = tokenPath.replace(/^current_user\.?/, '').trim();
        if (tokenPath.startsWith('.')) {
          tokenPath = tokenPath.slice(1);
        }
        if (!tokenPath) {
          setError('Dynamic filters must reference a current_user attribute.');
          return;
        }
        normalizedValue = `{{current_user.${tokenPath}}}`;
      }
      normalizedFilters.push({ field: filter.field, operator: filter.operator, value: normalizedValue });
    }

    if (visualization === 'table') {
      if (tableFields.length === 0) {
        setError('Select at least one field for the table.');
        return;
      }
      setError('');
      onSubmit({
        entity: selectedEntity,
        type: visualization,
        fields: tableFields,
        aggregation: 'count',
        title: title || 'Table',
        filters: normalizedFilters
      });
      return;
    }

    if (!valueField && aggregation !== 'count') {
      setError('Choose a value field for this chart.');
      return;
    }

    const fields = [valueField, groupField].filter(Boolean);
    setError('');
    onSubmit({
      entity: selectedEntity,
      type: visualization,
      fields,
      aggregation,
      title: title || 'Widget',
      filters: normalizedFilters
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-3xl border border-soft bg-surface p-6 shadow-soft">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 text-right">
            <h3 className="text-lg font-semibold text-strong">Configure widget</h3>
            <p className="text-xs text-muted">Pick an entity, visualization type, and fields.</p>
          </div>
          <button onClick={onClose} className="rounded-full border border-soft px-3 py-1 text-xs font-semibold text-muted">
            Close
          </button>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Entity
            <select
              value={selectedEntity}
              onChange={(event) => setSelectedEntity(event.target.value)}
              className="w-full rounded-2xl border border-soft px-4 py-2 text-sm text-right text-strong focus:border-primary focus:outline-none"
            >
              {entities.map((candidate) => (
                <option key={candidate.name} value={candidate.name}>
                  {candidate.label ?? candidate.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Widget title"
              className="w-full rounded-2xl border border-soft px-4 py-2 text-sm text-right text-strong focus:border-primary focus:outline-none"
            />
          </label>

          <label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Visualization
            <select
              value={visualization}
              onChange={(event) => setVisualization(event.target.value as WidgetType)}
              className="w-full rounded-2xl border border-soft px-4 py-2 text-sm text-right text-strong focus:border-primary focus:outline-none"
            >
              {visualizationTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          {visualization === 'table' ? (
            <div className="space-y-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Fields
              <div className="flex max-h-60 flex-col gap-2 overflow-auto rounded-2xl border border-soft p-3">
                {entity?.fields.map((field) => {
                  const key = field.dataName || field.name;
                  return (
                    <label key={key} className="flex items-center justify-end gap-2 text-right text-xs font-semibold text-strong">
                      <span>{field.label ?? field.name}</span>
                      <input
                        type="checkbox"
                        checked={tableFields.includes(key)}
                        onChange={() => handleFieldToggle(key)}
                        className="h-4 w-4 rounded border-soft text-primary focus:ring-primary"
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          ) : (
            <Fragment>
              <label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Aggregation
                <select
                  value={aggregation}
                  onChange={(event) => setAggregation(event.target.value as WidgetAggregation)}
                  className="w-full rounded-2xl border border-soft px-4 py-2 text-sm text-right text-strong focus:border-primary focus:outline-none"
                >
                  {aggregations.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Value field
                <select
                  value={valueField}
                  onChange={(event) => setValueField(event.target.value)}
                  className="w-full rounded-2xl border border-soft px-4 py-2 text-sm text-right text-strong focus:border-primary focus:outline-none"
                >
                  <option value="">{aggregation === 'count' ? 'Use record count' : 'Select field'}</option>
                  {entity?.fields.map((field) => {
                    const key = field.dataName || field.name;
                    return (
                      <option key={key} value={key}>
                        {field.label ?? field.name}
                      </option>
                    );
                  })}
                </select>
              </label>

              <label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Group by field
                <select
                  value={groupField}
                  onChange={(event) => setGroupField(event.target.value)}
                  className="w-full rounded-2xl border border-soft px-4 py-2 text-sm text-right text-strong focus:border-primary focus:outline-none"
                >
                  <option value="">No grouping</option>
                  {entity?.fields.map((field) => {
                    const key = field.dataName || field.name;
                    return (
                      <option key={key} value={key}>
                        {field.label ?? field.name}
                      </option>
                    );
                  })}
                </select>
              </label>
            </Fragment>
          )}
          <div className="space-y-2 text-xs font-semibold uppercase tracking-wide text-muted md:col-span-2">
            Filters
            <div className="flex flex-col gap-3 rounded-2xl border border-soft p-3">
              {filters.length === 0 ? (
                <p className="text-[11px] font-normal uppercase tracking-wide text-muted">
                  No filters applied. Add filters to scope widget data.
                </p>
              ) : (
                filters.map((filter) => {
                  const fieldOptions = entity?.fields ?? [];
                  return (
                    <div
                      key={filter.id}
                      className="space-y-3 rounded-2xl border border-soft/70 bg-surface-elevated p-3 text-right shadow-soft"
                    >
                      <div className="grid gap-3 md:grid-cols-3">
                        <label className="space-y-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                          Field
                          <select
                            value={filter.field}
                            onChange={(event) => handleFilterFieldChange(filter.id, event.target.value)}
                            className="w-full rounded-2xl border border-soft px-3 py-2 text-sm text-right text-strong focus:border-primary focus:outline-none"
                          >
                            <option value="">Select field</option>
                            {fieldOptions.map((field) => {
                              const key = field.dataName || field.name;
                              return (
                                <option key={key} value={key}>
                                  {field.label ?? field.name}
                                </option>
                              );
                            })}
                          </select>
                        </label>
                        <label className="space-y-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                          Operator
                          <select
                            value={filter.operator}
                            onChange={(event) =>
                              handleFilterOperatorChange(filter.id, event.target.value as WidgetFilterOperator)
                            }
                            className="w-full rounded-2xl border border-soft px-3 py-2 text-sm text-right text-strong focus:border-primary focus:outline-none"
                          >
                            {filterOperators.map((operator) => (
                              <option key={operator} value={operator}>
                                {operator}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                          Value
                          <input
                            value={filter.value}
                            onChange={(event) => handleFilterValueChange(filter.id, event.target.value)}
                            placeholder={filter.dynamic ? 'current_user.school_id' : 'Value'}
                            className="w-full rounded-2xl border border-soft px-3 py-2 text-sm text-right text-strong focus:border-primary focus:outline-none"
                          />
                        </label>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="flex items-center justify-end gap-2 text-[11px] font-semibold text-muted">
                          <span>Use dynamic value</span>
                          <input
                            type="checkbox"
                            checked={filter.dynamic}
                            onChange={(event) => handleFilterDynamicToggle(filter.id, event.target.checked)}
                            className="h-4 w-4 rounded border-soft text-primary focus:ring-primary"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => handleRemoveFilter(filter.id)}
                          className="rounded-full border border-red-200 px-3 py-1 text-[11px] font-semibold text-red-600 transition hover:bg-red-50"
                        >
                          Remove filter
                        </button>
                      </div>
                      {filter.dynamic ? (
                        <p className="text-[11px] font-normal text-muted">
                          Dynamic filters resolve against the current user context. Enter values such as
                          <span className="px-1 font-mono text-primary">current_user.school_id</span>.
                        </p>
                      ) : null}
                    </div>
                  );
                })
              )}
              <button
                type="button"
                onClick={handleAddFilter}
                className="self-end rounded-full border border-soft px-3 py-1 text-[11px] font-semibold text-muted transition hover:border-primary/40 hover:text-primary"
              >
                + Add filter
              </button>
            </div>
          </div>
        </div>

        {error ? <p className="mt-4 text-xs font-semibold text-red-500">{error}</p> : null}

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-full border border-soft px-4 py-2 text-sm font-semibold text-muted transition hover:border-primary/40 hover:text-primary"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-soft transition hover:bg-primary/90"
          >
            {initialWidget ? 'Update widget' : 'Add widget'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default WidgetModal;
