import { CONSENT_EVENT_NAME, CONSENT_REGISTRATION_SOURCE, CONSTRUCT } from 'src/config/app.config';
import { HttpStatus, Logger } from '@nestjs/common';
import { CustomError, extractErrorMessage } from 'src/utils/CustomError';
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { safeDebug } from 'src/utils/common-functions.util';
import { inspect } from 'util';
import { validateSellerData } from './login.transformers';

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
    throw new CustomError(
      extractErrorMessage(response.error),
      response?.error?.code || HttpStatus.BAD_REQUEST,
    );
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

export function transformFetchAccessTokenRequest(
  request: any,
  aggregatedResponses: AggregatedResponse[],
): any {
  try {
    const responses = aggregatedResponses.reduce(
      (acc, response) => {
        acc[response.target] = response;
        return acc;
      },
      {} as Record<string, AggregatedResponse>,
    );
    const registerUserResponse = responses['register-user'];
    if (registerUserResponse && !registerUserResponse.error) {
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
  } catch (error) {
    Logger.error('Error transforming fetch access token request:', error);
    throw new CustomError('Something went wrong. Please try again later.', HttpStatus.BAD_REQUEST);
  }
}

export function mergeRegisterUserAndAccessTokenResponse(
  aggregatedResponses: AggregatedResponse[],
): any {
  try {
    const responses = aggregatedResponses.reduce(
      (acc, response) => {
        acc[response.target] = response;
        return acc;
      },
      {} as Record<string, AggregatedResponse>,
    );
    const registerUserResponse = responses['register-user'];
    if (registerUserResponse && !registerUserResponse.success) {
      safeDebug(
        Logger,
        () => `Register user API failed with response: ${inspect(registerUserResponse)}`,
      );
      throw new CustomError(
        registerUserResponse?.error || 'Something went wrong. Please try again later.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const accessToken = responses['fetch-access-token'];
    if (accessToken?.error) {
      safeDebug(Logger, () => `Access token fetch failed with response: ${inspect(accessToken)}`);
      throw new CustomError(
        accessToken?.error || 'Failed to fetch access token',
        accessToken?.httpStatus ? accessToken?.httpStatus : HttpStatus.BAD_REQUEST,
      );
    }
    return accessToken?.data;
  } catch (error) {
    Logger.error('Error merging register user and access token response:', error);
    throw new CustomError('Something went wrong. Please try again later.', HttpStatus.BAD_REQUEST);
  }
}
