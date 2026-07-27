import { BaseRequest } from 'src/models/base-request.model';
import { MOENGAGE_HUBSPOT } from 'src/config/moengage.config';
import { CustomError } from 'src/utils/CustomError';

/**
 * HubSpot -> MoEngage event transformer (single generic endpoint).
 *
 * HubSpot's native webhook action can only build a FLAT body. MoEngage's Data
 * API ("Track Event") expects a NESTED payload:
 *
 *   {
 *     "type": "event",
 *     "customer_id": "abc@example.com",        // email — the identity anchor
 *     "actions": [
 *       {
 *         "action": "Lead Created",             // the event name (from $.event_name)
 *         "attributes": { ... },                // event properties
 *         "platform": "web",
 *         "user_time": "2026-07-26T10:15:00Z",  // ISO-8601
 *         "current_time": "2026-07-26T10:15:00Z"
 *       }
 *     ]
 *   }
 *
 * This is the endpoint verified to actually STORE events (the
 * `/partner/hubspot-crm/...` connector 200s but does not persist).
 *
 * ONE generic route handles ALL event types. HubSpot decides which event this is
 * by sending an **`event_name`** field (a string, e.g. "Payment Update"). The
 * transformer uses that as the MoEngage `action`, sets `customer_id` from the
 * email, normalises the timestamp to ISO-8601, and folds every remaining flat
 * field into `attributes`.
 */

// Flat fields that identify the lead — used as customer_id, never as attributes.
const CUSTOMER_ID_KEYS = ['customer_id', 'email', 'u_em'];

// Flat fields that may carry the event timestamp (first valid one wins).
const TIMESTAMP_KEYS = ['modified_time', 'user_time', 'current_time', 'timestamp'];

// Flat fields never echoed into attributes (identity / envelope / timestamps).
const RESERVED_KEYS = new Set([
  ...CUSTOMER_ID_KEYS,
  ...TIMESTAMP_KEYS,
  'type',
  'action',
  'event_name',
]);

function firstNonEmpty(obj: Record<string, any>, keys: string[]): any {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== null && value !== undefined && String(value).trim() !== '') return value;
  }
  return undefined;
}

/**
 * Resolve the event time as an ISO-8601 string.
 *
 * Checker behaviour: accept whatever HubSpot sends — an ISO-8601 string, or an
 * epoch value in seconds or milliseconds — and normalise it. If nothing valid is
 * present, stamp "now" in the middleware so the event always carries a time.
 */
function resolveIsoTimestamp(body: Record<string, any>): string {
  const raw = firstNonEmpty(body, TIMESTAMP_KEYS);
  const iso = raw === undefined ? null : toIso(raw);
  return iso ?? new Date().toISOString();
}

function toIso(raw: any): string | null {
  // Numeric epoch (as a number or an all-digits string).
  if (typeof raw === 'number' || /^\d+$/.test(String(raw))) {
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    const ms = n >= 1e12 ? n : n * 1000; // < 1e12 => seconds
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  // ISO-8601 (or any Date-parseable) text string.
  const ms = Date.parse(String(raw));
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function buildAttributes(body: Record<string, any>): Record<string, any> {
  const attributes: Record<string, any> = {};
  for (const [key, value] of Object.entries(body || {})) {
    if (RESERVED_KEYS.has(key)) continue;
    if (value === null || value === undefined || value === '') continue;
    attributes[key] = value;
  }
  // Custom source marker (distinct from the reserved action-level `platform`).
  attributes.platform = attributes.platform ?? 'HubSpot';
  return attributes;
}

/** Shared builder: flat HubSpot body -> nested MoEngage Data API event request. */
function buildMoengageEventRequest(request: BaseRequest, action: string): BaseRequest {
  const body = (request.body || {}) as Record<string, any>;

  const customerId = firstNonEmpty(body, CUSTOMER_ID_KEYS);
  const isoTime = resolveIsoTimestamp(body);

  const moengageBody = {
    type: 'event',
    customer_id: customerId !== undefined ? String(customerId).trim() : '',
    actions: [
      {
        action,
        attributes: buildAttributes(body),
        // Reserved MoEngage field: must be one of ANDROID/iOS/web/TV/unknown.
        platform: 'web',
        user_time: isoTime, // local time of the event (ISO-8601)
        current_time: isoTime, // UTC time of the event (ISO-8601)
      },
    ],
  };

  // The Data API URL carries the workspace id in its path (no query string), so
  // we simply point the request at it. (The proxy clears the route-config target
  // URL's query before this transform runs, which is fine — there is none here.)
  const url = new URL(MOENGAGE_HUBSPOT.dataApiUrl);

  const headers: Record<string, any> = {
    'content-type': 'application/json',
    accept: 'application/json',
  };
  if (MOENGAGE_HUBSPOT.authHeader) headers.authorization = MOENGAGE_HUBSPOT.authHeader;

  return { ...request, url, body: moengageBody, headers };
}

/**
 * Single generic entry point. The event type comes from the flat `event_name`
 * field sent by HubSpot (always a string, e.g. "Lead Created", "Payment Update").
 * If it is missing/empty we reject with 400 rather than store an unnamed event.
 */
export function hubspotEventToMoengage(request: BaseRequest): BaseRequest {
  const body = (request.body || {}) as Record<string, any>;
  const action = firstNonEmpty(body, ['event_name']);

  if (action === undefined) {
    throw new CustomError(
      "Missing required field 'event_name' (the event type as a string, e.g. 'Payment Update').",
      400,
    );
  }

  return buildMoengageEventRequest(request, String(action).trim());
}
