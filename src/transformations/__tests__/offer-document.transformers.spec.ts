import * as jwt from 'jsonwebtoken';
import { JWT_SECRET } from 'src/config/app.config';
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { BaseRequest } from 'src/models/base-request.model';
import {
  pickConsentedOfferDocumentsResponse,
  pickOfferDocumentsResponse,
  transformConsentedOfferDocumentsRequest,
  transformOfferDocumentConsentRequest,
  transformOfferDocumentsRequest,
} from '../offer-document.transformers';

const fixedDate = new Date('2026-09-22T10:00:00.000Z');

function buildRequest(overrides: Partial<BaseRequest> = {}): BaseRequest {
  return {
    url: new URL('https://example.com/xp-mi/public/v1/offer-document-consent'),
    headers: {
      'x-forwarded-for': '203.0.113.5, 10.0.0.1',
      'user-agent': 'Mozilla/5.0 (Macintosh) Chrome/140.0',
      ...(overrides.headers ?? {}),
    },
    body: {
      slug: 'investor-relations-offer-documents',
      disclaimerVersion: 'DRHP-V1',
      consentAccepted: true,
      consentLabel: 'I have read and understood the disclaimer',
      consentedAt: '2026-09-22T09:59:00.000Z',
      sessionId: 'session-1',
      pageUrl: 'https://www.jswonemsme.com/corporate/investor-relations-offer-documents',
      referrer: 'https://www.jswonemsme.com/corporate',
      client: { browser: 'Chrome', deviceType: 'Desktop' },
      ...(overrides.body ?? {}),
    },
  };
}

describe('offer-document.transformers', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(fixedDate);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  describe('transformOfferDocumentConsentRequest', () => {
    it('maps onto the CCS CaptureDrhpConsentRequest shape', () => {
      const result = transformOfferDocumentConsentRequest(buildRequest());

      // CCS takes exactly these fields; anything else it would ignore.
      expect(Object.keys(result.body).sort()).toEqual([
        'acceptedAt',
        'disclaimerVersion',
        'location',
        'otherInfo',
        'userIpAddress',
      ]);
      expect(result.body.disclaimerVersion).toBe('DRHP-V1');
      expect(result.body.userIpAddress).toBe('203.0.113.5');
    });

    it('records the originating IP from the forwarded chain, not from the body', () => {
      const request = buildRequest({ body: { userIpAddress: '1.1.1.1' } as any });

      const result = transformOfferDocumentConsentRequest(request);

      // The body's own claim is ignored; the header chain wins.
      expect(result.body.userIpAddress).toBe('203.0.113.5');
      expect(result.body.otherInfo.forwardedFor).toBe('203.0.113.5, 10.0.0.1');
      expect(result.body.otherInfo.userAgent).toBe('Mozilla/5.0 (Macintosh) Chrome/140.0');
      expect(result.body.otherInfo.documentSetSlug).toBe('investor-relations-offer-documents');
      expect(result.body.otherInfo.receivedAt).toBe(fixedDate.toISOString());
    });

    it('falls back to the connection peer when no forwarding header is present', () => {
      const request = buildRequest();
      delete (request.headers as Record<string, any>)['x-forwarded-for'];
      request.clientIp = '198.51.100.7';

      expect(transformOfferDocumentConsentRequest(request).body.userIpAddress).toBe(
        '198.51.100.7',
      );
    });

    it.each([
      ['an IPv4-mapped IPv6 peer', '::ffff:198.51.100.7', '198.51.100.7'],
      ['a peer with a port', '198.51.100.7:54321', '198.51.100.7'],
      ['a bracketed IPv6 peer', '[2001:db8::1]:443', '2001:db8::1'],
      ['a loopback peer', '::1', '::1'],
    ])('normalizes %s', (_label, peer, expected) => {
      const request = buildRequest();
      delete (request.headers as Record<string, any>)['x-forwarded-for'];
      request.clientIp = peer;

      expect(transformOfferDocumentConsentRequest(request).body.userIpAddress).toBe(expected);
    });

    it('skips a placeholder hop in the forwarded chain rather than recording it', () => {
      const request = buildRequest();
      (request.headers as Record<string, any>)['x-forwarded-for'] = 'unknown, 203.0.113.9';

      expect(transformOfferDocumentConsentRequest(request).body.userIpAddress).toBe(
        '203.0.113.9',
      );
    });

    it('refuses to record a consent when even the peer address is unavailable', () => {
      const request = buildRequest();
      delete (request.headers as Record<string, any>)['x-forwarded-for'];

      expect(() => transformOfferDocumentConsentRequest(request)).toThrow(
        'Client IP could not be determined',
      );
    });

    it('sends acceptedAt as a zoneless LocalDateTime that CCS can deserialize', () => {
      const result = transformOfferDocumentConsentRequest(buildRequest());

      expect(result.body.acceptedAt).toBe('2026-09-22T09:59:00');
    });

    it('passes through a location the client already had, without asking the edge', () => {
      const location = { source: 'browser', latitude: 19.07, longitude: 72.87 };
      const request = buildRequest({ body: { location } as any });
      (request.headers as Record<string, any>)['x-client-geo-location'] = 'IN,MH,Mumbai';

      expect(transformOfferDocumentConsentRequest(request).body.location).toEqual(location);
    });

    it('falls back to the geo the edge resolved when the client has none', () => {
      const request = buildRequest();
      (request.headers as Record<string, any>)['x-client-geo-location'] = 'IN,MH,Mumbai';

      expect(transformOfferDocumentConsentRequest(request).body.location).toEqual({
        source: 'edge-headers',
        country: 'IN',
        region: 'MH',
        city: 'Mumbai',
      });
    });

    it('leaves location null when neither the client nor the edge knows one', () => {
      expect(transformOfferDocumentConsentRequest(buildRequest()).body.location).toBeNull();
    });

    it('forwards the session id as a header so a guest re-submission updates one row', () => {
      const result = transformOfferDocumentConsentRequest(buildRequest());

      expect(result.headers['X-Session-Id']).toBe('session-1');
    });

    it('records an anonymous visitor as a guest and keeps the shared API key', () => {
      const request = buildRequest({ headers: { 'X-API-KEY': 'guest-key' } });

      const result = transformOfferDocumentConsentRequest(request);

      expect(result.body.otherInfo.user).toEqual({
        isLoggedIn: false,
        sfCustomerId: null,
        userId: null,
      });
      expect(result.headers['X-API-KEY']).toBe('guest-key');
      expect(result.headers.access_token).toBeUndefined();
    });

    it('sends a logged-in visitor as access_token instead of the guest API key', () => {
      const token = jwt.sign({ sfCustomerId: 'SF-1', userId: 'CT-1' }, JWT_SECRET as string);
      const request = buildRequest({
        headers: { authorization: `Bearer ${token}`, 'X-API-KEY': 'guest-key' },
      });

      const result = transformOfferDocumentConsentRequest(request);

      expect(result.body.otherInfo.user).toEqual({
        isLoggedIn: true,
        sfCustomerId: 'SF-1',
        userId: 'CT-1',
      });
      // Central commerce reads the token from access_token, bare, and the guest key must
      // not ride along with it.
      expect(result.headers.access_token).toBe(token);
      expect(result.headers.authorization).toBeUndefined();
      expect(result.headers['X-API-KEY']).toBeUndefined();
    });

    it('still drops the guest key for a token it cannot verify, and records no identity', () => {
      const forgedToken = jwt.sign({ sfCustomerId: 'SF-NOT-MINE' }, 'some-other-secret');
      const request = buildRequest({
        headers: { authorization: forgedToken, 'X-API-KEY': 'guest-key' },
      });

      const result = transformOfferDocumentConsentRequest(request);

      // Presenting a token makes you a token caller — central commerce judges it, and a
      // bad one must not be quietly downgraded to an anonymous guest write.
      expect(result.headers.access_token).toBe(forgedToken);
      expect(result.headers['X-API-KEY']).toBeUndefined();
      // The claims are still unverified, so nothing is stamped on the record.
      expect(result.body.otherInfo.user.isLoggedIn).toBe(false);
      expect(result.body.otherInfo.user.sfCustomerId).toBeNull();
    });

    it('drops the guest key for a bare access_token header too', () => {
      const token = jwt.sign({ sfCustomerId: 'SF-2' }, JWT_SECRET as string);
      const request = buildRequest({
        headers: { access_token: token, 'X-API-KEY': 'guest-key' },
      });

      const result = transformOfferDocumentConsentRequest(request);

      expect(result.headers.access_token).toBe(token);
      expect(result.headers['X-API-KEY']).toBeUndefined();
    });

    it.each([
      ['consentAccepted is not true', { consentAccepted: false }],
      ['slug is missing', { slug: undefined }],
      ['disclaimerVersion is missing', { disclaimerVersion: undefined }],
    ])('rejects the request when %s', (_label, bodyOverride) => {
      expect(() =>
        transformOfferDocumentConsentRequest(buildRequest({ body: bodyOverride as any })),
      ).toThrow();
    });
  });

  describe('transformOfferDocumentsRequest', () => {
    it('asks the CMS for the slug once consent is stored', () => {
      const prev: AggregatedResponse[] = [
        { target: 'offer-document-consent-store', success: true, data: { consentId: 'c-1' } },
      ];

      const result = transformOfferDocumentsRequest(buildRequest(), prev);

      expect(result.body).toEqual({
        slug: 'investor-relations-offer-documents',
        disclaimerVersion: 'DRHP-V1',
      });
    });

    it('withholds the documents when the consent write failed', () => {
      const prev: AggregatedResponse[] = [
        {
          target: 'offer-document-consent-store',
          success: false,
          error: 'consent service down',
          httpStatus: 503,
        },
      ];

      expect(() => transformOfferDocumentsRequest(buildRequest(), prev)).toThrow(
        'consent service down',
      );
    });
  });

  describe('pickOfferDocumentsResponse', () => {
    it('returns the consent id alongside the released documents', () => {
      const documents = [{ id: 1, icontText: 'DRHP', pdf: { url: 'https://cdn/drhp.pdf' } }];
      const results: AggregatedResponse[] = [
        {
          target: 'offer-document-consent-store',
          success: true,
          data: { success: true, data: { id: 4211, disclaimerVersion: 'DRHP-V1' } },
        },
        {
          target: 'offer-documents',
          success: true,
          data: {
            data: {
              slug: 'investor-relations-offer-documents',
              title: 'Offer documents',
              disclaimerVersion: 'DRHP-V1',
              documents,
            },
          },
        },
      ];

      expect(pickOfferDocumentsResponse(results)).toEqual({
        success: true,
        data: {
          consentId: 4211,
          alreadyConsented: false,
          slug: 'investor-relations-offer-documents',
          title: 'Offer documents',
          disclaimerVersion: 'DRHP-V1',
          documents,
        },
      });
    });

    it('fails the whole call when the CMS refuses to release the documents', () => {
      const results: AggregatedResponse[] = [
        { target: 'offer-document-consent-store', success: true, data: { consentId: 'c-1' } },
        {
          target: 'offer-documents',
          success: false,
          error: 'Invalid API key',
          httpStatus: 401,
        },
      ];

      expect(() => pickOfferDocumentsResponse(results)).toThrow('Invalid API key');
    });
  });

  describe('transformConsentedOfferDocumentsRequest', () => {
    const profileTarget = 'offer-document-consent-status';

    it('releases the documents when the profile says consent was given', () => {
      const prev: AggregatedResponse[] = [
        { target: profileTarget, success: true, data: { data: { isDRHPSubmitted: true } } },
      ];

      const result = transformConsentedOfferDocumentsRequest(buildRequest(), prev);

      expect(result.body).toEqual({
        slug: 'investor-relations-offer-documents',
        disclaimerVersion: 'DRHP-V1',
      });
    });

    it.each([
      ['the flag is false', { data: { isDRHPSubmitted: false } }],
      ['the flag is absent', { data: {} }],
    ])('refuses a logged-in customer when %s', (_label, profileData) => {
      const prev: AggregatedResponse[] = [
        { target: profileTarget, success: true, data: profileData },
      ];

      expect(() => transformConsentedOfferDocumentsRequest(buildRequest(), prev)).toThrow(
        'Disclaimer has not been accepted by this customer',
      );
    });

    it('refuses when the profile could not be read at all', () => {
      const prev: AggregatedResponse[] = [
        { target: profileTarget, success: false, error: 'Unauthorized', httpStatus: 401 },
      ];

      expect(() => transformConsentedOfferDocumentsRequest(buildRequest(), prev)).toThrow(
        'Unauthorized',
      );
    });
  });

  describe('pickConsentedOfferDocumentsResponse', () => {
    it('marks the response as an existing consent', () => {
      const documents = [{ id: 1, icontText: 'DRHP' }];
      const results: AggregatedResponse[] = [
        {
          target: 'offer-document-consent-status',
          success: true,
          data: { data: { isDRHPSubmitted: true } },
        },
        {
          target: 'offer-documents',
          success: true,
          data: { data: { slug: 'investor-relations-offer-documents', documents } },
        },
      ];

      const result = pickConsentedOfferDocumentsResponse(results);

      expect(result.data.alreadyConsented).toBe(true);
      expect(result.data.consentId).toBeNull();
      expect(result.data.documents).toEqual(documents);
    });

    it('does not hand over documents when the flag is not set', () => {
      const results: AggregatedResponse[] = [
        {
          target: 'offer-document-consent-status',
          success: true,
          data: { data: { isDRHPSubmitted: false } },
        },
        { target: 'offer-documents', success: true, data: { data: { documents: [{ id: 1 }] } } },
      ];

      expect(() => pickConsentedOfferDocumentsResponse(results)).toThrow(
        'Disclaimer has not been accepted by this customer',
      );
    });
  });
});
