/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import { Logger } from '@nestjs/common';
import { replaceUriPrefix } from './cms.transformers';

function flattenEntry(item: any): any {
  if (!item) {
    return null;
  }
  if (item.attributes && typeof item.attributes === 'object') {
    return { id: item.id, ...item.attributes };
  }
  return item;
}

function isImageAttribute(attribute: any): boolean {
  const requiredKeys = ['alternativeText', 'caption', 'url'];
  return (
    attribute && typeof attribute === 'object' && requiredKeys.every((key) => key in attribute)
  );
}

function normalizeRelationValue(value: any): any {
  if (value == null) {
    return value;
  }

  if (value.data !== undefined) {
    if (Array.isArray(value.data)) {
      return value.data.map((item: any) => flattenEntry(item));
    }
    if (value.data?.attributes || value.data?.url) {
      return [flattenEntry(value.data)];
    }
    return [];
  }

  if (isImageAttribute(value)) {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.map((item: any) => flattenEntry(item));
  }

  return value;
}

function normalizeLegalEntry(entry: any): any {
  const flat = flattenEntry(entry);
  if (!flat) {
    return null;
  }

  if (flat.bannerImage !== undefined) {
    flat.bannerImage = normalizeRelationValue(flat.bannerImage);
  }

  return flat;
}

export function transformLegalPage(response: any): { data: any } {
  try {
    const replaced = replaceUriPrefix(response);
    const first = replaced?.data?.[0];
    return { data: normalizeLegalEntry(first) };
  } catch (error) {
    Logger.error('Error transforming legal page', error);
    return { data: null };
  }
}

function normalizeTopicEntry(topic: any): any {
  const flat = flattenEntry(topic);
  if (!flat) {
    return null;
  }
  if (flat.thumbnail !== undefined) {
    flat.thumbnail = normalizeRelationValue(flat.thumbnail);
  }
  return flat;
}

function normalizeFaqEntry(entry: any): any {
  const flat = flattenEntry(entry);
  if (!flat) {
    return null;
  }

  if (flat.images !== undefined) {
    flat.images = normalizeRelationValue(flat.images);
  }

  if (flat.topic !== undefined) {
    if (Array.isArray(flat.topic)) {
      flat.topic = flat.topic.map((topic: any) => normalizeTopicEntry(topic)).filter(Boolean);
    } else {
      const topics = normalizeRelationValue(flat.topic);
      flat.topic = Array.isArray(topics)
        ? topics.map((topic: any) => normalizeTopicEntry(topic)).filter(Boolean)
        : [];
    }
  }

  if (Array.isArray(flat.steps)) {
    flat.steps = flat.steps.map((step: any) => flattenEntry(step) ?? step);
  }

  return flat;
}

export function transformFaqsList(response: any): { data: any[] } {
  try {
    const replaced = replaceUriPrefix(response);
    const entries = replaced?.data ?? [];
    return { data: entries.map(normalizeFaqEntry).filter(Boolean) };
  } catch (error) {
    Logger.error('Error transforming FAQs list', error);
    return { data: [] };
  }
}
