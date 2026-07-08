import ApiClient, { IApiClientResponse } from '@/services/ApiClient';
import { ILooseObject } from '@/_types/common.interface';

export type GetUserInfoResultType = {
  data: ILooseObject;
  error: IApiClientResponse['error'];
};

abstract class UserService {
  static async getAuth2AccessToken(
    authId: string
  ): Promise<GetUserInfoResultType> {
    const result: GetUserInfoResultType = {
      data: {},
      error: {
        code: 0,
        message: ''
      }
    };

    const response: IApiClientResponse = await ApiClient.makeRequest({
      url: `/xp-mi/public/v1/auth/retrieve-access-token?auth-id=${authId}`,
      method: 'GET'
    });

    if (response.data) {
      result.data = { ...response.data };
    } else {
      result.error = { ...response.error };
    }
    return result;
  }

  static async getUAMUserInfo(token: string): Promise<GetUserInfoResultType> {
    const result: GetUserInfoResultType = {
      data: {},
      error: {
        code: 0,
        message: ''
      }
    };
    const response: IApiClientResponse = await ApiClient.makeRequest({
      url: '/xp-mi/public/v1/auth/user/me',
      method: 'GET',
      headers: {
        authorization: `Bearer ${token}`
      }
    });
    if (response.data?.data) {
      delete response.data.data.password;
      result.data = { ...response.data.data, token };
    } else {
      result.error = { ...response.error };
    }
    return result;
  }
}

export default UserService;
