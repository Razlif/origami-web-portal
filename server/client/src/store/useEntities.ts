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
          if (!name) {
            return null;
          }
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

  const groups =
    Array.isArray(entity?.groups) && entity.groups.length > 0
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

export const useEntities = create<EntitiesState>((set) => ({
  entities: [],
  setStructure(entities) {
    if (!Array.isArray(entities)) {
      console.warn('Attempted to set Origami structure with an invalid entities payload.', entities);
      return;
    }
    const normalized = entities.map(normalizeEntity).filter((entity) => entity.name);
    set({ entities: normalized });
  }
}));

export default useEntities;
