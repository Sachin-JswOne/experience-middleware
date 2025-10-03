import { AggregatedResponse } from 'src/models/aggregated-response.model';


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
    throw new Error('Strapi project details responses is missing or failed');
  }

  if(!homesDashboardResponse?.success){
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
    projectID: homesData.jswone_project_id,
  };

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
        throw new Error('Strapi user details responses is missing or failed');
    }

    if ( !homesUserResponse?.success) {
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