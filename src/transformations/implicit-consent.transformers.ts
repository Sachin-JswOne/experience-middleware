/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { BaseRequest } from 'src/models/base-request.model';
import {
  CONSENT_EVENT_NAME,
  CONSENT_REGISTRATION_SOURCE,
} from 'src/config/app.config';
import { Logger } from '@nestjs/common';
import { getFormattedTime } from 'src/utils/common-functions.util';

export function implictConsent(request: BaseRequest): BaseRequest {
  const requestBody: any = request?.body;
  Logger.log(
    `Transforming Implicit-Consent Request  ${request.url} method: implictConsent`,
  );
  const requestData = transformMsmeRegistrationPayload(requestBody);

  const consentIp = request.headers['x-forwarded-for'];

  const headers = {
    'Content-Type': 'application/json',
    'X-API-KEY': process.env.X_API_KEY_FOR_REGISTRATION,
    'consent-x-forward-for': consentIp,
  };
  const finalTransformedRequest: BaseRequest = {
    ...request,
    headers,
    body: requestData,
  };

  return finalTransformedRequest;
}

export function transformMsmeRegistrationPayload(reqData: any) {
  return {
    registeredMobile: reqData.registeredMobile,
    utmParams: {
      utmSource: reqData.utm_source ?? '',
      utmMedium: reqData.utm_medium ?? '',
      utmCampaign: reqData.utm_campaign ?? '',
      utmElement: reqData.utm_element ?? '',
      utmContent: reqData.utm_content ?? '',
      attribution: reqData.attribution ?? '',
    },
    customerConsent: {
      consentEventName: CONSENT_EVENT_NAME,
      consentRegistrationSource: CONSENT_REGISTRATION_SOURCE,
      consentTimestamp: getFormattedTime(),
      consentBrowser: reqData.deviceInfo ?? '',
      consentGeoLocation: {
        latitude: reqData.latitude ?? '',
        longitude: reqData.longitude ?? '',
      },
    },
  };
}
