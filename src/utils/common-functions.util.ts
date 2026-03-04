/* eslint-disable @typescript-eslint/no-unused-vars */

import * as jwt from 'jsonwebtoken';
import { GUEST, GUEST_USER_STATE } from 'src/config/app.config';

export function formatDate(opportunityCreatedDate: string) {
  const date: Date = new Date(opportunityCreatedDate);

  const formattedDate = `${new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: '2-digit',
    year: 'numeric',
  }).format(date)}`;

  return formattedDate;
}

export function toTitleCase(str: string): string {
  const withSpaces = str.replace(/([a-z])([A-Z])/g, '$1 $2');

  return withSpaces
    .split(/[\s_]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function convertToDouble(strNumber) {
  const convertedNumber = strNumber.replace(/,/g, '');

  const doubleNumber = parseFloat(convertedNumber);

  return doubleNumber;
}

export function getFormattedTime(): string {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  };

  const formatter = new Intl.DateTimeFormat('en-US', options);
  const parts = formatter.formatToParts(now);

  const partMap = parts.reduce(
    (acc, part) => {
      acc[part.type] = part.value;
      return acc;
    },
    {} as Record<Intl.DateTimeFormatPartTypes, string>,
  );

  const timestamp = `${partMap.year}-${partMap.month}-${partMap.day} ${partMap.hour}:${partMap.minute}:${partMap.second}`;
  return timestamp;
}

export function getUserIdentifiers(headers: any): {
  sfId: string | null;
  ctId: string | null;
} {
  const authHeader = headers?.authorization;
  if (!authHeader) {
    const userState = headers['x-user-state'];
    if (userState && userState === GUEST_USER_STATE) {
      return { sfId: GUEST, ctId: GUEST };
    }
    return { sfId: null, ctId: null };
  }

  try {
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;

    const decoded = jwt.decode(token) as {
      sfCustomerId?: string;
      userId?: string;
    } | null;

    return {
      sfId: decoded?.sfCustomerId ?? null,
      ctId: decoded?.userId ?? null,
    };
  } catch (err) {
    return { sfId: null, ctId: null };
  }
}

export const safeDebug = (logger, msgFn) => {
  if (process.env.LOG_LEVEL === 'debug') {
    logger.debug(msgFn());
  }
};

export const safeToLog = (value: unknown): string => {
  if (value !== null && typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '[Unserializable Object]';
    }
  }
  return String(value);
};
