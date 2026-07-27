import ApiClient, { type IResult } from '@/services/ApiClient';
import { API_ROUTES } from '@/configs/ApiRoutes';

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

export type IPromptVersionsResult = IResult<IPromptVersion[]>;
export type IPromptMutationResult = IResult<unknown>;

abstract class PromptService {
  static async getVersions(promptType: string): Promise<IPromptVersionsResult> {
    // Defensive envelope unwrapping: backend may return { data: [...] } or the
    // array directly.
    const response = await ApiClient.makeRequest<
      IPromptVersion[] | { data?: IPromptVersion[] }
    >({
      url: API_ROUTES.PROMPTS.VERSIONS(promptType),
      method: 'GET',
    });

    if (response.error.code || !response.data) {
      return { data: null, error: response.error };
    }
    const payload = response.data;
    const versions = Array.isArray(payload) ? payload : (payload.data ?? []);
    return { data: versions, error: response.error };
  }

  static createPrompt(
    promptType: string,
    payload: IPromptCreatePayload,
  ): Promise<IPromptMutationResult> {
    return ApiClient.makeRequest({
      url: API_ROUTES.PROMPTS.CREATE(promptType),
      method: 'POST',
      body: payload,
    });
  }

  static activateVersion(
    promptType: string,
    version: number | string,
  ): Promise<IPromptMutationResult> {
    return ApiClient.makeRequest({
      url: API_ROUTES.PROMPTS.ACTIVATE(promptType, version),
      method: 'PUT',
    });
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
