import { BaseRequest } from 'src/models/base-request.model';
import 'dotenv/config';
import { STOCK_LOW_THRESHOLD } from 'src/config/app.config';
import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { Logger } from '@nestjs/common';
import { HttpStatusCode } from 'axios';
import { CustomError } from 'src/utils/CustomError';

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
  const accountId = request.url.searchParams.get('accountId');
  const isVisitList = request.url.searchParams.get('isVisitList');
  const isOpportunityList = request.url.searchParams.get('isOpportunityList');
  const isAccountList = request.url.searchParams.get('isAccountList');
  const isEventList = request.url.searchParams.get('isEventList');
  const isOrderList = request.url.searchParams.get('isOrderList');
  const isAccountById = request.url.searchParams.get('isAccountById');
  const accountIds = request.url.searchParams.get('accountIds');
  const developerName = request.url.searchParams.get('developerName');
  const nextRecordsUrl = request.url.searchParams.get('nextRecordsUrl');
  const isMarketPotential = request.url.searchParams.get('isMarketPotential');

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
    } else if (developerName === 'Private_Brand') {
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
      `Select Account_tag__c, Registered__c, Account_History_String__c, Opportunity_History_String__c, Last_Opportunity_Create_Date__c, AccountNumber,GST__c, PAN__c, Id, Name, Nodal_Bank_Account__c,isJodl__c, Pay_to__c, JSW_NodalBankVAN__c, JSW_NonNodalBankVAN__c,Non_Nodal_Bank_Account__c, Segment__c, Sub_Segment__c, RecordType.Name, Customer_Type_Account__c, Account_Status__c, Business_Division__c, Auto_State__c, Auto_Taluka__c,(SELECT Id, Name, Designation_multiselect__c, MobilePhone, Email from Contacts), (Select id, name, Project_Address__c, pin_code__c, auto_state__c, auto_district__c, City__c,RecordType.Name,Google_maps_coordinates__c from MSME_Construct_Sites__r)
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

  if (isMarketPotential === 'true' && accountId) {
    soql = `SELECT Id, Category__c, Sub_Category__c, Sales__c, Category_Uom__c, 
    (SELECT Id, Name, Brand_monthly_potential__c, Related_Category_Information__c FROM Brands__r) 
    FROM Related_Category_Information__c 
    WHERE Account__c = '${accountId}'`;
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

  const distributors = data.filter((item) => item.accountType === 'Distributor');

  const retailers = data.filter((item) => item.accountType === 'Retailer PB');

  const transformedData = {
    distributors: distributors,
    retailers: retailers,
  };

  const finalTransformedData = processStockSignals(transformedData);
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
 *
 * Distributor - No opp:
 *  totalOpportunities = 0
 *
 * Distributor - No pipeline:
 *  totalOpportunities - successOpportunities - newOpportunities - lostOpportunities === 0
 *
 * Retailer - Superstar not billed:
 *  accountTag = "superstar"
 */
function getSignals(account: Account, type: AccountType): Signal[] {
  const currentStock = account.currentStock ?? 0;
  const totalPurchases = account.totalPurchases ?? 0;
  const secondarySales = account.secondarySales ?? 0;
  const soldToRetailers = account.soldToRetailers ?? 0;
  const soldAtSites = account.soldAtSites ?? 0;
  const soldViaInfluencers = account.soldViaInfluencers ?? 0;
  const totalOpportunities = account.totalOpportunities ?? 0;
  const successOpportunities = account.successOpportunities ?? 0;
  const newOpportunities = account.newOpportunities ?? 0;
  const lostOpportunities = account.lostOpportunities ?? 0;
  const accountTag = account.accountTag ?? '';

  const signals: Signal[] = [];

  if (currentStock > 0 && currentStock < STOCK_LOW_THRESHOLD) {
    signals.push({
      tag: 'Stock low',
      severity: 'red',
    });
  }

  if (type === 'retailer' && currentStock === 0) {
    signals.push({
      tag: 'No stock this month',
      severity: 'red',
    });
  }

  if (type === 'distributor' && totalPurchases === 0) {
    signals.push({
      tag: 'No purchase',
      severity: 'nocolor',
    });
  }

  if (type === 'retailer') {
    if (currentStock > 0 && secondarySales === 0) {
      signals.push({
        tag: 'Stock not moving',
        severity: 'orange',
      });
    }
  }

  if (type === 'distributor') {
    const distributorSales = soldToRetailers + soldAtSites;
    if (currentStock > 0 && distributorSales === 0) {
      signals.push({
        tag: 'Stock not moving',
        severity: 'orange',
      });
    }
  }

  if (type === 'retailer' && soldViaInfluencers === 0) {
    signals.push({
      tag: 'Influencer gap',
      severity: 'grey',
    });
  }

  if (type === 'distributor' && totalOpportunities === 0) {
    signals.push({
      tag: 'no opp',
      severity: 'nocolor',
    });
  }

  if (
    type === 'distributor' &&
    totalOpportunities - successOpportunities - newOpportunities - lostOpportunities === 0
  ) {
    signals.push({
      tag: 'no pipeline',
      severity: 'nocolor',
    });
  }

  if (type === 'retailer' && accountTag.toLocaleLowerCase().includes('super star')) {
    signals.push({
      tag: 'Superstar not billed',
      severity: 'red',
    });
  }

  return signals;
}

/**
 * Add signals to every account in an array.
 */
function addSignalsToAccounts(accounts, type) {
  return accounts.map((account) => ({
    accountId: account.accountId,
    accountName: account.accountName,
    accountType: account.accountType,
    signals: getSignals(account, type),
  }));
}

/**
 * Build a summary of signals.
 */
function getSignalSummary(accounts: Account[]): Record<string, SignalSummary> {
  return accounts.reduce<Record<string, SignalSummary>>((summary, account) => {
    (account.signals ?? []).forEach((signal) => {
      if (!summary[signal.tag]) {
        summary[signal.tag] = {
          count: 0,
          severity: signal.severity,
          accounts: [],
        };
      }

      summary[signal.tag].count++;

      summary[signal.tag].accounts.push({
        accountId: account.accountId,
        accountName: account.accountName,
        accountType: account.accountType,
      });
    });
    return summary;
  }, {});
}

/**
 * Convert summary object to an array.
 *
 * Useful for rendering cards/list in the UI.
 */
function getSignalSummaryArray(summary: Record<string, SignalSummary>) {
  return Object.entries(summary).map(([tag, data]) => ({
    tag,
    count: data.count,
    severity: data.severity,
  }));
}

/**
 * Main function.
 *
 * Takes the complete API response and returns
 * tagged distributors, tagged retailers and summaries.
 */
function processStockSignals(response: { distributors: Account[]; retailers: Account[] }) {
  const distributors = addSignalsToAccounts(response.distributors ?? [], 'distributor');

  const retailers = addSignalsToAccounts(response.retailers ?? [], 'retailer');

  const retailerSummary = getSignalSummary(retailers);

  return {
    distributors,
    retailerSignalList: getSignalSummaryArray(retailerSummary),
  };
}

export function transformVijaiVisitListRequest(request) {
  const ownerId = request.url.searchParams.get('ownerId');
  const nextRecordsUrl = request.url.searchParams.get('nextRecordsUrl');
  const finalTransformedRequest: BaseRequest = {
    ...request,
    body: null,
  };

  const soql = `SELECT Id, Name, Visit_Stage__c, Planned_Visit__c,
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

  if (nextRecordsUrl) {
    finalTransformedRequest.url.pathname = `/services/data/v59.0/query/${nextRecordsUrl}`;
    finalTransformedRequest.url.search = '';
  } else {
    finalTransformedRequest.url.pathname = '/services/data/v59.0/query';
    finalTransformedRequest.url.search = `?q=${soql}`;
  }
  return finalTransformedRequest;
}

export function transformVijaiMyTerritoryDistributorResponse(
  aggregatedResponses: AggregatedResponse[],
) {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );
  const accountStockResponse = responses['vijai-stock-signals'].data.data;
  const visitListResponse = responses['vijai-visit-list'].data?.records ?? [];

  let distributors = accountStockResponse.filter((item) => item.accountType === 'Distributor');

  distributors = distributors.map((account) => ({
    ...account,
    signals: getSignals(account, 'distributor'),
  }));

  const accountIds = new Set(distributors.map((account) => account.accountId));

  const latestVisitMap = new Map<string, string>();

  visitListResponse.forEach((visit) => {
    const accountId = visit.CheckIn_CMV__Account__c;
    const checkoutDate = visit.CheckIn_CMV__Check_out_Date_Time__c;

    if (!accountId || !checkoutDate || !accountIds.has(accountId)) {
      return;
    }

    const existingDate = latestVisitMap.get(accountId);

    if (!existingDate || new Date(checkoutDate).getTime() > new Date(existingDate).getTime()) {
      latestVisitMap.set(accountId, checkoutDate);
    }
  });

  const accountsWithLastVisit = distributors.map((account) => {
    const lastVisitDate = latestVisitMap.get(account.accountId);

    if (!lastVisitDate) {
      return {
        ...account,
        lastVisit: null,
      };
    }

    const daysAgo = Math.floor(
      (Date.now() - new Date(lastVisitDate).getTime()) / (1000 * 60 * 60 * 24),
    );

    return {
      ...account,
      lastVisitDate,
      lastVisit: `${daysAgo}d ago`,
    };
  });

  const finalResponse = accountsWithLastVisit.map((account) => ({
    distributorName: account.accountName || null,

    stockSignal: account.signals || null,

    stock: account.currentStock || null,

    opening: account.openingStock || null,

    purchasedMT: account.totalPurchases || null,

    soldMTD: (account.soldToRetailers || 0) + (account.soldAtSites || 0),

    lastVisit: account.lastVisit || null,

    lastOrder: null, // invoice date from BQ
  }));

  return finalResponse;
}

export function transformVijaiMyTerritoryDealersResponse(
  aggregatedResponses: AggregatedResponse[],
) {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );
  const accountStockResponse = responses['vijai-stock-signals'].data.data;
  const visitListResponse = responses['vijai-visit-list'].data?.records ?? [];

  const dealers = accountStockResponse.filter((item) => item.accountType === 'Retailer PB');

  const accountIds = new Set(dealers.map((account) => account.accountId));

  const latestVisitMap = new Map<string, string>();

  visitListResponse.forEach((visit) => {
    const accountId = visit.CheckIn_CMV__Account__c;
    const checkInDate = visit.CheckIn_CMV__Check_in_Date_Time__c;

    if (!accountId || !checkInDate || !accountIds.has(accountId)) {
      return;
    }

    const existingDate = latestVisitMap.get(accountId);

    if (!existingDate || new Date(checkInDate).getTime() > new Date(existingDate).getTime()) {
      latestVisitMap.set(accountId, checkInDate);
    }
  });

  const accountsWithLastVisit = dealers.map((account) => {
    const lastVisitDate = latestVisitMap.get(account.accountId);

    if (!lastVisitDate) {
      return {
        ...account,
        lastVisit: null,
      };
    }

    const daysAgo = Math.floor(
      (Date.now() - new Date(lastVisitDate).getTime()) / (1000 * 60 * 60 * 24),
    );

    return {
      ...account,
      lastVisitDate,
      lastVisit: `${daysAgo}d ago`,
    };
  });

  const finalResponse = accountsWithLastVisit.map((account) => ({
    dealerName: account?.accountName || null,
    stock: account?.currentStock || null,
    secondary: account?.secondarySales || null,
    lastVisit: account?.lastVisit || null,
    lastBilled: null, // invoice date from BQ
  }));

  return finalResponse;
}

export function preVisitBriefRetailerRequest(request, prevResponses: AggregatedResponse[]) {
  const accountId = request.url.searchParams.get('accountId');

  const oppIds =
    prevResponses
      .find((response) => response.target === 'vijai-opp-list')
      ?.data?.records?.map((opp) => opp.Id)
      .filter(Boolean) || [];
  const visitListSoql = `SELECT Id, Name, Visit_Stage__c, Planned_Visit__c,
       CheckIn_CMV__Account__c, CheckIn_CMV__Account__r.Name,
       CheckIn_CMV__Check_in_Date_Time__c,
       CheckIn_CMV__Check_out_Date_Time__c,
       CheckIn_CMV__Check_out_Comments__c,
       Meeting_outcome__c, 
       Met_with_Contact__r.Name,
       Met_with_Contact__r.LastName, Status__c
      FROM CheckIn_CMV__Visit__c
      WHERE CheckIn_CMV__Account__c = '${accountId}' and CheckIn_CMV__Check_in_Date_Time__c = THIS_MONTH
      ORDER BY CheckIn_CMV__Check_in_Date_Time__c DESC`;

  const orderListSoql =
    `SELECT Id,  Delivery_Status__c, CreatedDate, LastModifiedDate, OpportunityId
    FROM Order
    WHERE OpportunityId IN (${oppIds.map((id) => `'${id}'`).join(',')})
    ORDER BY CreatedDate DESC`
      .replace(/\s+/g, ' ')
      .trim();
  const marketPotentialSoql = `SELECT Id, Category__c, Sub_Category__c, Sales__c, Category_Uom__c, Account__c,
    (SELECT Id, Name, Brand_monthly_potential__c, Related_Category_Information__c FROM Brands__r) 
    FROM Related_Category_Information__c 
    WHERE Account__c = '${accountId}'`;

  const casesSoql = `SELECT Id, Subject, Description, CreatedDate 
    FROM Case 
    WHERE JSW_One_Customer__c = '${accountId}' AND Status != 'Closed'`;

  const finalTransformedRequest = {
    ...request,
    body: {
      allOrNone: true,
      compositeRequest: [
        {
          method: 'GET',
          url: `/services/data/v65.0/query/?q=${encodeURIComponent(visitListSoql)}`,
          referenceId: 'visitListSoql',
        },
        ...(oppIds.length > 0
          ? [
              {
                method: 'GET',
                url: `/services/data/v65.0/query/?q=${encodeURIComponent(orderListSoql)}`,
                referenceId: 'orderListSoql',
              },
            ]
          : []),
        {
          method: 'GET',
          url: `/services/data/v65.0/query/?q=${encodeURIComponent(marketPotentialSoql)}`,
          referenceId: 'marketPotentialSoql',
        },
        {
          method: 'GET',
          url: `/services/data/v65.0/query/?q=${encodeURIComponent(casesSoql)}`,
          referenceId: 'casesSoql',
        },
      ],
    },
  };

  return finalTransformedRequest;
}

export function transformPreVisitBriefOppListRequest(request) {
  const accountId = request.url.searchParams.get('accountId');
  const opportunityListSoql = `SELECT Id, Name, StageName, RecordType.DeveloperName,  
        Total_revised_quantity__c,
       (SELECT Id, Name, Attributes_to_Display__c, Attributes__c,
               Final_Distributor_Quote__c, SKU_Subtotal__c,
               Primary_Revised_Quantity__c
        FROM Enquiry_Line_items__r), 
       (SELECT Id, Stage_name__c, Cumulative_stage_age__c, 
        Current_stage_age__c, Opportunity__c, Stage_entry_time__c, 
        Stage_exit_time__c, Current_age__c FROM JSW_Ageing__r)
        Total_revised_quantity__c,
        AccountId, Retailer__c
        FROM Opportunity
        WHERE (Retailer__c = '${accountId}') AND createdDate = THIS_MONTH
        AND RecordType.DeveloperName = 'Private_Brand'
        ORDER BY CreatedDate DESC`
    .replace(/\s+/g, ' ')
    .trim();

  const finalTransformedRequest: BaseRequest = {
    ...request,
    body: null,
  };

  finalTransformedRequest.url.pathname = '/services/data/v59.0/query';
  finalTransformedRequest.url.search = `?q=${opportunityListSoql}`;
  return finalTransformedRequest;
}

export function transformPreVisitBriefRetailerResponse(aggregatedResponses: AggregatedResponse[]) {
  try {
    const responses = aggregatedResponses.reduce(
      (acc, response) => {
        acc[response.target] = response;
        return acc;
      },
      {} as Record<string, AggregatedResponse>,
    );

    const oppListResponse = responses['vijai-opp-list'];
    const stockSignalResponse = responses['vijai-stock-signals'];
    const listResponse = responses['vijai-visit-list'];

    //Handled the case when any of the response is missing or not successful or data is null
    if (oppListResponse?.success !== true || oppListResponse?.data === null) {
      Logger.error('Missing expected responses in oppListResponse');
      throw new CustomError(
        'Missing expected responses in oppListResponse',
        HttpStatusCode.BadRequest,
      );
    }
    if (stockSignalResponse?.success !== true || stockSignalResponse?.data === null) {
      Logger.error('Missing expected responses in stockSignalResponse');
      throw new CustomError(
        'Missing expected responses in stockSignalResponse',
        HttpStatusCode.BadRequest,
      );
    }
    if (listResponse?.success !== true || listResponse?.data === null) {
      Logger.error('Missing expected responses in listResponse');
      throw new CustomError(
        'Missing expected responses in listResponse',
        HttpStatusCode.BadRequest,
      );
    }

    const oppRecords = oppListResponse?.data?.records || [];
    const stockSignalRecords = stockSignalResponse?.data?.data || [];
    const visitRecords =
      listResponse?.data?.compositeResponse.find((item) => item.referenceId === 'visitListSoql')
        ?.body?.records || [];
    const orderRecords =
      listResponse?.data?.compositeResponse.find((item) => item.referenceId === 'orderListSoql')
        ?.body?.records || [];
    const marketPotentialRecords =
      listResponse?.data?.compositeResponse.find(
        (item) => item.referenceId === 'marketPotentialSoql',
      )?.body?.records || [];
    const casesRecords =
      listResponse?.data?.compositeResponse.find((item) => item.referenceId === 'casesSoql')?.body
        ?.records || [];

    //Extract market potential data for the given accountId
    const marketPotentialRecord = marketPotentialRecords.find(
      (record) => record.Category__c === 'Building Material' && record.Sub_Category__c === 'TMT',
    );
    const brandMonthlyPotential =
      marketPotentialRecord?.Brands__r?.records?.map((brand) => ({
        brandName: brand?.Name,
        monthlyPotential: brand?.Brand_monthly_potential__c,
        percentage:
          (brand?.Brand_monthly_potential__c / marketPotentialRecord?.Sales__c) * 100 || 0,
      })) || [];
    const marketPotential = {
      Total: marketPotentialRecord?.Sales__c || 0,
      UOM: marketPotentialRecord?.Category_Uom__c || '',
      BrandMonthlyPotential: brandMonthlyPotential,
    };

    //Extract stock signal data for the given accountId
    let stockSignalRecord = stockSignalRecords[0] ?? [];
    stockSignalRecord = {
      ...stockSignalRecord,
      signals: getSignals(stockSignalRecord, 'retailer'),
    };
    const businessSnapshot = {
      Stock: stockSignalRecord?.currentStock || 0,
      percentageOfLastReceived: '',
      SecondaryMTD: stockSignalRecord?.secondarySales || 0,
      signals: stockSignalRecord?.signals || '',
      distributors: stockSignalRecord?.distributors || '',
    };

    //Extract orders for the given accountId
    const enquiryItemsByOpportunity = oppRecords.reduce(
      (acc, opp) => {
        acc[opp.Id] =
          opp.Enquiry_Line_items__r?.records?.map((item) => ({
            name: item.Name,
            primaryRevisedQuantity: item.Primary_Revised_Quantity__c,
          })) || [];
        return acc;
      },
      {} as Record<string, { name: string; primaryRevisedQuantity: number | null }[]>,
    );

    const ordersWithEnquiryItems = orderRecords.map((order) => ({
      OrderStatus: order.Delivery_Status__c || '',
      enquiryLineItems: enquiryItemsByOpportunity[order.OpportunityId] || [],
    }));
    const lastOrder = {
      totalNoOfOrders: orderRecords?.length,
      orderAge: getOrderAge(orderRecords[0]?.CreatedDate),
      ordersWithEnquiryItems,
    };

    //Extract opportunities in pipeline
    const pipeLineOpportunity =
      oppRecords.filter((opp) => !['New', 'Lost', 'Success'].includes(opp.StageName)) || [];

    const finalPipeLineItem = pipeLineOpportunity.map((opp) => ({
      Name: opp.Name,
      Quantity: opp.Total_revised_quantity__c,
      StageName: opp.StageName,
      opportunityAge: opp.JSW_Ageing__r?.records?.find(
        (record) => record.Stage_name__c === opp.StageName,
      )?.Stage_entry_time__c
        ? getOrderAge(
            opp.JSW_Ageing__r?.records?.find((record) => record.Stage_name__c === opp.StageName)
              ?.Stage_entry_time__c,
          )
        : '',
    }));
    const openPipeline = {
      totalPipelineItem: pipeLineOpportunity.length,
      PipeLineItem: finalPipeLineItem,
    };

    //Extract last visit for the accountId
    const lastVisit = visitRecords.map((visit) => ({
      visitAge: visit.CheckIn_CMV__Check_in_Date_Time__c
        ? getOrderAge(visit.CheckIn_CMV__Check_in_Date_Time__c)
        : '',
      Visited: visit.CheckIn_CMV__Check_in_Date_Time__c
        ? formatVisitedDate(visit.CheckIn_CMV__Check_in_Date_Time__c)
        : '',
      Owner: visit.Met_with_Contact__r?.Name ?? null,
      Outcomes: visit.Meeting_outcome__c,
      MeetingNotes: visit.CheckIn_CMV__Check_out_Comments__c,
    }));

    //Extract cases for given accountId
    const caseRecord = casesRecords.map((caseRecord) => ({
      Subject: caseRecord.Subject,
      Description: caseRecord.Description,
      CreatedDate: getOrderAge(caseRecord.CreatedDate),
    }));
    const cases = {
      totalNumberOfCases: casesRecords.length,
      cases: caseRecord,
    };
    return { businessSnapshot, marketPotential, lastOrder, openPipeline, lastVisit, cases };
  } catch (error) {
    Logger.error('Error in transformPreVisitBriefRetailerResponse', error);
    throw new CustomError(
      'Error in transformPreVisitBriefRetailerResponse : ' +
        (error instanceof Error ? error.message : String(error)),
      HttpStatusCode.InternalServerError,
    );
  }
}

export function transformPreVisitBriefDistributorResponse(
  aggregatedResponses: AggregatedResponse[],
) {
  try {
    const responses = aggregatedResponses.reduce(
      (acc, response) => {
        acc[response.target] = response;
        return acc;
      },
      {} as Record<string, AggregatedResponse>,
    );

    const oppListResponse = responses['vijai-opp-list'];
    const stockSignalResponse = responses['vijai-stock-signals'];
    const listResponse = responses['vijai-visit-list'];

    //Handled the case when any of the response is missing or not successful or data is null
    if (oppListResponse?.success !== true || oppListResponse?.data === null) {
      Logger.error('Missing expected responses in oppListResponse');
      throw new CustomError(
        'Missing expected responses in oppListResponse',
        HttpStatusCode.BadRequest,
      );
    }
    if (stockSignalResponse?.success !== true || stockSignalResponse?.data === null) {
      Logger.error('Missing expected responses in stockSignalResponse');
      throw new CustomError(
        'Missing expected responses in stockSignalResponse',
        HttpStatusCode.BadRequest,
      );
    }
    if (listResponse?.success !== true || listResponse?.data === null) {
      Logger.error('Missing expected responses in listResponse');
      throw new CustomError(
        'Missing expected responses in listResponse',
        HttpStatusCode.BadRequest,
      );
    }

    const oppRecords = oppListResponse?.data?.records || [];
    const stockSignalRecords = stockSignalResponse?.data?.data || [];
    const visitRecords =
      listResponse?.data?.compositeResponse.find((item) => item.referenceId === 'visitListSoql')
        ?.body?.records || [];
    const orderRecords =
      listResponse?.data?.compositeResponse.find((item) => item.referenceId === 'orderListSoql')
        ?.body?.records || [];
    const marketPotentialRecords =
      listResponse?.data?.compositeResponse.find(
        (item) => item.referenceId === 'marketPotentialSoql',
      )?.body?.records || [];
    const casesRecords =
      listResponse?.data?.compositeResponse.find((item) => item.referenceId === 'casesSoql')?.body
        ?.records || [];

    //Extract market potential data for the given accountId
    const marketPotentialRecord = marketPotentialRecords.find(
      (record) => record.Category__c === 'Building Material' && record.Sub_Category__c === 'TMT',
    );
    const accountId = marketPotentialRecord?.Account__c;
    const brandMonthlyPotential =
      marketPotentialRecord?.Brands__r?.records?.map((brand) => ({
        brandName: brand.Name,
        monthlyPotential: brand.Brand_monthly_potential__c,
        percentage: (brand.Brand_monthly_potential__c / marketPotentialRecord.Sales__c) * 100 || 0,
      })) || [];
    const marketPotential = {
      Total: marketPotentialRecord.Sales__c || 0,
      UOM: marketPotentialRecord.Category_Uom__c || '',
      BrandMonthlyPotential: brandMonthlyPotential,
    };

    //Extract stock signal data for the given accountId
    let stockSignalRecord = stockSignalRecords.find((record) => record.accountId === accountId);
    stockSignalRecord = {
      ...stockSignalRecord,
      signals: getSignals(stockSignalRecord, 'distributor'),
    };
    const businessSnapshot = {
      Stock: stockSignalRecord?.currentStock || 0,
      PurchasedMTD: stockSignalRecord?.secondarySales || 0,
      signals: stockSignalRecord?.signals || '',
      MOUTarget: '',
    };

    //Extract orders for the given accountId
    const enquiryItemsByOpportunity = oppRecords.reduce(
      (acc, opp) => {
        acc[opp.Id] =
          opp.Enquiry_Line_items__r?.records?.map((item) => ({
            name: item.Name,
            primaryRevisedQuantity: item.Primary_Revised_Quantity__c,
          })) || [];
        return acc;
      },
      {} as Record<string, { name: string; primaryRevisedQuantity: number | null }[]>,
    );

    const ordersWithEnquiryItems = orderRecords.map((order) => ({
      OrderStatus: order?.Delivery_Status__c || '',
      enquiryLineItems: enquiryItemsByOpportunity[order?.OpportunityId] || [],
    }));
    const lastOrder = {
      totalNoOfOrders: orderRecords?.length,
      orderAge: getOrderAge(orderRecords[0]?.CreatedDate),
      ordersWithEnquiryItems,
    };

    //Extract opportunities in pipeline
    const pipeLineOpportunity =
      oppRecords.filter((opp) => !['New', 'Lost', 'Success'].includes(opp.StageName)) || [];

    const finalPipeLineItem = pipeLineOpportunity.map((opp) => ({
      Name: opp?.Name,
      Quantity: opp?.Total_revised_quantity__c,
      StageName: opp?.StageName,
      opportunityAge: opp?.JSW_Ageing__r?.records?.find(
        (record) => record?.Stage_name__c === opp?.StageName,
      )?.Stage_entry_time__c
        ? getOrderAge(
            opp?.JSW_Ageing__r?.records?.find((record) => record?.Stage_name__c === opp?.StageName)
              ?.Stage_entry_time__c,
          )
        : '',
    }));
    const openPipeline = {
      totalPipelineItem: pipeLineOpportunity?.length,
      PipeLineItem: finalPipeLineItem,
    };

    //Extract last visit for the accountId
    const lastVisit = visitRecords.map((visit) => ({
      visitAge: visit?.CheckIn_CMV__Check_in_Date_Time__c
        ? getOrderAge(visit?.CheckIn_CMV__Check_in_Date_Time__c)
        : '',
      Visited: visit?.CheckIn_CMV__Check_in_Date_Time__c
        ? formatVisitedDate(visit?.CheckIn_CMV__Check_in_Date_Time__c)
        : '',
      Owner: visit?.Met_with_Contact__r?.Name ?? null,
      Outcomes: visit?.Meeting_outcome__c,
      MeetingNotes: visit?.CheckIn_CMV__Check_out_Comments__c,
    }));

    //Extract cases for given accountId
    const caseRecord = casesRecords.map((caseRecord) => ({
      Subject: caseRecord?.Subject,
      Description: caseRecord?.Description,
      CreatedDate: getOrderAge(caseRecord?.CreatedDate),
    }));
    const cases = {
      totalNumberOfCases: casesRecords.length,
      cases: caseRecord,
    };
    return { businessSnapshot, marketPotential, lastOrder, openPipeline, lastVisit, cases };
  } catch (error) {
    Logger.error('Error in transformPreVisitBriefRetailerResponse', error);
    throw new CustomError(
      'Error in transformPreVisitBriefRetailerResponse : ' +
        (error instanceof Error ? error.message : String(error)),
      HttpStatusCode.InternalServerError,
    );
  }
}

function getOrderAge(createdDate: string): string {
  const normalizedDate = createdDate?.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const created = new Date(normalizedDate);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 24) {
    return `${diffHours} hr${diffHours !== 1 ? 's' : ''} ago`;
  }
  return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
}

const formatVisitedDate = (dateString?: string): string | null => {
  if (!dateString) {
    return null;
  }

  const date = new Date(dateString.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));

  if (isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
};

export function transformVijaiStockSignalsRequestBasedOnAccountId(request: any) {
  const finalTransformedRequest: BaseRequest = {
    ...request,
    body: null,
  };
  const accountId = request.url.searchParams.get('accountId');
  request.url.searchParams.set('accountId', accountId);
  return finalTransformedRequest;
}
