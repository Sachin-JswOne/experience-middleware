import { Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { JWT_SECRET } from 'src/config/app.config';
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { BaseRequest } from 'src/models/base-request.model';
import { CustomError } from 'src/utils/CustomError';

const logger = new Logger('OfferDocumentTransformers');

const CONSENT_TARGET = 'offer-document-consent-store';
const DOCUMENTS_TARGET = 'offer-documents';
const CONSENT_STATUS_TARGET = 'offer-document-consent-status';

/**
 * Flag on the central commerce customer profile that says this customer has already
 * accepted the disclaimer. Rename here if the profile contract changes.
 */
const CONSENT_FLAG = 'isDRHPSubmitted';

/** CCS reads the caller's session from `jsw_session_id` first, then this. */
const SESSION_ID_HEADER = 'X-Session-Id';

const CONSENT_TYPE = 'OFFER_DOCUMENT_DISCLAIMER';
const CONSENT_SOURCE = 'WEB';

/** Headers a proxy/CDN may carry the originating client IP in, best first. */
const CLIENT_IP_HEADERS = [
  'x-forwarded-for',
  'x-real-ip',
  'true-client-ip',
  'cf-connecting-ip',
] as const;

type ConsentIdentity = {
  isLoggedIn: boolean;
  sfCustomerId: string | null;
  userId: string | null;
};

function headerValue(headers: Record<string, any> | undefined, name: string): string | null {
  const raw = headers?.[name] ?? headers?.[name.toLowerCase()];

  if (Array.isArray(raw)) {
    return raw[0]?.trim() || null;
  }

  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

/**
 * Strips what proxies add around an address: an `ip:port` suffix, IPv6 brackets, and the
 * `::ffff:` prefix Node puts on an IPv4 peer arriving over a dual-stack socket.
 */
function normalizeIp(value: string | null | undefined): string | null {
  let ip = String(value ?? '').trim();

  if (!ip) return null;

  // [2001:db8::1]:443 -> 2001:db8::1
  const bracketed = ip.match(/^\[(.+)\](?::\d+)?$/);
  if (bracketed) {
    ip = bracketed[1];
  } else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) {
    // 203.0.113.5:54321 -> 203.0.113.5 (only when it is unambiguously IPv4 + port)
    ip = ip.split(':')[0];
  }

  ip = ip.replace(/^::ffff:/i, '');

  // Some proxies write a literal placeholder rather than omitting the header.
  if (!ip || /^(unknown|undefined|null)$/i.test(ip)) {
    return null;
  }

  return ip;
}

/**
 * The caller's IP, in every case we can get one.
 *
 * X-Forwarded-For is a client-to-proxy chain and its first entry is the originating
 * client, which is what the GCP load balancer in front of Istio sets. A request that did
 * not come through a proxy has no such header, so the connection's own peer address is
 * used instead — a direct call still gets a real IP recorded rather than being refused.
 *
 * Nothing here is read from the request body, so the browser cannot spoof what is stored.
 */
function resolveClientIp(request: BaseRequest): string | null {
  const headers = request.headers as Record<string, any>;

  for (const header of CLIENT_IP_HEADERS) {
    const value = headerValue(headers, header);

    if (!value) continue;

    // A chain can start with a placeholder; take the first entry that is a real address.
    for (const hop of value.split(',')) {
      const normalized = normalizeIp(hop);
      if (normalized) return normalized;
    }
  }

  return normalizeIp(request.clientIp);
}

/**
 * Identity recorded on the consent, which is enrichment rather than authorization — that
 * is central commerce's job. An unverified token must never be trusted here, or anyone
 * could stamp someone else's customer id on their own consent, so a token that does not
 * verify contributes no identity even though it is still forwarded.
 */
function resolveIdentity(headers: Record<string, any> | undefined): ConsentIdentity {
  const authHeader = headerValue(headers, 'authorization') || headerValue(headers, 'access_token');

  if (!authHeader) {
    return { isLoggedIn: false, sfCustomerId: null, userId: null };
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

  try {
    if (!JWT_SECRET) {
      throw new Error('JWT_SECRET is not set');
    }

    const payload = jwt.verify(token, JWT_SECRET) as {
      sfCustomerId?: string;
      userId?: string;
    };

    return {
      isLoggedIn: true,
      sfCustomerId: payload.sfCustomerId ?? null,
      userId: payload.userId ?? null,
    };
  } catch {
    logger.warn(
      '[offer-document] Token present but not verifiable here; forwarding it for central commerce to judge and recording no identity',
    );
    return { isLoggedIn: false, sfCustomerId: null, userId: null };
  }
}

/**
 * Exactly one credential reaches central commerce.
 *
 * A caller who presents a token is a token caller, full stop: the token goes downstream as
 * `access_token` (bare, matching the customer profile route) and the shared guest key is
 * removed. Whether that token is any good is central commerce's judgement, not this
 * service's — a stale one earns a 401 the visitor can act on, which beats silently
 * recording them as an anonymous guest.
 *
 * Only a caller with no token at all is relayed as a guest under `X-API-KEY`.
 */
function buildConsentAuthHeaders(headers: Record<string, any>): Record<string, any> {
  const authHeaders = { ...headers };

  const token = headerValue(headers, 'authorization') || headerValue(headers, 'access_token') || '';
  const bareToken = token.startsWith('Bearer ') ? token.slice(7) : token;

  delete authHeaders.authorization;
  delete authHeaders.Authorization;
  delete authHeaders.access_token;

  if (bareToken) {
    authHeaders.access_token = bareToken;
    delete authHeaders['X-API-KEY'];
    delete authHeaders['x-api-key'];
  }

  return authHeaders;
}

/**
 * Geo the edge already knows about.
 *
 * Web and app reach this service through a GCP load balancer fronted by Istio, so when the
 * LB is configured with client-geo custom headers they arrive here for free. Nothing is
 * looked up over the network — an absent header simply means no location, which the
 * consent still records an IP for.
 */
function resolveEdgeLocation(headers: Record<string, any>): Record<string, any> | null {
  // GCLB sends "<country>,<region>" (and optionally city) in one header.
  const combined = headerValue(headers, 'x-client-geo-location');
  const [combinedCountry, combinedRegion, combinedCity] = (combined ?? '')
    .split(',')
    .map((part) => part.trim());

  const country =
    combinedCountry ||
    headerValue(headers, 'x-client-region') ||
    headerValue(headers, 'x-country-code') ||
    headerValue(headers, 'cf-ipcountry');
  const region = combinedRegion || headerValue(headers, 'x-client-region-subdivision');
  const city = combinedCity || headerValue(headers, 'x-client-city');

  if (!country && !region && !city) {
    return null;
  }

  return {
    source: 'edge-headers',
    country: country || null,
    region: region || null,
    city: city || null,
  };
}

/**
 * Central commerce takes `acceptedAt` as a Java LocalDateTime, which has no zone: an ISO
 * string with a trailing `Z` or an offset fails to deserialize. The browser sends UTC, so
 * the instant is preserved and only the marker is dropped.
 */
function toLocalDateTime(value: unknown): string | null {
  const date = typeof value === 'string' && value ? new Date(value) : null;

  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }

  return date
    .toISOString()
    .replace(/\.\d{3}Z$/, '')
    .replace(/Z$/, '');
}

/**
 * Browser -> CCS `POST /drhp/v1/consent` (CaptureDrhpConsentRequest).
 *
 * CCS takes four things: the version accepted, the caller's IP, an optional location and a
 * free-form `otherInfo` blob it stores verbatim. Everything this service knows about the
 * visitor that does not map to the first three goes into `otherInfo`, so nothing collected
 * is lost.
 *
 * Everything the client is allowed to assert (what it consented to, its own environment)
 * comes from the body; everything that has to be trustworthy (IP, user agent, identity) is
 * taken from the request headers.
 */
export function transformOfferDocumentConsentRequest(request: BaseRequest): BaseRequest {
  const body = request.body ?? {};
  const headers = request.headers as Record<string, any>;

  if (body.consentAccepted !== true) {
    throw new CustomError('consentAccepted must be true', 400);
  }

  if (!body.slug || typeof body.slug !== 'string') {
    throw new CustomError('slug is required', 400);
  }

  if (!body.disclaimerVersion || typeof body.disclaimerVersion !== 'string') {
    throw new CustomError('disclaimerVersion is required', 400);
  }

  // Header chain first, connection peer as the fallback — so this is set for a request
  // through the load balancer and for a direct one alike.
  const userIpAddress = resolveClientIp(request);

  // CCS rejects a consent with no IP, and rightly so. Reaching this means neither a
  // forwarding header nor a socket address was available, which should not happen over
  // TCP — fail with something actionable rather than a guaranteed 400 downstream.
  if (!userIpAddress) {
    throw new CustomError(
      'Client IP could not be determined; consent cannot be recorded without it',
      400,
    );
  }

  const identity = resolveIdentity(headers);
  const client = body.client ?? {};
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : null;

  const authHeaders = buildConsentAuthHeaders(headers);

  // CCS keys a guest consent on the session id, so sending the one the visitor already has
  // makes a re-submission update their row instead of piling up new ones.
  if (sessionId) {
    authHeaders[SESSION_ID_HEADER] = sessionId;
  }

  return {
    ...request,
    headers: authHeaders,
    body: {
      disclaimerVersion: body.disclaimerVersion,
      userIpAddress,
      // Whatever the client resolved without prompting, else whatever the edge told us.
      location: body.location ?? resolveEdgeLocation(headers),
      acceptedAt: toLocalDateTime(body.consentedAt) ?? toLocalDateTime(new Date().toISOString()),
      otherInfo: {
        consentType: CONSENT_TYPE,
        consentSource: CONSENT_SOURCE,
        documentSetSlug: body.slug,
        // The wording of the control the visitor activated, so the record shows what was
        // agreed to even after the CMS copy changes.
        consentLabel: body.consentLabel ?? null,
        receivedAt: new Date().toISOString(),
        forwardedFor: headerValue(headers, 'x-forwarded-for'),
        userAgent: headerValue(headers, 'user-agent') ?? client.userAgent ?? null,
        sessionId,
        pageUrl: body.pageUrl ?? null,
        referrer: body.referrer ?? null,
        client: {
          browser: client.browser ?? null,
          deviceType: client.deviceType ?? null,
          platform: client.platform ?? null,
          language: client.language ?? null,
          timezone: client.timezone ?? null,
          screen: client.screen ?? null,
          viewport: client.viewport ?? null,
        },
        user: {
          isLoggedIn: identity.isLoggedIn,
          sfCustomerId: identity.sfCustomerId,
          userId: identity.userId,
        },
      },
    },
  };
}

/** CCS wraps its payload as `{ status, data, error, success }` and names the row `id`. */
function extractConsentId(consentResponse: AggregatedResponse | undefined): string | number | null {
  const data = consentResponse?.data;

  return data?.data?.id ?? data?.id ?? data?.data?.consentId ?? data?.consentId ?? null;
}

/**
 * Consent stored -> release the documents. Runs as the second sequential target, so
 * reaching here at all means the consent write succeeded.
 */
export function transformOfferDocumentsRequest(
  request: BaseRequest,
  prevResponses?: AggregatedResponse[],
): BaseRequest {
  const body = request.body ?? {};
  const consentResponse = prevResponses?.find((r) => r.target === CONSENT_TARGET);

  if (!consentResponse?.success) {
    throw new CustomError(
      consentResponse?.error || 'Consent could not be recorded; documents withheld',
      consentResponse?.httpStatus || 500,
    );
  }

  return {
    ...request,
    body: {
      slug: body.slug,
      disclaimerVersion: body.disclaimerVersion,
    },
  };
}

export function pickOfferDocumentsResponse(
  aggregatedResponses: AggregatedResponse[],
): Record<string, any> {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );

  const consentResponse = responses[CONSENT_TARGET];
  const documentsResponse = responses[DOCUMENTS_TARGET];

  if (!consentResponse?.success) {
    throw new CustomError(
      consentResponse?.error || 'Consent could not be recorded',
      consentResponse?.httpStatus || 500,
    );
  }

  if (!documentsResponse?.success) {
    throw new CustomError(
      documentsResponse?.error || 'Documents could not be fetched',
      documentsResponse?.httpStatus || 500,
    );
  }

  const documentsData = documentsResponse.data?.data ?? documentsResponse.data ?? {};

  return {
    success: true,
    data: {
      consentId: extractConsentId(consentResponse),
      alreadyConsented: false,
      slug: documentsData.slug ?? null,
      title: documentsData.title ?? null,
      disclaimerVersion: documentsData.disclaimerVersion ?? null,
      documents: documentsData.documents ?? [],
    },
  };
}

function hasGivenConsent(profileResponse: AggregatedResponse | undefined): boolean {
  const data = profileResponse?.data;

  return (data?.data?.[CONSENT_FLAG] ?? data?.[CONSENT_FLAG]) === true;
}

/**
 * Returning customer path: the profile's consent flag is read server-side rather than
 * taken from the caller, so a logged-in visitor who never accepted the disclaimer is
 * refused here even if they call this route directly.
 */
export function transformConsentedOfferDocumentsRequest(
  request: BaseRequest,
  prevResponses?: AggregatedResponse[],
): BaseRequest {
  const body = request.body ?? {};
  const profileResponse = prevResponses?.find((r) => r.target === CONSENT_STATUS_TARGET);

  if (!profileResponse?.success) {
    throw new CustomError(
      profileResponse?.error || 'Could not verify consent status',
      profileResponse?.httpStatus || 401,
    );
  }

  if (!hasGivenConsent(profileResponse)) {
    throw new CustomError('Disclaimer has not been accepted by this customer', 403);
  }

  if (!body.slug || typeof body.slug !== 'string') {
    throw new CustomError('slug is required', 400);
  }

  return {
    ...request,
    body: {
      slug: body.slug,
      disclaimerVersion: body.disclaimerVersion,
    },
  };
}

export function pickConsentedOfferDocumentsResponse(
  aggregatedResponses: AggregatedResponse[],
): Record<string, any> {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );

  const profileResponse = responses[CONSENT_STATUS_TARGET];
  const documentsResponse = responses[DOCUMENTS_TARGET];

  if (!profileResponse?.success) {
    throw new CustomError(
      profileResponse?.error || 'Could not verify consent status',
      profileResponse?.httpStatus || 401,
    );
  }

  if (!hasGivenConsent(profileResponse)) {
    throw new CustomError('Disclaimer has not been accepted by this customer', 403);
  }

  if (!documentsResponse?.success) {
    throw new CustomError(
      documentsResponse?.error || 'Documents could not be fetched',
      documentsResponse?.httpStatus || 500,
    );
  }

  const documentsData = documentsResponse.data?.data ?? documentsResponse.data ?? {};

  return {
    success: true,
    data: {
      consentId: null,
      alreadyConsented: true,
      slug: documentsData.slug ?? null,
      title: documentsData.title ?? null,
      disclaimerVersion: documentsData.disclaimerVersion ?? null,
      documents: documentsData.documents ?? [],
    },
  };
}
