import { create } from 'zustand';
import type { EntityDefinition, EntityField, EntityGroup } from '../types';

interface EntitiesState {
  entities: EntityDefinition[];
  setStructure: (entities: EntityDefinition[]) => void;
}

const createFallbackGroup = (entityName: string, fields: EntityField[]): EntityGroup => ({
  name: 'Fields',
  dataName: entityName,
  repeatable: false,
  permissions: {},
  fields
});

const normalizeEntity = (entity: EntityDefinition): EntityDefinition => {
  const fields = Array.isArray(entity?.fields)
    ? entity.fields
        .map((field) => {
          const name = field?.name ?? field?.dataName;
          if (!name) return null;
          return {
            ...field,
            name,
            dataName: field?.dataName ?? name,
            label: field?.label ?? name,
            type: field?.type ?? 'text',
            hidden: Boolean(field?.hidden)
          };
        })
        .filter((field): field is EntityField => Boolean(field))
    : [];

  const groups = Array.isArray(entity?.groups) && entity.groups.length > 0
    ? entity.groups.map((group) => ({
        ...group,
        fields: Array.isArray(group?.fields) ? group.fields : [],
        permissions:
          group?.permissions && typeof group.permissions === 'object'
            ? group.permissions
            : {}
      }))
    : [createFallbackGroup(entity?.name ?? entity?.dataName ?? 'entity', fields)];

  return {
    ...entity,
    name: entity?.name ?? entity?.dataName ?? '',
    dataName: entity?.dataName ?? entity?.name ?? '',
    label: entity?.label ?? entity?.name ?? entity?.dataName ?? '',
    fields,
    groups
  };
};

const logStructureSummary = (entities: EntityDefinition[]) => {
  if (entities.length === 0) {
    console.info('Origami structure → (no entities available)');
    return;
  }
  console.groupCollapsed('Origami structure');
  for (const entity of entities) {
    const entityLabel = entity.label ?? entity.name;
    console.log(`→ ${entityLabel} (${entity.fields.length} fields)`);
    for (const group of entity.groups) {
      const fieldNames = group.fields.map((field) => field.label ?? field.name).join(', ');
      const repeatableSuffix = group.repeatable ? ' (repeatable)' : '';
      console.log(`   ↳ ${group.name}${repeatableSuffix}${fieldNames ? ` → ${fieldNames}` : ''}`);
    }
  }
  console.groupEnd();
};

export const useEntities = create<EntitiesState>((set) => ({
  entities: [],
  setStructure(entities) {
    if (!Array.isArray(entities)) {
      console.warn('Attempted to set Origami structure with an invalid entities payload.', entities);
      return;
    }
    const normalizedEntities = entities.map(normalizeEntity).filter((entity) => entity.name);
    set({ entities: normalizedEntities });
    console.info(`✅ Loaded entities: ${normalizedEntities.length}`);
    logStructureSummary(normalizedEntities);
  }
}));

export default useEntities;
