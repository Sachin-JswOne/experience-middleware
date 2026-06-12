import 'dotenv/config';
import { BaseRequest } from 'src/models/base-request.model';

export function transformAccessTokenRequest(request: BaseRequest): BaseRequest {
  if (
    !process.env.SF_SALES_APP_CLIENT_ID ||
    !process.env.SF_SALES_APP_CLIENT_SECRET ||
    !process.env.SF_SALES_APP_REDIRECT_URI
  ) {
    throw new Error('Missing Salesforce OAuth configuration');
  }

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code: String(request.body.code),
    code_verifier: String(request.body.code_verifier),
    client_id: process.env.SF_SALES_APP_CLIENT_ID,
    client_secret: process.env.SF_SALES_APP_CLIENT_SECRET,
    redirect_uri: process.env.SF_SALES_APP_REDIRECT_URI,
  });

  const transformedRequest: BaseRequest = {
    ...request,
    body: params.toString(),
  };
  return transformedRequest;
}

export function transformRefreshTokenRequest(request: BaseRequest): BaseRequest {
  if (!process.env.SF_SALES_APP_CLIENT_ID || !process.env.SF_SALES_APP_CLIENT_SECRET) {
    throw new Error('Missing Salesforce OAuth configuration');
  }

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: String(request.body.refresh_token),
    client_id: process.env.SF_SALES_APP_CLIENT_ID,
    client_secret: process.env.SF_SALES_APP_CLIENT_SECRET,
  });

  return {
    ...request,
    body: params.toString(),
  };
}

export function selectAccessTokenTarget(request: BaseRequest) {
  const code = request.body.code;
  const code_verifier = request.body.code_verifier;

  if (code && code_verifier) {
    return 'access-token';
  } else if (request.body.refresh_token) {
    return 'refresh-token';
  } else {
    throw new Error('Invalid request: missing required parameters');
  }
}
