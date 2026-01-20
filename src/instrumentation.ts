import 'dotenv/config';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

// Enable debug logging based on environment variable
if (process.env.OTEL_LOG_LEVEL === 'debug') {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
} else if (process.env.OTEL_LOG_LEVEL === 'verbose') {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.VERBOSE);
}

// Set default service name
process.env.OTEL_SERVICE_NAME ||= 'experience-middleware';

// Parse OTEL_RESOURCE_ATTRIBUTES from environment if provided
// Format: key1=value1,key2=value2
const parseResourceAttributes = (): Record<string, string> => {
  const attrs: Record<string, string> = {};
  const envAttrs = process.env.OTEL_RESOURCE_ATTRIBUTES;

  if (envAttrs) {
    envAttrs.split(',').forEach((pair) => {
      const [key, value] = pair.split('=');
      if (key && value) {
        attrs[key.trim()] = value.trim();
      }
    });
  }

  return attrs;
};

// Create resource with semantic conventions and custom attributes
const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'experience-middleware',
  [ATTR_SERVICE_VERSION]: process.env.SERVICE_VERSION || process.env.npm_package_version || '0.0.1',
  // Add custom attributes
  'deployment.environment': process.env.ENVIRONMENT || process.env.NODE_ENV || 'development',
  'service.team': process.env.SERVICE_TEAM || 'ccp',
  // Merge any additional attributes from OTEL_RESOURCE_ATTRIBUTES env var
  ...parseResourceAttributes(),
});

// Store URLs for logging
const traceEndpoint = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
  `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces` ||
  'http://localhost:4318/v1/traces';

const metricsEndpoint = process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT ||
  `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics` ||
  'http://localhost:4318/v1/metrics';

// Configure trace exporter
const traceExporter = new OTLPTraceExporter({
  url: traceEndpoint,
  headers: process.env.OTEL_EXPORTER_OTLP_HEADERS
    ? JSON.parse(process.env.OTEL_EXPORTER_OTLP_HEADERS)
    : {},
});

// Configure metrics exporter for Prometheus (via OTLP)
const metricExporter = new OTLPMetricExporter({
  url: metricsEndpoint,
  headers: process.env.OTEL_EXPORTER_OTLP_HEADERS
    ? JSON.parse(process.env.OTEL_EXPORTER_OTLP_HEADERS)
    : {},
});

// Create metric reader with configurable interval
const metricReader = new PeriodicExportingMetricReader({
  exporter: metricExporter,
  exportIntervalMillis: parseInt(process.env.OTEL_METRIC_EXPORT_INTERVAL || '60000', 10), // 60s default
});

const sdk = new NodeSDK({
  resource,
  traceExporter,
  metricReader,
  instrumentations: [
    getNodeAutoInstrumentations({
      // HTTP instrumentation - captures all HTTP requests/responses
      '@opentelemetry/instrumentation-http': {
        enabled: true,
        ignoreIncomingRequestHook: (req) => {
          // Ignore health checks and metrics endpoints to reduce noise
          return Boolean(req.url?.includes('/metrics') || req.url?.includes('/health'));
        },
        // Capture request/response headers for debugging
        headersToSpanAttributes: {
          client: {
            requestHeaders: ['user-agent', 'x-request-id', 'x-correlation-id'],
            responseHeaders: ['content-type', 'x-cache-key'],
          },
          server: {
            requestHeaders: ['user-agent', 'x-request-id', 'x-correlation-id', 'authorization'],
            responseHeaders: ['content-type', 'x-cache-key'],
          },
        },
      },
      // Express instrumentation - captures Express routes and middleware
      '@opentelemetry/instrumentation-express': {
        enabled: true,
        requestHook: (span, requestInfo) => {
          // Add custom attributes to Express spans
          span.setAttribute('express.type', requestInfo.layerType);
        },
      },
      // IORedis instrumentation - captures Redis operations (important for your caching)
      '@opentelemetry/instrumentation-ioredis': {
        enabled: true,
        // Capture Redis commands and their arguments
        dbStatementSerializer: (cmdName, cmdArgs) => {
          return `${cmdName} ${cmdArgs.join(' ')}`;
        },
      },
      // DNS instrumentation - captures DNS lookups
      '@opentelemetry/instrumentation-dns': {
        enabled: true,
        // Ignore localhost lookups
        ignoreHostnames: ['localhost', '127.0.0.1'],
      },
      // Net instrumentation - captures TCP connections
      '@opentelemetry/instrumentation-net': {
        enabled: true,
      },
      // FS instrumentation - captures file system operations
      '@opentelemetry/instrumentation-fs': {
        enabled: process.env.OTEL_INSTRUMENTATION_FS_ENABLED === 'true',
        // Disabled by default as it can be very noisy
      },
      // Runtime Node metrics - CPU, memory, event loop, etc.
      // Re-enable if you want runtime metrics in Prometheus
      '@opentelemetry/instrumentation-runtime-node': {
        enabled: process.env.OTEL_INSTRUMENTATION_RUNTIME_ENABLED === 'true',
        // Collect runtime metrics like heap usage, event loop lag
      },
    }),
  ],
});

const startSdk = async () => {
  try {
    await sdk.start();
    console.log('✅ OpenTelemetry SDK initialized successfully');
    console.log(`📊 Service: ${resource.attributes[ATTR_SERVICE_NAME]}`);
    console.log(`🔍 Traces → ${traceEndpoint} → Tempo`);
    console.log(`📈 Metrics → ${metricsEndpoint} → Prometheus`);
    console.log(`📝 Logs → Loki (via application logger)`);
    console.log(`🏷️  Resource Attributes:`, JSON.stringify(resource.attributes, null, 2));
  } catch (err) {
    console.error('❌ OpenTelemetry SDK failed to start:', err);
  }
};

void startSdk();

const shutdown = async () => {
  try {
    await sdk.shutdown();
    console.log('✅ OpenTelemetry SDK shutdown successfully');
  } catch (err) {
    console.error('❌ OpenTelemetry SDK shutdown failed:', err);
  }
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
