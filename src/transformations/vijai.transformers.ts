import { BaseRequest } from 'src/models/base-request.model';
import 'dotenv/config';
import { STOCK_LOW_THRESHOLD } from 'src/config/app.config';

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
      `Select Account_tag__c, Registered__c, Account_History_String__c, Opportunity_History_String__c, Last_Opportunity_Create_Date__c, AccountNumber,GST__c, PAN__c, Id, Name, Nodal_Bank_Account__c,isJodl__c, Pay_to__c, JSW_NodalBankVAN__c, JSW_NonNodalBankVAN__c,Non_Nodal_Bank_Account__c, Segment__c, Sub_Segment__c, RecordType.Name, Customer_Type_Account__c, Account_Status__c, Business_Division__c, Auto_State__c, Auto_Taluka__c, Account_Status__c,(SELECT Id, Name, Designation_multiselect__c, MobilePhone, Email from Contacts), (Select id, name, Project_Address__c, pin_code__c, auto_state__c, auto_district__c, City__c,RecordType.Name,Google_maps_coordinates__c from MSME_Construct_Sites__r)
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
    ${accountIds}
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

export function transformVijaiStockSignalsRequest(request: any) {
  const finalTransformedRequest: BaseRequest = {
    ...request,
    body: null,
  };
  const ownerId = request.url.searchParams.get('ownerId');
  request.url.searchParams.set('ownerId', ownerId);
  return finalTransformedRequest;
}

export function transformVijaiStockSignalsResponse(response: any) {
  const data = response.data;

  const distributors = data.filter(
    item => item.accountType === "Distributor"
  );

  const retailers = data.filter(
    item => item.accountType === "Retailer PB"
  );

  let transformedData = {
    distributors: distributors,
    retailers: retailers
  };

  let finalTransformedData = processStockSignals(transformedData);
  return finalTransformedData;
}

/**
 * Signal definitions
 *
 * Stock low:
 *   currentStock > 0 && currentStock < 5
 *
 * Retailer - No stock this month:
 *   currentStock === 0
 *
 * Distributor - No purchase:
 *   totalPurchases === 0
 *
 * Retailer - Stock not moving:
 *   currentStock > 0 && secondarySales === 0
 *
 * Distributor - Stock not moving:
 *   currentStock > 0 &&
 *   (soldToRetailers + soldAtSites) === 0
 *
 * Retailer - Influencer gap:
 *   soldViaInfluencers === 0
 */
function getSignals(
    account: Account,
    type: AccountType
): Signal[] {

    const currentStock = account.currentStock ?? 0;
    const totalPurchases = account.totalPurchases ?? 0;
    const secondarySales = account.secondarySales ?? 0;
    const soldToRetailers = account.soldToRetailers ?? 0;
    const soldAtSites = account.soldAtSites ?? 0;
    const soldViaInfluencers = account.soldViaInfluencers ?? 0;

    const signals: Signal[] = [];

    if (
        currentStock > 0 && currentStock < STOCK_LOW_THRESHOLD
    ) {
        signals.push({
            tag: "Stock low",
            severity: "red"
        });
    }

    if (type === "retailer" && currentStock === 0) {
        signals.push({
            tag: "No stock this month",
            severity: "red"
        });
    }

    if (type === "distributor" && totalPurchases === 0) {
        signals.push({
            tag: "No purchase",
            severity: "red"
        });
    }

    if (type === "retailer") {
        if (
            currentStock > 0 && secondarySales === 0
        ) {
            signals.push({
                tag: "Stock not moving",
                severity: "orange"
            });
        }
    }

    if (type === "distributor") {
        const distributorSales = soldToRetailers + soldAtSites;
        if (
            currentStock > 0 && distributorSales === 0
        ) {
            signals.push({
                tag: "Stock not moving",
                severity: "orange"
            });
        }
    }

    if (
        type === "retailer" && soldViaInfluencers === 0
    ) {
        signals.push({
            tag: "Influencer gap",
            severity: "grey"
        });
    }

    return signals;
}


/**
 * Add signals to every account in an array.
 */
function addSignalsToAccounts(accounts, type) {
    return accounts.map(account => ({
        accountId: account.accountId,
        accountName: account.accountName,
        accountType: account.accountType,
        signals: getSignals(account, type)
    }));
}


/**
 * Build a summary of signals.
 */
function getSignalSummary(
    accounts: Account[]
): Record<string, SignalSummary> {

    return accounts.reduce<Record<string, SignalSummary>>(
        (summary, account) => {

            (account.signals ?? []).forEach(signal => {

                if (!summary[signal.tag]) {
                    summary[signal.tag] = {
                        count: 0,
                        severity: signal.severity,
                        accounts: []
                    };
                }

                summary[signal.tag].count++;

                summary[signal.tag].accounts.push({
                    accountId: account.accountId,
                    accountName: account.accountName,
                    accountType: account.accountType
                });
            });
            return summary;
        },
        {}
    );
}


/**
 * Convert summary object to an array.
 *
 * Useful for rendering cards/list in the UI.
 */
function getSignalSummaryArray(
    summary: Record<string, SignalSummary>
) {
    return Object.entries(summary).map(
        ([tag, data]) => ({
            tag,
            count: data.count,
            severity: data.severity,
        })
    );
}


/**
 * Main function.
 *
 * Takes the complete API response and returns
 * tagged distributors, tagged retailers and summaries.
 */
function processStockSignals(response: {
    distributors: Account[];
    retailers: Account[];
}) {

    const distributors = addSignalsToAccounts(
        response.distributors ?? [],
        "distributor"
    );

    const retailers = addSignalsToAccounts(
        response.retailers ?? [],
        "retailer"
    );

    const retailerSummary =
        getSignalSummary(retailers);

    return {
        distributors,
        retailerSignalList:
            getSignalSummaryArray(retailerSummary)
    };
}