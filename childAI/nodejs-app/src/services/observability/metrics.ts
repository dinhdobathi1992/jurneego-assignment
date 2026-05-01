import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();

// Collect Node.js default metrics (heap, event loop, etc.)
collectDefaultMetrics({ register: registry });

// HTTP
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'],
  registers: [registry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

// AI provider
export const aiRequestDurationSeconds = new Histogram({
  name: 'ai_request_duration_seconds',
  help: 'AI provider request duration',
  labelNames: ['provider', 'model', 'status'],
  buckets: [0.5, 1, 2, 5, 10, 30],
  registers: [registry],
});

export const aiProviderFailuresTotal = new Counter({
  name: 'ai_provider_failures_total',
  help: 'AI provider failures',
  labelNames: ['provider', 'error_class'],
  registers: [registry],
});

// Safety
export const safetyChecksTotal = new Counter({
  name: 'safety_checks_total',
  help: 'Safety checks performed',
  labelNames: ['direction', 'checker', 'result', 'flag_type'],
  registers: [registry],
});

export const flagsCreatedTotal = new Counter({
  name: 'flags_created_total',
  help: 'Safety flags created',
  labelNames: ['flag_type', 'severity'],
  registers: [registry],
});

// SSE
export const sseStreamsActive = new Gauge({
  name: 'sse_streams_active',
  help: 'Currently active SSE streams',
  registers: [registry],
});

export const sseStreamDurationSeconds = new Histogram({
  name: 'sse_stream_duration_seconds',
  help: 'SSE stream duration',
  labelNames: ['status'],
  buckets: [1, 5, 10, 30, 60, 120],
  registers: [registry],
});

// Rate limiting
export const rateLimitBlockedTotal = new Counter({
  name: 'rate_limit_blocked_total',
  help: 'Requests blocked by rate limiting',
  labelNames: ['limit_type'],
  registers: [registry],
});

// AI token tracking
export const aiTokensTotal = new Counter({
  name: 'ai_tokens_total',
  help: 'AI tokens used',
  labelNames: ['provider', 'model', 'direction'],
  registers: [registry],
});

// Adult-view / guidance / translation metrics (P2-5)
export const adultViewRequestsTotal = new Counter({
  name: 'adult_view_requests_total',
  help: 'Requests to adult-view (parent/teacher) endpoints',
  labelNames: ['role', 'endpoint'],
  registers: [registry],
});

export const guidanceNotesCreatedTotal = new Counter({
  name: 'guidance_notes_created_total',
  help: 'Guidance notes created by parents or teachers',
  labelNames: ['author_role'],
  registers: [registry],
});

export const translationRequestsTotal = new Counter({
  name: 'translation_requests_total',
  help: 'Translation requests for messages',
  labelNames: ['target_language'],
  registers: [registry],
});
