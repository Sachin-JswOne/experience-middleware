/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
// src/logger/winston.config.ts
import { utilities as nestWinstonModuleUtilities } from 'nest-winston';
import {
  getFormattedTracingContext,
  getFormattedUserIdentifiersFromContext,
} from 'src/utils/tracing.util';
import * as winston from 'winston';

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
  ],
};
