// Tracing must be initialized before any instrumented libraries are imported
import { initTracing } from './services/observability/tracing';
import { buildApp } from './app';
import { settings } from './config/settings';

initTracing({
  serviceName: settings.OTEL_SERVICE_NAME,
  otlpEndpoint: settings.OTEL_EXPORTER_OTLP_ENDPOINT,
});

async function main() {
  const app = await buildApp();

  try {
    const address = await app.listen({
      port: settings.APP_PORT,
      host: settings.APP_HOST,
    });
    app.log.info({ address, env: settings.APP_ENV }, 'ChildAI backend started');
  } catch (err) {
    app.log.error(err, 'Failed to start server');
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Shutdown signal received');
    try {
      await app.close();
      app.log.info('Server closed gracefully');
      process.exit(0);
    } catch (err) {
      app.log.error(err, 'Error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
