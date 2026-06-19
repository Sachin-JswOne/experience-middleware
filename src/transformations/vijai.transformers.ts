import { BaseRequest } from 'src/models/base-request.model';
import { CustomError } from 'src/utils/CustomError';

export function transformVijaiUserListRequest(request: any) {
  const finalTransformedRequest: BaseRequest = {
    ...request,
    body: null,
  };
  const ownerId = request.url.searchParams.get('id');
  const isVisitList = request.url.searchParams.get('isVisitList');
  const isOpportunityList = request.url.searchParams.get('isOpportunityList');
  const isAccountList = request.url.searchParams.get('isAccountList');
  const isEventList = request.url.searchParams.get('isEventList');

  let soql = '';
  if (!ownerId) {
    throw new CustomError('OwnerId is required in params', 400);
  }

  if (isVisitList === 'true') {
    soql = `SELECT Id, Name, Visit_Stage__c, Planned_Visit__c,
       CheckIn_CMV__Account__c, CheckIn_CMV__Account__r.Name,
       CheckIn_CMV__Check_in_Date_Time__c,
       CheckIn_CMV__Check_in_Coordinates__c,
       CheckIn_CMV__Check_in_Comments__c,
       CheckIn_CMV__Check_out_Date_Time__c,
       CheckIn_CMV__Check_out_Coordinates__c,
       CheckIn_CMV__Check_out_Comments__c,
       Met_with_Contact__c, Met_with_Contact__r.LastName,
       Site__c, CreatedDate
FROM CheckIn_CMV__Visit__c
WHERE OwnerId = '${ownerId}'
ORDER BY CheckIn_CMV__Check_in_Date_Time__c DESC`
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (isOpportunityList === 'true') {
    soql = `SELECT Id, Name, StageName, RecordType.DeveloperName, CreatedDate,
       (SELECT Id, Name, Attributes_to_Display__c, Attributes__c,
               Final_Distributor_Quote__c, SKU_Subtotal__c,
               Primary_Revised_Quantity__c
        FROM Enquiry_Line_items__r),
       Total_revised_quantity__c,
       Sum_of_SKU_subtotal_Final_Quote__c,
       Total_Order_Value__c,
       Delivery_address__r.Address_City_State_Pincode_Formula__c,
       Account.Billing_Address__r.Address_City_State_Pincode_Formula__c
FROM Opportunity
WHERE OwnerId = '${ownerId}'`
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (isAccountList === 'true') {
    soql =
      `Select AccountNumber,GST__c, PAN__c, Id, Name, Nodal_Bank_Account__c,isJodl__c, Pay_to__c, JSW_NodalBankVAN__c, JSW_NonNodalBankVAN__c,Non_Nodal_Bank_Account__c, Segment__c, Sub_Segment__c, RecordType.Name, Customer_Type_Account__c, Business_Division__c
FROM Account
WHERE OwnerId = '${ownerId}'`
        .replace(/\s+/g, ' ')
        .trim();
  }

  if (isEventList === 'true') {
    soql = `SELECT Id, Subject, ActivityDate, StartDateTime, EndDateTime, Location,
       AccountId, Account.Name, WhoId, Description
FROM Event
WHERE OwnerId = '${ownerId}'
  AND StartDateTime >= TODAY
ORDER BY StartDateTime ASC`
      .replace(/\s+/g, ' ')
      .trim();
  }

  finalTransformedRequest.url.search = `?q=${soql}`;
  return finalTransformedRequest;
}
