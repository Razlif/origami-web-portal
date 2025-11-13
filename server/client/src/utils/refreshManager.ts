export type RefreshCallback = () => Promise<void> | void;

interface RefreshHandle {
  id: string;
  callback: RefreshCallback;
  intervalId?: number;
}

export class RefreshManager {
  private handles = new Map<string, RefreshHandle>();
  constructor(private defaultInterval = 300000) {}

  register(id: string, callback: RefreshCallback, interval?: number) {
    this.unregister(id);
    const intervalId = window.setInterval(() => {
      Promise.resolve(callback()).catch((error) =>
        console.error(`Refresh callback failed for ${id}`, error)
      );
    }, interval ?? this.defaultInterval);
    this.handles.set(id, { id, callback, intervalId });
  }

  trigger(id: string) {
    const handle = this.handles.get(id);
    if (!handle) return;
    Promise.resolve(handle.callback()).catch((error) =>
      console.error(`Refresh callback failed for ${id}`, error)
    );
  }

  unregister(id: string) {
    const handle = this.handles.get(id);
    if (handle?.intervalId) {
      window.clearInterval(handle.intervalId);
    }
    this.handles.delete(id);
  }

  dispose() {
    this.handles.forEach((handle) => {
      if (handle.intervalId) {
        window.clearInterval(handle.intervalId);
      }
    });
    this.handles.clear();
  }
}

export const createRefreshManager = (interval?: number) => new RefreshManager(interval);
