import ApiClient, { IApiClientResponse } from '@/services/ApiClient';
import { API_ROUTES } from '@/configs/ApiRoutes';
import { ILooseObject } from '@/_types/common.interface';
import LocalStorage from '@/utils/LocalStorage';

const getAccessTokenHeader = (): ILooseObject => {
  const userInfo: ILooseObject | undefined = LocalStorage.getItem('userInfo');
  const token = userInfo?.token;
  return token ? { access_token: token } : {};
};

export interface IPromptVersion {
  id: number | string;
  promptType: string;
  version: number | string;
  prompt: string; // possibly BASE64-encoded
  encoding: string; // "BASE64"
  active: boolean;
  createdBy: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface IPromptCreatePayload {
  prompt: string;
  description: string;
  promptType: string;
  createdBy: string;
  activate: boolean;
}

export interface IPromptVersionsResult {
  data: IPromptVersion[];
  error: IApiClientResponse['error'];
}

export interface IPromptMutationResult {
  data: ILooseObject;
  error: IApiClientResponse['error'];
}

abstract class PromptService {
  static async getVersions(promptType: string): Promise<IPromptVersionsResult> {
    const result: IPromptVersionsResult = {
      data: [],
      error: { code: 0, message: '' },
    };

    const response: IApiClientResponse = await ApiClient.makeRequest({
      url: API_ROUTES.PROMPTS.VERSIONS(promptType),
      method: 'GET',
      // headers: getAccessTokenHeader()
    });

    if (response.data) {
      // Defensive envelope unwrapping: backend may return { data: [...] } or the array directly
      result.data = (response.data?.data ?? response.data) as IPromptVersion[];
    } else {
      result.error = { ...response.error };
    }
    return result;
  }

  static async createPrompt(
    promptType: string,
    payload: IPromptCreatePayload,
  ): Promise<IPromptMutationResult> {
    const result: IPromptMutationResult = {
      data: {},
      error: { code: 0, message: '' },
    };

    // TODO confirm base64 encoding with backend curl before switching from plain text
    const response: IApiClientResponse = await ApiClient.makeRequest({
      url: API_ROUTES.PROMPTS.CREATE(promptType),
      method: 'POST',
      body: payload as ILooseObject,
    });

    if (response.data) {
      result.data = { ...response.data };
    } else {
      result.error = { ...response.error };
    }
    return result;
  }

  static async activateVersion(
    promptType: string,
    version: number | string,
  ): Promise<IPromptMutationResult> {
    const result: IPromptMutationResult = {
      data: {},
      error: { code: 0, message: '' },
    };

    const response: IApiClientResponse = await ApiClient.makeRequest({
      url: API_ROUTES.PROMPTS.ACTIVATE(promptType, version),
      method: 'PUT',
    });

    if (response.data) {
      result.data = { ...response.data };
    } else {
      result.error = { ...response.error };
    }
    return result;
  }

  static decodePrompt(item: IPromptVersion): string {
    if (item.encoding !== 'BASE64' || !item.prompt) {
      return item.prompt ?? '';
    }
    try {
      const binary = Uint8Array.from(atob(item.prompt), (c) => c.charCodeAt(0));
      return new TextDecoder().decode(binary);
    } catch {
      return item.prompt;
    }
  }
}

export default PromptService;
