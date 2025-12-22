import { BaseRequest } from 'src/models/base-request.model';
import { CONSENT_EVENT_NAME, CONSENT_REGISTRATION_SOURCE } from 'src/config/app.config';
import { implictConsent, transformMsmeRegistrationPayload } from '../implicit-consent.transformers';

const fixedDate = new Date('2024-05-01T12:34:56Z');
const originalApiKey = process.env.X_API_KEY_FOR_REGISTRATION;

describe('implicit-consent.transformers', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(fixedDate);
  });

  afterAll(() => {
    jest.useRealTimers();
    process.env.X_API_KEY_FOR_REGISTRATION = originalApiKey;
  });

  describe('implictConsent', () => {
    it('transforms the request body and sets consent headers', () => {
      process.env.X_API_KEY_FOR_REGISTRATION = 'test-api-key';

      const requestBody = {
        registeredMobile: '9876543210',
        utm_source: 'google',
        utm_medium: 'cpc',
        utm_campaign: 'launch',
        utm_element: 'banner',
        utm_content: 'hero',
        attribution: 'crm',
        deviceInfo: 'Chrome',
        latitude: '19.0760',
        longitude: '72.8777',
      };

      const baseRequest: BaseRequest = {
        url: new URL('https://example.com/implicit-consent'),
        headers: {
          'x-forwarded-for': '203.0.113.5',
          'some-header': 'value',
        },
        body: requestBody,
      };

      const result = implictConsent(baseRequest);

      expect(result.body).toEqual({
        registeredMobile: '9876543210',
        utmParams: {
          utmSource: 'google',
          utmMedium: 'cpc',
          utmCampaign: 'launch',
          utmElement: 'banner',
          utmContent: 'hero',
          attribution: 'crm',
        },
        customerConsent: {
          consentEventName: CONSENT_EVENT_NAME,
          consentRegistrationSource: CONSENT_REGISTRATION_SOURCE,
          consentTimestamp: '2024-05-01 12:34:56',
          consentBrowser: 'Chrome',
          consentGeoLocation: {
            latitude: '19.0760',
            longitude: '72.8777',
          },
        },
      });

      expect(result.headers).toEqual({
        'Content-Type': 'application/json',
        'X-API-KEY': 'test-api-key',
        'consent-x-forward-for': '203.0.113.5',
      });

      expect(result.url).toBe(baseRequest.url);
    });
  });

  describe('transformMsmeRegistrationPayload', () => {
    it('maps provided data into the consent payload', () => {
      const requestData = {
        registeredMobile: '9999999999',
        utm_source: 'linkedin',
        utm_medium: 'email',
        utm_campaign: 'winter',
        utm_element: 'cta',
        utm_content: 'primary',
        attribution: 'retargeting',
        deviceInfo: 'Edge',
        latitude: '12.9716',
        longitude: '77.5946',
      };

      const result = transformMsmeRegistrationPayload(requestData);

      expect(result).toEqual({
        registeredMobile: '9999999999',
        utmParams: {
          utmSource: 'linkedin',
          utmMedium: 'email',
          utmCampaign: 'winter',
          utmElement: 'cta',
          utmContent: 'primary',
          attribution: 'retargeting',
        },
        customerConsent: {
          consentEventName: CONSENT_EVENT_NAME,
          consentRegistrationSource: CONSENT_REGISTRATION_SOURCE,
          consentTimestamp: '2024-05-01 12:34:56',
          consentBrowser: 'Edge',
          consentGeoLocation: {
            latitude: '12.9716',
            longitude: '77.5946',
          },
        },
      });
    });

    it('defaults optional fields when request data is missing values', () => {
      const result = transformMsmeRegistrationPayload({
        registeredMobile: '8888888888',
      });

      expect(result).toEqual({
        registeredMobile: '8888888888',
        utmParams: {
          utmSource: '',
          utmMedium: '',
          utmCampaign: '',
          utmElement: '',
          utmContent: '',
          attribution: '',
        },
        customerConsent: {
          consentEventName: CONSENT_EVENT_NAME,
          consentRegistrationSource: CONSENT_REGISTRATION_SOURCE,
          consentTimestamp: '2024-05-01 12:34:56',
          consentBrowser: '',
          consentGeoLocation: {
            latitude: '',
            longitude: '',
          },
        },
      });
    });
  });
});
