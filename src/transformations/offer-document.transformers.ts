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
 * X-Forwarded-For is a client-to-proxy chain; the first entry is the originating client.
 * The header is never read from the request body, so the browser cannot spoof the IP we
 * record against a consent.
 */
function resolveClientIp(headers: Record<string, any> | undefined): string | null {
  for (const header of CLIENT_IP_HEADERS) {
    const value = headerValue(headers, header);

    if (value) {
      return value.split(',')[0]?.trim() || null;
    }
  }

  return null;
}

/**
 * Identity is optional enrichment on an otherwise anonymous consent, so a missing or
 * expired token must not fail the request — but an unverified token must never be
 * trusted either, or anyone could stamp someone else's customer id on their consent.
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
    logger.warn('[offer-document] Token present but not verifiable; recording consent as guest');
    return { isLoggedIn: false, sfCustomerId: null, userId: null };
  }
}

/**
 * Central commerce authenticates a logged-in visitor by their own token and a guest by
 * the shared API key, so exactly one of the two travels downstream. Central commerce
 * takes the token as `access_token`, matching the customer profile route.
 *
 * A token that did not verify is treated as a guest: the bogus token is dropped rather
 * than forwarded, so central commerce never has to judge it.
 */
function buildConsentAuthHeaders(
  headers: Record<string, any>,
  identity: ConsentIdentity,
): Record<string, any> {
  const authHeaders = { ...headers };

  const token = headerValue(headers, 'authorization') || headerValue(headers, 'access_token') || '';
  const bareToken = token.startsWith('Bearer ') ? token.slice(7) : token;

  delete authHeaders.authorization;
  delete authHeaders.Authorization;
  delete authHeaders.access_token;

  if (identity.isLoggedIn) {
    authHeaders.access_token = bareToken;
    // The user's own token is the credential; the guest key must not ride along with it.
    delete authHeaders['X-API-KEY'];
    delete authHeaders['x-api-key'];
  }

  return authHeaders;
}

/**
 * Browser -> consent service payload.
 *
 * Everything the client is allowed to assert (what it consented to, its own environment)
 * comes from the body; everything that has to be trustworthy (IP, user agent, identity)
 * is taken from the request headers.
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

  const identity = resolveIdentity(headers);
  const client = body.client ?? {};

  return {
    ...request,
    headers: buildConsentAuthHeaders(headers, identity),
    body: {
      consentType: CONSENT_TYPE,
      consentSource: CONSENT_SOURCE,
      documentSetSlug: body.slug,
      disclaimerVersion: body.disclaimerVersion,
      consentAccepted: true,
      // The exact checkbox wording the visitor ticked, so the record shows what was agreed
      // to even after the CMS copy changes.
      consentLabel: body.consentLabel ?? null,
      consentedAt: body.consentedAt ?? new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      // Location is derived downstream from this IP — the consent service owns the geo
      // lookup so the resolved city/region/country is stored with the record.
      ipAddress: resolveClientIp(headers),
      forwardedFor: headerValue(headers, 'x-forwarded-for'),
      userAgent: headerValue(headers, 'user-agent') ?? client.userAgent ?? null,
      sessionId: body.sessionId ?? null,
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
  };
}

function extractConsentId(consentResponse: AggregatedResponse | undefined): string | null {
  const data = consentResponse?.data;

  return data?.consentId ?? data?.data?.consentId ?? data?.id ?? data?.data?.id ?? null;
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
