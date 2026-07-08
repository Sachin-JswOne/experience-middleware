import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { ILooseObject } from '@/_types/common.interface';
import LoginLoading from '@/components/features/oauth/LoginLoading';
import UserService from '@/services/UserService';
import LocalStorage from '@/utils/LocalStorage';
import AppConfig from '@/configs/AppConfig';
import { processUamAuthorities } from '@/utils/auth';

const OAuth2Redirect = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const processedRef = useRef(false);

  useEffect(() => {
    const handleAuth = async () => {
      if (processedRef.current) return;
      processedRef.current = true;

      const authId = searchParams.get('auth-id');

      const redirectTo = searchParams.get('redirectTo') || '/';

      if (!authId) {
        navigate('/login', { replace: true });
        return;
      }

      try {
        // Step 1: Exchange auth-id for access token
        const tokenResponse = await UserService.getAuth2AccessToken(authId);

        const accessToken: string | undefined =
          tokenResponse?.data?.token;



        if (!accessToken) {
          navigate('/login', { replace: true });
          return;
        }

        // Step 2: Fetch user info with UAM authorities
        // UserService.getUAMUserInfo returns { data: { ...userFields, token } }
        const userResponse = await UserService.getUAMUserInfo(accessToken);
        const uamUserInfo: ILooseObject | undefined = userResponse?.data;
        console.log("uamUserInfo : ", uamUserInfo)

        if (!uamUserInfo || !uamUserInfo.name) {
          navigate('/login', { replace: true });
          return;
        }

        // Step 3: Process UAM authorities to extract permissions
        // Iterate organizations → applications → filter by UAMApplications → collect permission names
        const permissions = processUamAuthorities(
          uamUserInfo,
          AppConfig.UAMApplications
        );

        // Step 4: Build and persist user info
        const userInfo: ILooseObject = {
          token: accessToken,
          username: uamUserInfo.username,
          email: uamUserInfo.email,
          name: uamUserInfo.name,
          compatibleVersion: AppConfig.COMPATIBLE_VERSION,
          permissions,
          organizations:
            uamUserInfo.uamAuthorities?.organizations ?? [],
        };

        LocalStorage.setItem('userInfo', userInfo);

        // Step 5: Redirect to intended destination
        navigate(redirectTo, { replace: true });
      } catch (error) {
        console.error('OAuth2 authentication failed:', error);
        navigate('/login', { replace: true });
      }
    };

    handleAuth();
  }, [navigate, searchParams]);

  return <LoginLoading />;
};

export default OAuth2Redirect;
