import {
  NodeTracerProvider,
  BatchSpanProcessor,
} from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FastifyInstrumentation } from '@opentelemetry/instrumentation-fastify';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';

let provider: NodeTracerProvider | null = null;

/**
 * Initialize OpenTelemetry tracing.
 * Must be called before any Fastify/HTTP code is loaded (top of server.ts).
 * No-ops gracefully if OTEL_EXPORTER_OTLP_ENDPOINT is not set.
 */
export function initTracing(opts: {
  serviceName: string;
  otlpEndpoint?: string;
}): void {
  if (provider) return;

  if (!opts.otlpEndpoint) {
    // No exporter configured — tracing is a no-op
    return;
  }

  provider = new NodeTracerProvider({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: opts.serviceName,
      [SEMRESATTRS_SERVICE_VERSION]: '1.0.0',
    }),
  });

  provider.addSpanProcessor(
    new BatchSpanProcessor(
      new OTLPTraceExporter({ url: `${opts.otlpEndpoint}/v1/traces` })
    )
  );

  provider.register();

  registerInstrumentations({
    instrumentations: [
      new HttpInstrumentation(),
      new FastifyInstrumentation(),
    ],
  });

  process.on('SIGTERM', () => {
    shutdownTracing().catch((err: unknown) => {
      console.error('[tracing] Error shutting down provider:', err);
    });
  });
}

/**
 * Gracefully shut down the tracing provider.
 */
export async function shutdownTracing(): Promise<void> {
  if (provider) {
    await provider.shutdown();
    provider = null;
  }
}
