import { CONSENT_EVENT_NAME, CONSENT_REGISTRATION_SOURCE, CONSTRUCT } from 'src/config/app.config';
import { HttpStatus, Logger } from '@nestjs/common';
import { CustomError } from 'src/utils/CustomError';
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { safeDebug } from 'src/utils/common-functions.util';
import { inspect } from 'util';

export function transformRegisterUserRequest(request: any): any {
  safeDebug(Logger, () => `Original Register User Request: ${inspect(request)}`);
  const transformedRequest = {
    ...request,
    body: {
      fullName: request.body.name,
      email: request.body.emailId,
      gstin: request.body.gstin,
      password: Buffer.from(request.body.password).toString('base64'),
      phoneNumber: request.body.mobileNumber,
      isPhoneVerified: true,
      storeKey: CONSTRUCT,
      utmSource: request.body.utm_source ?? '',
      utmMedium: request.body.utm_medium ?? '',
      utmCampaign: request.body.utm_campaign ?? '',
      utmElement: request.body.utm_element ?? '',
      utmContent: request.body.utm_content ?? '',
      consentApp: request.body.consentApp ?? false,
      customerConsent: {
        consentEventName: CONSENT_EVENT_NAME,
        consentRegistrationSource: CONSENT_REGISTRATION_SOURCE,
        consentTimestamp: new Date().toISOString(),
        consentBrowser: request.body.deviceInfo ?? null,
        consentGeoLocation: getGeoLocation(request.body.latitude, request.body.longitude),
      },
    },
    headers: {
      ...request.headers,
      'consent-required-app': request.body.consentApp,
    },
  };

  safeDebug(Logger, () => `Transformed Register User Request: ${inspect(transformedRequest)}`);
  return transformedRequest;
}

function getGeoLocation(latitude: string, longitude: string) {
  if (latitude && longitude) {
    return { latitude, longitude };
  }
  return null;
}

export function transformRegisterUserResponse(response: any): any {
  safeDebug(Logger, () => `Original Register User Response: ${inspect(response)}`);
  if (response && response.error) {
    Logger.error('Error occurred while registering user:', response.error);
    throw new CustomError(response.error.message, HttpStatus.BAD_REQUEST);
  }
  if (response && response.success) {
    const validationResult = validateSellerData(response.data);
    if (!validationResult.isValid) {
      Logger.error('Invalid seller data received in response:', validationResult.errorMessage);
      throw new CustomError(
        'Something went wrong. Please try again later.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (response.data.customerSource === '' || !response.data.customerSource) {
      Logger.error('Customer source is missing in response data');
      throw new CustomError(
        'Something went wrong. Please try again later.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return { registerUserData: response.data };
  }
}

export function validateSellerData(data) {
  const requiredFields = ['sfId', 'ctId', 'billingAddress'];

  for (const field of requiredFields) {
    if (
      !Object.prototype.hasOwnProperty.call(data, field) ||
      data[field] === undefined ||
      data[field] === null ||
      data[field] === ''
    ) {
      safeDebug(Logger, () => `Validation failed for field: ${field}, value: ${data[field]}`);
      return {
        isValid: false,
        errorMessage: `Field ${field} is missing or empty.`,
      };
    }
  }
  return { isValid: true };
}

export function transformFetchAccessTokenRequest(
  request: any,
  aggregatedResponses: AggregatedResponse[],
): any {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );

  const registerUserResponse = responses['register-user'];
  if (registerUserResponse) {
    const transformedRequest = {
      ...request,
      body: {
        email: request?.body?.emailId,
        phoneNumber: request?.body?.mobileNumber,
        password: Buffer.from(request.body.password).toString('base64'),
        storeKey: CONSTRUCT,
      },
    };
    safeDebug(
      Logger,
      () => `Transformed Fetch Access Token Request: ${inspect(transformedRequest)}`,
    );
    return transformedRequest;
  }
}

export function mergeRegisterUserAndAccessTokenResponse(
  aggregatedResponses: AggregatedResponse[],
): any {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );
  const accessToken = responses['fetch-access-token'];

  if (!accessToken?.success) {
    safeDebug(Logger, () => `Access token fetch failed with response: ${inspect(accessToken)}`);
    Logger.error('Failed to fetch access token', accessToken?.error);
    throw new CustomError(
      accessToken?.error || 'Failed to fetch access token',
      accessToken?.httpStatus ? accessToken?.httpStatus : HttpStatus.BAD_REQUEST,
    );
  }
  return accessToken?.data;
}
