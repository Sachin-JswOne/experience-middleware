import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { Logger } from '@nestjs/common';
import { getFormattedTracingContext } from 'src/utils/tracing.util';


export function mergePageDetailsResponses(
  aggregatedResponses: AggregatedResponse[],
): any {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );

  const strapiResponse = responses['strapi-project-detail'];
  const homesDashboardResponse = responses['homes-project-details'];

  if (!strapiResponse?.success) {
    Logger.error(`Error for Page Details API method: mergePageDetailsResponses ${getFormattedTracingContext()} Strapi project details responses is missing or failed`);
    throw new Error('Strapi project details responses is missing or failed');
  }

  if(!homesDashboardResponse?.success){
    Logger.error(`Error for Page Details API method: mergePageDetailsResponses ${getFormattedTracingContext()} Homes project details responses is missing or failed`);
    throw new Error('Homes project details responses is missing or failed');
  }

  const strapiData = { ...strapiResponse.data };
  const homesData = homesDashboardResponse.data;

  const projectItems = 
  strapiData?.data?.projectDetails?.projectItems?.map((item: any) => {
        return {
            ...item,
            value : homesData[item.key]
        };
    });

  const title = {
    ...strapiData.data.title,
    salutation: `${strapiData.data.title.salutation}${homesData.clientName ?? ''}`,
    stage: `${strapiData.data.title.stage}${homesData.stage ?? ''}`,
  };

  const projectID = {
    ...strapiData.data.projectID,
    projectID: homesData.projectId,
  };

  strapiData.data.imageUrl = homesData?.imageUrl;

  const homesTeam = {
    ...strapiData.data.homesTeam,
    userCard : homesData.userDetails.map((member : any) => {
         return {
          name: member.userName,
          designation: member.projectRoleName,
          email: member.email,
          mobile: member.phoneNumber,
        };
    })
  };

  return {
    ...strapiData,
    data: {
      ...strapiData.data,
      projectDetails: {
        ...strapiData.data.projectDetails,
        projectItems,
      },
      title,
      projectID,
      homesTeam,
    },
  };
}

export function mergeUserDetailsResponses(aggregatedResponses: AggregatedResponse[]): any {

    const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,);

    const strapiUserResponse = responses['strapi-user-detail'];
    const homesUserResponse = responses['homes-user-details'];

    if (!strapiUserResponse?.success) {
        Logger.error(`Error for User Details API method: mergeUserDetailsResponses ${getFormattedTracingContext()} Strapi user details responses is missing or failed`);
        throw new Error('Strapi user details responses is missing or failed');
    }

    if ( !homesUserResponse?.success) {
        Logger.error(`Error for User Details API method: mergeUserDetailsResponses ${getFormattedTracingContext()} Homes user details responses is missing or failed`);
        throw new Error('Homes user details responses is missing or failed');
    }
    const strapiData = strapiUserResponse.data;
    const homesData = homesUserResponse.data;

    return {
    ...strapiUserResponse,
    data: {
      ...strapiData.data,
      user: {
        name: homesData?.name ?? "",
        phoneNumber: homesData?.phoneNumber ?? "",
        email: homesData?.email ?? "",
        projectIds : homesData?.projectIds ?? []
      },
    },
  };
}

export function mergeProjectDetailsAndTrackerResponses(
  aggregatedResponses: AggregatedResponse[],
): any {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );

  const strapiResponse = responses['strapi-project-detail'];
  const homesDashboardResponse = responses['homes-project-details'];

  if (!strapiResponse?.success) {
    throw new Error('Strapi project details response is missing or failed');
  }
  if (!homesDashboardResponse?.success) {
    throw new Error('Homes project details response is missing or failed');
  }

  const strapiData = { ...strapiResponse.data };
  const homesData = homesDashboardResponse.data;
  const projectItems =
    strapiData?.data?.projectDetails?.projectItems?.map((item: any) => ({
      ...item,
      value: homesData[item.key],
    })) ?? [];

  const projectID = {
    ...strapiData.data.projectID,
    projectID: homesData.projectId,
    address : homesData?.addressLine1 ?? ""
  };

  const homesTeam = {
    ...strapiData.data.homesTeam,
    userCard:
      homesData.userDetails?.map((member: any) => ({
        name: member.userName,
        designation: member.projectRoleName,
        email: member.email,
        mobile: member.phoneNumber,
        level : member.level
      })) ?? [],
  };
  var currentprojectStage = "";
  const homesDesignStage = homesData?.projectStepperResponse?.stages.find((stage) => stage.stageName === 'designStage');
  const homesPreConstructionStage = homesData?.projectStepperResponse?.stages?.find((stage) => stage.stageName === 'preConstructionStage');
  strapiData.data.projectTracker.activeStage = homesData?.projectStepperResponse?.activeStage;
  const designStage =
    strapiData?.data?.projectTracker?.designStage?.subSteps?.map((member: any) => {
      const milestoneName = member.fieldName;
      if (homesDesignStage?.milestones?.[milestoneName]?.status?.toLowerCase().includes('progress')) {
       currentprojectStage = member?.title 
      }
      return {
        ...member,
        currentStatus: homesDesignStage?.milestones?.[milestoneName]?.status ?? '',
        date: homesDesignStage?.milestones?.[milestoneName]?.date ?? '',
      };
    }) ?? [];

  const preConstructionStage =
    strapiData?.data?.projectTracker?.preConstructionStage?.subSteps?.map(
      (member: any) => {
        const milestoneName = member.fieldName;
        return {
          ...member,
          currentStatus:
            homesPreConstructionStage?.milestones?.[milestoneName]?.status ?? '',
          date: homesPreConstructionStage?.milestones?.[milestoneName]?.date ?? '',
        };
      },
    ) ?? [];

  const projectTracker = {
    ...strapiData.data.projectTracker,
    designStage: {
      ...strapiData.data.projectTracker?.designStage,
      subSteps: designStage,
    },
    preConstructionStage: {
      ...strapiData.data.projectTracker?.preConstructionStage,
      subSteps: preConstructionStage,
    },
  };

  const title = {
    ...strapiData.data.title,
    salutation: `${strapiData.data.title.salutation}${homesData.clientName ?? ''}`,
    stage: `${strapiData.data.title.stage}${currentprojectStage ?? ''}`,
  };

  return {
    ...strapiData,
    data: {
      ...strapiData.data,
      projectDetails: {
        ...strapiData.data.projectDetails,
        projectItems,
      },
      title,
      projectID,
      homesTeam,
      projectTracker,
    },
  };
}