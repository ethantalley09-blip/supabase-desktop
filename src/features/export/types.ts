// A feature module (overview, fundraising, comms, ...) exposes its
// exportable data as one of these; the page-level ExportButton renders
// whatever datasets the enabled tabs registered, so export is a page
// capability rather than something hardcoded into a single tab.
export type ExportDataset = {
  id: string;
  label: string;
  getRows: () => Promise<Record<string, unknown>[]> | Record<string, unknown>[];
};
