import { BaseRequest } from 'src/models/base-request.model';
import { AddressRequestBody, AddressPayload } from 'src/models/address.model';

export function createAddress(
    request: BaseRequest,
): BaseRequest {
    const requestBody: AddressRequestBody = request?.body;
    const headers = {
        Authorization: `Bearer 00DIk000000LG4V!AQEAQM7jXSXgAWoAWpQ_1uhpRTYU_0JOgR3iVCOp0s_cgEVhWgMld1TYLFuqWVMNGE2mBEH5AEuLZWnHH1yIBo1r4WFm7T9a`,
    };

    const reqBody = {
        accountId: requestBody?.accountId,
        projectName: requestBody?.projectName,
        addressLine1: requestBody?.addressLine1,
        addressLine2: requestBody?.addressLine2,
        city: requestBody?.city,
        district: requestBody?.district,
        state: requestBody?.state,
        pincode: requestBody?.pincode
    }
    const Body: AddressPayload = { SiteAddressDataList: [reqBody] };


    const finalTransformedRequest: BaseRequest = {
        ...request,
        headers,
        body: Body,
    };
    
    return finalTransformedRequest
} 
