export interface WooWebhookEventRow {
  id: string;
  eventType: string;
  resourceId?: string | null;
  payloadJson: unknown;
  signatureValid: boolean;
  processed: boolean;
  processedAt?: string | null;
  createdAt: string;
}

export interface IntegrationSyncJobRow {
  id: string;
  jobName: string;
  status: 'queued' | 'running' | 'success' | 'failed';
  startedAt?: string | null;
  finishedAt?: string | null;
  metricsJson?: unknown;
  errorText?: string | null;
}
