import { AggregatedResponse } from 'src/models/aggregated-response.model';
import { Logger } from '@nestjs/common';
import { getFormattedTracingContext } from 'src/utils/tracing.util';

export function mergeUserDetailsResponses(
  aggregatedResponses: AggregatedResponse[],
): any {
  const responses = aggregatedResponses.reduce(
    (acc, response) => {
      acc[response.target] = response;
      return acc;
    },
    {} as Record<string, AggregatedResponse>,
  );

  const strapiUserResponse = responses['strapi-user-detail'];
  const homesUserResponse = responses['homes-user-details'];

  if (!homesUserResponse?.success) {
    handleHomesError(homesUserResponse, 'User Details');
  }

  if (!strapiUserResponse?.success) {
    Logger.error(
      `Error for User Details API method: mergeUserDetailsResponses ${getFormattedTracingContext()} Strapi user details responses is missing or failed`,
    );
    throw new Error('Strapi user details responses is missing or failed');
  }

  const strapiData = strapiUserResponse.data;
  const homesData = homesUserResponse.data;

  return {
    ...strapiUserResponse,
    data: {
      ...strapiData.data,
      user: {
        name: homesData?.name ?? '',
        phoneNumber: homesData?.phoneNumber ?? '',
        email: homesData?.email ?? '',
        projectIds: homesData?.projectIds ?? [],
      },
    },
  };
}

function handleHomesError(
  homesUserResponse: AggregatedResponse,
  methodName: string,
) {
  Logger.error(
    `Error for ${methodName} API method: mergeUserDetailsResponses ${getFormattedTracingContext()} Homes ${methodName} responses is missing or failed`,
  );
  const errorToThrow = homesUserResponse.customError
    ? homesUserResponse.customError
    : new Error(`Homes ${methodName} responses is missing or failed`);
  throw errorToThrow;
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

  if (!homesDashboardResponse?.success) {
    handleHomesError(homesDashboardResponse, 'Project Details');
  }

  if (!strapiResponse?.success) {
    throw new Error('Strapi project details response is missing or failed');
  }

  const strapiData = { ...strapiResponse.data };
  const homesData = homesDashboardResponse.data;
  const activeStage = homesData?.projectStepperResponse?.activeStage;

  const mergedDesignItems =
    strapiData?.data?.projectDetails?.projectItems?.map((item: any) => ({
      ...item,
      value: homesData[item.key],
    })) ?? [];

  const mergedPreConstructionItems =
    strapiData?.data?.projectDetailsPreConstruction?.projectItems?.map((item: any) => ({
      ...item,
      value: homesData[item.key],
    })) ?? [];

  const mergedConstructionItems =
    strapiData?.data?.projectDetailsConstruction?.projectItems?.map((item: any) => ({
      ...item,
      value: homesData[item.key],
    })) ?? [];

  let finalProjectDetails = {
    projectDetails: { ...strapiData.data.projectDetails, projectItems: [] },
    projectDetailsPreConstruction: {
      ...strapiData.data.projectDetailsPreConstruction,
      projectItems: [],
    },
    projectDetailsConstruction: {
      ...strapiData.data.projectDetailsConstruction,
      projectItems: [],
    },
  };

  if (activeStage == "Design" || activeStage == "PreConstruction") {
    finalProjectDetails.projectDetails.projectItems = mergedDesignItems;
    finalProjectDetails.projectDetailsPreConstruction.projectItems = mergedPreConstructionItems;
  }
  else {
    finalProjectDetails.projectDetailsConstruction.projectItems = mergedConstructionItems;
  }

  strapiData.data.imageUrl = homesData?.imageUrl ?? "";

  const projectID = {
    ...strapiData.data.projectID,
    projectID: homesData.projectId,
    address: homesData?.addressLine1 ?? ""
  };

  const note = strapiData?.data?.homesTeam?.note ??
    `Please raise the escalation call in the following order : `;

  const homesTeam = {
    ...strapiData.data.homesTeam,
    note: homesData.userDetails.length > 0
      ? `${note} ${[...new Set(
        homesData.userDetails
          .map((m: any) => m.level)
          .sort((a: string, b: string) => a.localeCompare(b))
      )].join(" → ")}`
      : "",
    userCard: [
      homesData.userDetails?.map((member: any) => ({
        name: member.userName,
        designation: member.projectRoleName,
        email: member.email,
        mobile: member.phoneNumber,
        level: member.level
      })) ?? []
    ]
  };

  let currentprojectStage: string[] = [];
  const homesDesignStage = homesData?.projectStepperResponse?.stages
    .find((stage) => stage.stageName === 'designStage');

  const homesPreConstructionStage = homesData?.projectStepperResponse?.stages
    ?.find((stage) => stage.stageName === 'preConstructionStage');

  strapiData.data.projectTracker.activeStage = activeStage;

  // ------ DESIGN TRACKER ------
  strapiData.data.projectTracker.designStage.active = homesDesignStage?.active;
  strapiData.data.projectTracker.designStage.completed = homesDesignStage?.completed;

  const designStage =
    strapiData?.data?.projectTracker?.designStage?.subSteps?.map((member: any) => {
      const milestoneName = member.fieldName;
      if (homesDesignStage?.milestones?.[milestoneName]?.status?.toLowerCase().includes('progress')) {
        currentprojectStage = [member?.title];
      }
      return {
        ...member,
        currentStatus: homesDesignStage?.milestones?.[milestoneName]?.status ?? '',
        date: homesDesignStage?.milestones?.[milestoneName]?.date ?? '',
      };
    }) ?? [];

  // ------ PRE-CONSTRUCTION TRACKER ------
  strapiData.data.projectTracker.preConstructionStage.active = homesDesignStage?.active;
  strapiData.data.projectTracker.preConstructionStage.completed = homesDesignStage?.completed;

  const preConstructionStage =
    strapiData?.data?.projectTracker?.preConstructionStage?.subSteps?.map(
      (member: any) => {
        const milestoneName = member.fieldName;
        if (homesPreConstructionStage?.milestones?.[milestoneName]?.status?.toLowerCase().includes('progress')) {
          currentprojectStage = [member?.title]
        }
        return {
          ...member,
          currentStatus: homesPreConstructionStage?.milestones?.[milestoneName]?.status ?? '',
          date: homesPreConstructionStage?.milestones?.[milestoneName]?.date ?? '',
        };
      },
    ) ?? [];

  if (activeStage === 'Construction') {
    const constructionStageStepper = strapiData?.data?.projectTracker?.constructionStage;
    const constructionMileStone = homesData?.projectStepperResponse?.constructionStageMilestone;
    constructionStageStepper.completion.daysLeft = constructionMileStone?.daysLeft;
    constructionStageStepper.completion.progress = constructionMileStone?.percentageCompletion;
    constructionStageStepper.endDate = constructionMileStone.endDate;
    constructionStageStepper.startDate = constructionMileStone?.startDate;
    constructionStageStepper.recentReports =
      constructionMileStone.recentProgressReportDetails?.map((report: any) => ({
        ...constructionStageStepper.recentReports,
        fileName: report?.reportFileName ?? '',
        url: report?.reportFileUrl ?? ''
      })) ?? [];

    constructionStageStepper.stageDetails =
      constructionMileStone?.activeMilestones?.map((milestone: any) => ({
        ...constructionStageStepper.stageDetails,
        milestoneName: milestone?.name ?? '',
        progress: milestone?.percentageCompletion ?? 0
      }));

    currentprojectStage =
      constructionMileStone?.activeMilestones?.map((m: any) => m.name) ?? [];
  }
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
    stage: strapiData.data.title.stage,
    currentStage: currentprojectStage,
  };

  return {
    ...strapiData,
    data: {
      ...strapiData.data,
      ...finalProjectDetails,
      title,
      projectID,
      homesTeam,
      projectTracker,
    },
  };
}