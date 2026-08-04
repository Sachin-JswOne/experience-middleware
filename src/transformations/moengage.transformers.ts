import { BaseRequest } from 'src/models/base-request.model';
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

// India Standard Time is a fixed UTC+05:30 — no daylight saving to account for.
const IST_OFFSET_MINUTES = 330;
// Same offset in seconds (19800), the unit MoEngage's `user_timezone_offset` wants.
const IST_OFFSET_SECONDS = IST_OFFSET_MINUTES * 60;

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

/**
 * Same instant as `iso`, as IST wall-clock with NO "Z" suffix
 * (e.g. "2026-08-04T21:08:11.000").
 *
 * This is what `user_time` wants: MoEngage treats it as the user's LOCAL time and
 * renders it verbatim as "Event Time", without converting. Sending UTC there is what
 * made Event Time read 03:38 pm while every other timestamp read 09:08 pm. Format
 * per MoEngage support (Jahnavi): IST value, no Z, paired with
 * `user_timezone_offset` and a UTC `current_time`.
 */
function toIstLocal(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  // India has no DST, so a fixed +05:30 is always correct. Drop only the "Z".
  return new Date(ms + IST_OFFSET_MINUTES * 60_000).toISOString().slice(0, 23);
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

  const attributes = buildAttributes(body);
  // Sent as plain UTC on purpose. MoEngage IGNORES an explicit offset on datetime
  // attributes — it reads the literal wall-clock as UTC and then renders it in the
  // workspace timezone. Sending "...+05:30" therefore double-shifts (21:08 IST was
  // displayed as 02:38 next day); sending UTC makes the dashboard show IST correctly.
  attributes.modified_time = isoTime;

  const moengageBody = {
    type: 'event',
    customer_id: customerId !== undefined ? String(customerId).trim() : '',
    actions: [
      {
        action,
        attributes,
        // Reserved MoEngage field: must be one of ANDROID/iOS/web/TV/unknown.
        platform: 'web',
        // MoEngage's documented split: user_time = the user's LOCAL time (rendered
        // verbatim as "Event Time"), current_time = the same instant in UTC, and
        // user_timezone_offset tells them which zone the local value is in. Sending
        // IST local makes Event Time agree with modified_time and Event Received Time.
        user_time: toIstLocal(isoTime),
        current_time: isoTime,
        user_timezone_offset: IST_OFFSET_SECONDS,
      },
    ],
  };

  // URL (`${MOENGAGE_DATA_API_URL}`, workspace id in the path) and the Basic auth
  // header (`${MOENGAGE_HUBSPOT_AUTH}`) come from the route's target config, which
  // resolves them per environment from `assets/{env}/env-config.json`. Only the
  // body shape is this transformer's concern.
  return { ...request, body: moengageBody };
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
