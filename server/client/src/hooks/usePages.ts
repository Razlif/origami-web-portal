import { useEffect } from 'react';
import { useWidgets } from '../store/useWidgets';

export const usePages = () => {
  const load = useWidgets((state) => state.load);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    pages: useWidgets((state) => state.pages),
    activePageId: useWidgets((state) => state.activePageId),
    widgets: useWidgets((state) => state.widgets),
    editMode: useWidgets((state) => state.editMode),
    dirty: useWidgets((state) => state.dirty),
    hydrated: useWidgets((state) => state.hydrated),
    setEditMode: useWidgets((state) => state.setEditMode),
    updateWidget: useWidgets((state) => state.updateWidget),
    applyLayout: useWidgets((state) => state.applyLayout),
    removeWidget: useWidgets((state) => state.removeWidget),
    setActivePage: useWidgets((state) => state.setActivePage),
    addPage: useWidgets((state) => state.addPage),
    renamePage: useWidgets((state) => state.renamePage),
    removePage: useWidgets((state) => state.removePage),
    savePages: useWidgets((state) => state.savePages),
    updatePage: useWidgets((state) => state.updatePage),
    addWidget: useWidgets((state) => state.addWidget),
    setPagePublished: useWidgets((state) => state.setPagePublished)
  };
};

export default usePages;
