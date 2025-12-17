import { BaseRequest } from 'src/models/base-request.model';
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { CustomError } from 'src/utils/CustomError';
import { HttpStatus, Logger } from '@nestjs/common';
import { safeDebug } from 'src/utils/common-functions.util';

const TARGET_NAMES = {
  GOOGLE_GEOCODE: 'google-geocode',
  JSW_LOCALITY_DATA: 'jsw-locality-data',
} as const;

const DEFAULT_PINCODE = '400098';

interface AddressComponent {
  long_name: string;
  types: string[];
}

interface GeocodeResult {
  address_components: AddressComponent[];
}

interface GoogleGeocodeResponse {
  status: string;
  results: GeocodeResult[];
}

function extractPincodeFromGeocodeResponse(geocodeData: GoogleGeocodeResponse): string | undefined {
  if (geocodeData?.status !== 'OK' || !geocodeData.results) {
    return undefined;
  }

  const pincodeComponent = geocodeData.results
    .flatMap((result) => result.address_components || [])
    .find((component) => component.types?.includes('postal_code'));

  const pincode = pincodeComponent?.long_name;
  safeDebug(
    Logger,
    () =>
      `Extracted pincode from Google Maps Geocoding API response from method: extractPincodeFromGeocodeResponse : ${JSON.stringify(
        pincode,
      )}`,
  );
  return pincode;
}

function getValidatedGeocodeData(
  aggregatedResponses: AggregatedResponse[],
  requestUrl: URL,
): GoogleGeocodeResponse {
  const geocodeResponse = aggregatedResponses.find((r) => r.target === TARGET_NAMES.GOOGLE_GEOCODE);

  if (!geocodeResponse || !geocodeResponse.success) {
    Logger.error(
      `Error for ${requestUrl} method: Google Maps Geocoding API call failed or response not found.`,
    );
    throw new CustomError(
      'Google Maps Geocoding API call failed or response not found',
      HttpStatus.BAD_REQUEST,
    );
  }

  const geocodeData = geocodeResponse.data as unknown as GoogleGeocodeResponse;

  safeDebug(
    Logger,
    () =>
      `Google Maps Geocoding API response from method: getValidatedGeocodeData : ${JSON.stringify(
        geocodeData,
      )}`,
  );

  if (geocodeData?.status !== 'OK') {
    Logger.error(
      `Error for ${requestUrl} method: Google Maps API returned status: ${geocodeData?.status || 'UNKNOWN'}`,
    );
    throw new CustomError(
      `Google Maps API error: ${geocodeData?.status || 'UNKNOWN'}`,
      HttpStatus.BAD_REQUEST,
    );
  }

  return geocodeData;
}

export function getLocalityDataRequest(
  request: BaseRequest,
  prevResponses?: AggregatedResponse[],
): BaseRequest {
  if (!prevResponses || prevResponses.length === 0) {
    Logger.error(
      `Error for ${request.url} method: getLocalityDataRequest - No previous responses available.`,
    );
    throw new CustomError('No previous API responses available', HttpStatus.BAD_REQUEST);
  }

  const geocodeData = getValidatedGeocodeData(prevResponses, request.url);
  const pincode = extractPincodeFromGeocodeResponse(geocodeData);

  if (!pincode) {
    Logger.error(
      `Error for ${request.url} method: getLocalityDataRequest - Pincode not found in Google Maps Geocoding API response.`,
    );
    throw new CustomError('Pincode not found in geocoding response', HttpStatus.BAD_REQUEST);
  }

  const url = new URL(request.url.href);
  url.searchParams.set('pincode', pincode);

  return {
    ...request,
    url,
    body: null,
  };
}

export function transformCustomerLocationResponse(
  aggregatedResponses: AggregatedResponse[],
): unknown {
  const geocodeResponse = aggregatedResponses.find((r) => r.target === TARGET_NAMES.GOOGLE_GEOCODE);

  if (!geocodeResponse || !geocodeResponse.success) {
    Logger.error(
      `Error in transformCustomerLocationResponse: Google Maps API failed, preventing locality data API call. Error: ${geocodeResponse?.error || 'Unknown error'}`,
    );
    throw new CustomError(
      geocodeResponse?.error || 'Google Maps API failed, unable to get locality data',
      geocodeResponse?.httpStatus || HttpStatus.BAD_REQUEST,
    );
  }

  const localityResponse = aggregatedResponses.find(
    (r) => r.target === TARGET_NAMES.JSW_LOCALITY_DATA,
  );

  if (!localityResponse) {
    const availableTargets = aggregatedResponses.map((r) => r.target);
    Logger.error(
      `Error in transformCustomerLocationResponse: Locality data response not found. Available targets: ${JSON.stringify(availableTargets)}`,
    );
    throw new CustomError('Locality data response not found', HttpStatus.INTERNAL_SERVER_ERROR);
  }

  if (!localityResponse.success) {
    Logger.error(
      `Error in transformCustomerLocationResponse: ${localityResponse.error || 'Unknown error'}`,
    );
    throw new CustomError(
      localityResponse.error || 'Failed to get locality data',
      localityResponse.httpStatus || HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  const geocodeData = geocodeResponse.data as unknown as GoogleGeocodeResponse;
  const pincode = extractPincodeFromGeocodeResponse(geocodeData);

  safeDebug(
    Logger,
    () =>
      `Locality data response from method: transformCustomerLocationResponse : ${JSON.stringify(
        localityResponse.data,
      )}`,
  );

  const finalResponse = {
    ...(localityResponse.data as Record<string, unknown>),
    pinCode: pincode,
  };

  safeDebug(
    Logger,
    () =>
      `Final response from method: transformCustomerLocationResponse : ${JSON.stringify(
        finalResponse,
      )}`,
  );

  return finalResponse;
}

export function addGoogleMapsApiKeyRequest(request: BaseRequest): BaseRequest {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    Logger.error(
      `Error for ${request.url} method: addGoogleMapsApiKeyRequest - GOOGLE_MAPS_API_KEY environment variable is not set.`,
    );
    throw new CustomError('Google Maps API key not configured', HttpStatus.INTERNAL_SERVER_ERROR);
  }

  const requestBody = request.body as Record<string, unknown> | null;
  const latlng = requestBody?.latlng as string | undefined;

  if (!latlng || typeof latlng !== 'string' || latlng.trim() === '') {
    Logger.error(
      `Error for ${request.url} method: addGoogleMapsApiKeyRequest - 'latlng' is required in request body and must be a non-empty string.`,
    );
    throw new CustomError(
      "'latlng' is required in request body and must be a non-empty string",
      HttpStatus.BAD_REQUEST,
    );
  }

  const url = new URL(request.url.href);
  url.searchParams.set('latlng', latlng.trim());
  url.searchParams.set('key', apiKey);

  return {
    ...request,
    url,
    body: null,
  };
}

export function addDefaultPincodeRequest(request: BaseRequest): BaseRequest {
  const url = new URL(request.url.href);
  url.searchParams.set('pincode', DEFAULT_PINCODE);

  return {
    ...request,
    url,
    body: null,
  };
}

export function addDefaultPincodeToResponse(response: unknown): unknown {
  return {
    ...(response as Record<string, unknown>),
    pinCode: DEFAULT_PINCODE,
  };
}
