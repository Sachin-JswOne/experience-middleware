import * as Sentry from "@sentry/nestjs";
const { nodeProfilingIntegration } = require("@sentry/profiling-node");
// Ensure to call this before requiring any other modules!
Sentry.init({
  dsn: "https://75b713fcce8f606106f92cfcfca07680@o4510521158860800.ingest.de.sentry.io/4510584268718160",
  integrations: [
    // Add our Profiling integration
    nodeProfilingIntegration(),
  ],
  tracesSampleRate: 1.0,
  profilesSampleRate: 1.0,
  enableLogs: true,
});