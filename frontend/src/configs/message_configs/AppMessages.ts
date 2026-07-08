type errorAppMessageTypes = {
  unauthorized: string;
  access_denied: string;
  missing_url: string;
  missing_method: string;
};

interface IAppMessages {
  ERRORS: errorAppMessageTypes;
}

const AppMessages: IAppMessages = {
  ERRORS: {
    unauthorized: '[401] Unauthorized',
    access_denied: "[403] You don't have access to the requested feature.",
    missing_url: 'Missing URL',
    missing_method: 'Missing Method'
  }
};

export default AppMessages;
