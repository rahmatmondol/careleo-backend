export interface IntegrationSyncJobRow {
  id: string;
  jobName: string;
  status: 'queued' | 'running' | 'success' | 'failed';
  startedAt?: string | null;
  finishedAt?: string | null;
  metricsJson?: unknown;
  errorText?: string | null;
}
