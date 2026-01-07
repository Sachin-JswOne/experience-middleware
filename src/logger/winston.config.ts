// src/logger/winston.config.ts
import { utilities as nestWinstonModuleUtilities } from 'nest-winston';
import {
  getFormattedTracingContext,
  getFormattedUserIdentifiersFromContext,
} from 'src/utils/tracing.util';
import * as winston from 'winston';
import * as Sentry from '@sentry/nestjs';

const SentryWinstonTransport = Sentry.createSentryWinstonTransport(winston.transports.Stream, {
  // Only capture error and warn logs
  levels: ["error", "warn"],
});

export const winstonConfig: winston.LoggerOptions = {
  level: process.env.LOG_LEVEL ?? 'info',
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize({ all: true }),
        winston.format.timestamp(),
        nestWinstonModuleUtilities.format.nestLike('EXPERIENCE-MIDDLEWARE', {
          prettyPrint: true,
        }),
        winston.format.printf(({ level, message, timestamp }) => {
          const traceContext = getFormattedTracingContext();
          const userContext = getFormattedUserIdentifiersFromContext();
          return `[${timestamp}] ${level}: ${traceContext} ${userContext} ${message}`.trim();
        }),
      ),
    }),
    // Optional: Write logs to a file
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
    }),
    // Sentry transport for error tracking
    new SentryWinstonTransport({
      level: 'warn', // Only send warnings and errors to Sentry
      stream: process.stdout, // Required stream property
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ level, message, timestamp }) => {
          const traceContext = getFormattedTracingContext();
          const userContext = getFormattedUserIdentifiersFromContext();
          return `[${timestamp}] ${level}: ${traceContext} ${userContext} ${message}`.trim();
        }),
      ),
    }),
  ],
};
