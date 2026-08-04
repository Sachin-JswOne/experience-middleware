import { HttpStatus } from '@nestjs/common';
import { BaseRequest } from 'src/models/base-request.model';
import { CustomError } from 'src/utils/CustomError';

// Salesforce record Ids are either 15 (case-sensitive) or 18 (case-insensitive)
// character alphanumeric strings.
const SALESFORCE_ID_REGEX = /^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/;

// Allow-list of known RecordType DeveloperName values used by the Sales App
// opportunity queries. `getDeveloperName` in orderListing.transformers.ts emits
// `MSME` / `PrivateBrand`, and the credit flow uses `Credit`.
const ALLOWED_RECORD_TYPE_DEVELOPER_NAMES = new Set(['Credit', 'MSME', 'PrivateBrand']);

function assertValidSalesforceId(value: string, field: string): string {
  if (!value || !SALESFORCE_ID_REGEX.test(value)) {
    throw new CustomError(`Invalid ${field}`, HttpStatus.BAD_REQUEST);
  }
  return value;
}

function assertValidDeveloperName(value: string): string {
  if (!value || !ALLOWED_RECORD_TYPE_DEVELOPER_NAMES.has(value)) {
    throw new CustomError('Invalid developerName', HttpStatus.BAD_REQUEST);
  }
  return value;
}

// Parse the comma-separated `accountIds` param, validate each entry as a
// Salesforce Id, and rebuild a safely quoted list for the SOQL `IN` clause.
function buildSafeAccountIdInClause(rawAccountIds: string): string {
  const ids = rawAccountIds
    .split(',')
    .map((id) =>
      id
        .trim()
        .replace(/^['"]|['"]$/g, '')
        .trim(),
    )
    .filter((id) => id.length > 0);

  if (ids.length === 0) {
    throw new CustomError('Invalid accountIds', HttpStatus.BAD_REQUEST);
  }

  return ids.map((id) => `'${assertValidSalesforceId(id, 'accountIds')}'`).join(', ');
}

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
  const isOrderList = request.url.searchParams.get('isOrderList');
  const isAccountById = request.url.searchParams.get('isAccountById');
  const accountIds = request.url.searchParams.get('accountIds');
  const developerName = request.url.searchParams.get('developerName');
  const nextRecordsUrl = request.url.searchParams.get('nextRecordsUrl');

  // Validate the owner/opportunity Id before it is interpolated into any SOQL
  // WHERE clause below.
  if (ownerId) {
    assertValidSalesforceId(ownerId, 'id');
  }

  let soql = '';

  if (isVisitList === 'true' && ownerId) {
    soql = `SELECT Id, Name, Visit_Stage__c, Planned_Visit__c,
       CheckIn_CMV__Account__c, CheckIn_CMV__Account__r.Name,
       CheckIn_CMV__Check_in_Date_Time__c,
       CheckIn_CMV__Check_in_Coordinates__c,
       CheckIn_CMV__Check_in_Comments__c,
       CheckIn_CMV__Check_out_Date_Time__c,
       CheckIn_CMV__Check_out_Coordinates__c,
       CheckIn_CMV__Check_out_Comments__c,
       Met_with_Contact__c, Met_with_Contact__r.LastName,
       Site__c, CreatedDate, Site__r.name, Site__r.Google_Maps_Coordinates__c,
       Site__r.Project_Address__c, Site__r.pin_code__c, Site__r.auto_state__c,
       Site__r.auto_district__c, Site__r.City__c,Site__r.RecordType.Name, Status__c
FROM CheckIn_CMV__Visit__c
WHERE OwnerId = '${ownerId}'
ORDER BY CheckIn_CMV__Check_in_Date_Time__c DESC`
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (isOpportunityList === 'true' && ownerId) {
    assertValidDeveloperName(developerName);
    if (developerName === 'Credit') {
      soql = `SELECT Id, Name, StageName, RecordType.DeveloperName, CreatedDate, 
       Credit_limit_requested__c, Credit_tenure_request_days__c, 
       Category_Team_Owner__r.Name, Credit_sales_SPOC__r.Name, Risk_SPOC__r.Name,
       Sales_SPOC__r.Name, JOTS_Owner__r.Name, Opportunity_History_String__c, Total_revised_quantity__c,
       Rejection_remarks__c, Success_Marked_Time__c,
       (SELECT Id, Name, Attributes_to_Display__c, Attributes__c,
               Final_Distributor_Quote__c, SKU_Subtotal__c, Limit_approved__c, 
               Primary_Revised_Quantity__c, Credit_program__c
        FROM Enquiry_Line_items__r), 
       (SELECT Id, Stage_name__c, Cumulative_stage_age__c, 
        Current_stage_age__c, Opportunity__c, Stage_entry_time__c, 
        Stage_exit_time__c, Current_age__c FROM JSW_Ageing__r)
       Total_revised_quantity__c,
       Sum_of_SKU_subtotal_Final_Quote__c,
       Total_Order_Value__c,
       Delivery_address__r.Address_City_State_Pincode_Formula__c,
       Account.Billing_Address__r.Address_City_State_Pincode_Formula__c
        FROM Opportunity
        WHERE (OwnerId = '${ownerId}' OR Sales_SPOC__c = '${ownerId}')
        AND RecordType.DeveloperName = '${developerName}' 
        ORDER BY CreatedDate DESC`
        .replace(/\s+/g, ' ')
        .trim();
    } else {
      soql = `SELECT Id, Name, StageName, RecordType.DeveloperName, CreatedDate, 
       Credit_limit_requested__c, Credit_tenure_request_days__c, 
       Category_Team_Owner__r.Name, Credit_sales_SPOC__r.Name, Risk_SPOC__r.Name,
       Sales_SPOC__r.Name, JOTS_Owner__r.Name, Opportunity_History_String__c, Total_revised_quantity__c,
       Success_Marked_Time__c,
       (SELECT Id, Name, Attributes_to_Display__c, Attributes__c,
               Final_Distributor_Quote__c, SKU_Subtotal__c,
               Primary_Revised_Quantity__c
        FROM Enquiry_Line_items__r), 
       (SELECT Id, Stage_name__c, Cumulative_stage_age__c, 
        Current_stage_age__c, Opportunity__c, Stage_entry_time__c, 
        Stage_exit_time__c, Current_age__c FROM JSW_Ageing__r)
       Total_revised_quantity__c,
       Sum_of_SKU_subtotal_Final_Quote__c,
       Total_Order_Value__c,
       Delivery_address__r.Address_City_State_Pincode_Formula__c,
       Account.Billing_Address__r.Address_City_State_Pincode_Formula__c
        FROM Opportunity
        WHERE (OwnerId = '${ownerId}' OR Sales_SPOC__c = '${ownerId}')
        AND RecordType.DeveloperName != '${developerName}'
        ORDER BY CreatedDate DESC`
        .replace(/\s+/g, ' ')
        .trim();
    }
  }

  if (isAccountList === 'true' && ownerId) {
    soql =
      `Select Account_tag__c, Registered__c, Account_History_String__c, Opportunity_History_String__c, Last_Opportunity_Create_Date__c, AccountNumber,GST__c, PAN__c, Id, Name, Nodal_Bank_Account__c,isJodl__c, Pay_to__c, JSW_NodalBankVAN__c, JSW_NonNodalBankVAN__c,Non_Nodal_Bank_Account__c, Segment__c, Sub_Segment__c, RecordType.Name, Customer_Type_Account__c, Account_Status__c, Business_Division__c,(SELECT Id, Name, Designation_multiselect__c, MobilePhone, Email from Contacts), (Select id, name, Project_Address__c, pin_code__c, auto_state__c, auto_district__c, City__c,RecordType.Name,Google_maps_coordinates__c from MSME_Construct_Sites__r)
FROM Account
WHERE OwnerId = '${ownerId}'`
        .replace(/\s+/g, ' ')
        .trim();
  }

  if (isEventList === 'true' && ownerId) {
    soql = `SELECT Id, Subject, ActivityDate, StartDateTime, EndDateTime, Location,
       AccountId, Account.Name, WhoId, Description
FROM Event
WHERE OwnerId = '${ownerId}'
  AND StartDateTime = THIS_MONTH
ORDER BY StartDateTime ASC`
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (isOrderList === 'true' && ownerId) {
    soql =
      `SELECT Id, Order_External_Id__c, Delivery_Status__c, Payment_Status__c, Payment_Amount__c, Paid_Amount__c, Order_Cancellation_Reason__c, Order_Amount__c, CreatedDate, LastModifiedDate
FROM Order
WHERE OpportunityId = '${ownerId}'
ORDER BY CreatedDate DESC`
        .replace(/\s+/g, ' ')
        .trim();
  }

  if (isAccountById === 'true' && accountIds) {
    const safeAccountIdInClause = buildSafeAccountIdInClause(accountIds);
    soql = `SELECT Account_tag__c, Registered__c, Account_History_String__c, Opportunity_History_String__c, Last_Opportunity_Create_Date__c,
    AccountNumber, GST__c, PAN__c, Id, Name, Nodal_Bank_Account__c, isJodl__c, Pay_to__c, JSW_NodalBankVAN__c, JSW_NonNodalBankVAN__c,
    Non_Nodal_Bank_Account__c, Segment__c, Sub_Segment__c, RecordType.Name, Customer_Type_Account__c, Account_Status__c, Business_Division__c,
    (
        SELECT
            Id, Name, Designation_multiselect__c, MobilePhone, Email
        FROM Contacts
    ),
    (
        SELECT
            Id, Name, Project_Address__c, PIN_Code__c, Auto_State__c, Auto_District__c, City__c, RecordType.Name, Google_Maps_Coordinates__c
        FROM MSME_Construct_Sites__r
    )
    FROM Account
    WHERE Id IN (
    ${safeAccountIdInClause}
    )`;
  }

  if (nextRecordsUrl) {
    finalTransformedRequest.url.pathname = `/services/data/v59.0/query/${nextRecordsUrl}`;
    finalTransformedRequest.url.search = '';
  } else {
    finalTransformedRequest.url.pathname = '/services/data/v59.0/query';
    finalTransformedRequest.url.search = `?q=${soql}`;
  }
  return finalTransformedRequest;
}

export function transformVijaiFetchCreditInfoRequest(request: any) {
  const finalTransformedRequest: BaseRequest = {
    ...request,
    body: null,
  };
  const pan = request.url.searchParams.get('pan');
  request.url.searchParams.set('pan', pan);
  return finalTransformedRequest;
}

export function transformVijaiMarkNotificationRequest(request: any) {
  const finalTransformedRequest: BaseRequest = {
    ...request,
  };

  finalTransformedRequest.body = {
    seen: true,
  };
  return finalTransformedRequest;
}

export function transformVijaiResolveRecordTypeRequest(request: any) {
  const finalTransformedRequest: BaseRequest = {
    ...request,
    body: null,
  };
  finalTransformedRequest.url.searchParams.set('layoutTypes', 'Compact');
  return finalTransformedRequest;
}
