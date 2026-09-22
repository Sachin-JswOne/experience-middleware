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
    it('records the originating IP from the forwarded chain, not from the body', () => {
      const request = buildRequest({ body: { ipAddress: '1.1.1.1' } as any });

      const result = transformOfferDocumentConsentRequest(request);

      expect(result.body.ipAddress).toBe('203.0.113.5');
      expect(result.body.forwardedFor).toBe('203.0.113.5, 10.0.0.1');
      expect(result.body.userAgent).toBe('Mozilla/5.0 (Macintosh) Chrome/140.0');
      expect(result.body.documentSetSlug).toBe('investor-relations-offer-documents');
      expect(result.body.disclaimerVersion).toBe('DRHP-V1');
      expect(result.body.receivedAt).toBe(fixedDate.toISOString());
    });

    it('records an anonymous visitor as a guest and keeps the shared API key', () => {
      const request = buildRequest({ headers: { 'X-API-KEY': 'guest-key' } });

      const result = transformOfferDocumentConsentRequest(request);

      expect(result.body.user).toEqual({
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

      expect(result.body.user).toEqual({
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

    it('falls back to guest and drops the token when it cannot be verified', () => {
      const forgedToken = jwt.sign({ sfCustomerId: 'SF-NOT-MINE' }, 'some-other-secret');
      const request = buildRequest({
        headers: { authorization: forgedToken, 'X-API-KEY': 'guest-key' },
      });

      const result = transformOfferDocumentConsentRequest(request);

      expect(result.body.user.isLoggedIn).toBe(false);
      expect(result.body.user.sfCustomerId).toBeNull();
      expect(result.headers.access_token).toBeUndefined();
      expect(result.headers['X-API-KEY']).toBe('guest-key');
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
        { target: 'offer-document-consent-store', success: true, data: { consentId: 'c-1' } },
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
          consentId: 'c-1',
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
