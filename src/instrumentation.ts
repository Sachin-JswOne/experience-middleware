import * as Sentry from "@sentry/nestjs";
const { nodeProfilingIntegration } = require("@sentry/profiling-node");

// Ensure to call this before requiring any other modules!
Sentry.init({
  dsn: "https://75b713fcce8f606106f92cfcfca07680@o4510521158860800.ingest.de.sentry.io/4510584268718160",

  integrations: [
    // Profiling integration for CPU profiling
    nodeProfilingIntegration(),

    // HTTP integration for automatic HTTP request instrumentation
    Sentry.httpIntegration(),

    // Express integration for Express.js middleware tracking
    Sentry.expressIntegration(),

    // NestJS integration for framework-specific instrumentation
    Sentry.nestIntegration(),

    // Redis integration for cache monitoring (if using ioredis)
    Sentry.redisIntegration(),

    // Spotlight integration for local debugging (only in dev/qa)
    ...(process.env.NODE_ENV !== 'production' ? [Sentry.spotlightIntegration()] : []),
  ],

  // Performance Monitoring
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0, // 10% in prod, 100% in dev/qa
  profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0, // 10% in prod, 100% in dev/qa

  // Enable logging
  enableLogs: true,

  // Environment
  environment: process.env.NODE_ENV || "qa",

  // Release tracking (optional - helps track which version has issues)
  release: process.env.RELEASE_VERSION || "1.0",

  // Ignore certain errors
  ignoreErrors: [
    // Browser errors that don't apply to backend
    'Non-Error promise rejection captured',
    // Add other errors to ignore
  ],

  // Before send hook for filtering/modifying events
  beforeSend(event, hint) {
    // Don't send events for health check endpoints
    if (event.request?.url?.includes('/health')) {
      return null;
    }
    return event;
  },

  // Before send transaction hook for filtering transactions
  beforeSendTransaction(event) {
    // Don't track health check transactions
    if (event.transaction?.includes('/health')) {
      return null;
    }
    return event;
  },
});