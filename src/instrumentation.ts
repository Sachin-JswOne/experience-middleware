import 'dotenv/config';
import { diag, DiagConsoleLogger, DiagLogLevel, trace } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

// Enable debug logging
// if (process.env.OTEL_LOG_LEVEL === 'debug') {
//   diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
// }

process.env.OTEL_SERVICE_NAME ||= 'experience-middleware';

console.log('OpenTelemetry Configuration:');
console.log(`Service Name: ${process.env.OTEL_SERVICE_NAME}`);
console.log(`OTLP Endpoint: ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces'}`);
console.log(`Log Level: ${process.env.OTEL_LOG_LEVEL || 'info'}`);

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': { 
        enabled: true,
        ignoreIncomingRequestHook: (req) => {
          // Ignore health checks and metrics endpoints
          return Boolean(req.url?.includes('/metrics') || req.url?.includes('/health'));
        }
      },
      '@opentelemetry/instrumentation-express': { enabled: true },
      // Disable metrics to prevent socket hang up errors
      '@opentelemetry/instrumentation-runtime-node': { enabled: false },
    }),
  ],
});

const startSdk = async () => {
  try {
    await sdk.start();
    console.log('OpenTelemetry SDK initialized successfully');
    console.log(`Service: ${process.env.OTEL_SERVICE_NAME}`);
    console.log(`Endpoint: ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces'}`);
  } catch (err) {
    console.error('OpenTelemetry SDK failed to start:', err);
  }
};

void startSdk();

const shutdown = async () => {
  try {
    await sdk.shutdown();
    console.log('OpenTelemetry SDK shutdown successfully');
  } catch (err) {
    console.error('OpenTelemetry SDK shutdown failed:', err);
  }
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

