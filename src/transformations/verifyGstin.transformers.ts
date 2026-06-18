import { BaseRequest } from 'src/models/base-request.model';
import { CustomError } from 'src/utils/CustomError';
import { HttpStatus, Logger } from '@nestjs/common';
import { safeDebug } from 'src/utils/common-functions.util';

export function verifyGstin(request: BaseRequest): BaseRequest {
  const { gstin } = request.body;

  const finalTransformedRequest: BaseRequest = {
    ...request,
    body: { gstin },
  };
  Logger.log(`Transforming Verify GSTIN Request ${request.url} method: verifyGstin`);
  return finalTransformedRequest;
}

export function verifyGstinResponse(response: any) {
  safeDebug(
    Logger,
    () =>
      ` Verify GSTIN Api response from method: verifyGstinResponse : ${JSON.stringify(response)}`,
  );
  const resData = response?.data;
  const error = response?.error;
  const finalResult = {
    gstVerified: false,
    gstDetails: '',
    userAlreadyExists: false,
  } as any;

  if (error) {
    if (error.message?.includes('Account already registered')) {
      finalResult.gstVerified = true;
      finalResult.gstDetails = '';
      finalResult.userAlreadyExists = true;
    } else if (error.message?.includes('Please enter valid')) {
      throw new CustomError(error.message, HttpStatus.BAD_REQUEST);
    } else if (error?.message) {
      safeDebug(Logger, () => `Error in GSTIN verification: ${error.message}`);
      finalResult.gstVerified = true;
      finalResult.errorMessage = { message: error.message };
    } else {
      finalResult.gstVerified = true;
      finalResult.errorMessage = {
        header: 'Couldn’t validate GSTIN',
        message: 'We are unable to validate your GSTIN. Please retry later.',
      };
    }
    Logger.error(`Error for Verify GSTIN API method: verifyGstinResponse ${error.message}`);
  } else {
    finalResult.gstVerified = true;
    finalResult.gstDetails = convertToAddress(resData);
    finalResult.userAlreadyExists = false;
  }
  return finalResult;
}

export function convertToAddress(resData: any) {
  const address =
    (resData.companyName ? resData.companyName : '') +
    ' ' +
    (resData.streetLine1 ? resData.streetLine1 : '') +
    ' ' +
    (resData.streetLine2 ? resData.streetLine2 : '') +
    ' ' +
    (resData.region ? resData.region : '') +
    ' ' +
    (resData.city ? resData.city : '') +
    ' ' +
    (resData.state ? resData.state : '') +
    ' ' +
    (resData.pinCode ? resData.pinCode : '') +
    ' ' +
    (resData.country ? resData.country : '');
  return address;
}
