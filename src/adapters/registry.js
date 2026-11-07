// Adapters live at the edge: the core never knows where a story is saved or how it is exported.
//
// A saver looks like:
//   { id, label,
//     isAvailable(): boolean,                  // can this browser use it at all?
//     load(): Promise<object|null>,            // the saved story JSON, or null if none
//     save(story, { getBlob }): Promise<void>  // getBlob(assetId) -> Blob, for savers that write files
//   }
// An exporter (Phase 3) looks like:
//   { id, label, export(story, { getBlob }): Promise<void> }

export const ADAPTERS = { exporters: {}, savers: {} };

export function registerSaver(saver) {
  ADAPTERS.savers[saver.id] = saver;
}

export function registerExporter(exporter) {
  ADAPTERS.exporters[exporter.id] = exporter;
}

export function availableSavers() {
  return Object.values(ADAPTERS.savers).filter((s) => {
    try { return s.isAvailable(); } catch { return false; }
  });
}
