export interface ProxyConfig {
  envVar: string;
  defaultUrl: string;
  routePath: string;
  serviceName: string;
}

export const SERVICE_PORTS: Record<string, number> = {
  auth: 3001,
  pet: 3002,
  social: 3008,
  vet: 3007,
  marketplace: 3005,
  adoption: 3006,
  task: 3012,
  wearables: 3011,
  notification: 3009,
  payment: 3010,
  emergency: 3013,
  video: 3014,
  finance: 3015,
  subscription: 3016,
  mcp: 3021,
  admin: 3020,
} as const;
