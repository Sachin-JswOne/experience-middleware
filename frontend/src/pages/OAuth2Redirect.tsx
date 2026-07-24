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
        navigate('/login', {
          replace: true,
          state: { authError: 'Sign-in failed: missing authorization details. Please try again.' },
        });
        return;
      }

      try {
        // Step 1: Exchange auth-id for access token (fatal if fails)
        const tokenResponse = await UserService.getAuth2AccessToken(authId);
        const accessToken: string | undefined = tokenResponse?.data?.token;

        if (!accessToken) {
          navigate('/login', {
            replace: true,
            state: { authError: 'Sign-in failed: no access token was returned. Please try again.' },
          });
          return;
        }

        // Step 2: Build base userInfo with just the token
        const userInfo: ILooseObject = {
          token: accessToken,
          compatibleVersion: AppConfig.COMPATIBLE_VERSION,
          permissions: [],
          name: '',
          email: '',
          username: '',
          organizations: [],
        };

        // Step 3: Fetch UAM user info (non-fatal — best-effort)
        try {
          const userResponse = await UserService.getUAMUserInfo(accessToken);
          const uamUserInfo: ILooseObject | undefined = userResponse?.data;
          if (uamUserInfo?.name) {
            const uamPermissions = processUamAuthorities(uamUserInfo, AppConfig.UAMApplications);
            userInfo.username = uamUserInfo.name ?? '';
            userInfo.email = uamUserInfo.email_id ?? '';
            userInfo.name = uamUserInfo.name;
            // UAM permission names plus flat role names (some deployments
            // grant admin actions via role name).
            userInfo.permissions = [...new Set([...uamPermissions, ...(uamUserInfo.roles ?? [])])];
            userInfo.organizations = uamUserInfo.uamAuthorities?.organizations ?? [];
          }
        } catch (uamError) {
          console.warn('UAM fetch failed, proceeding with token only:', uamError);
        }

        // Step 4: Persist and redirect
        LocalStorage.setItem('userInfo', userInfo);
        navigate(redirectTo, { replace: true });
      } catch (error) {
        console.error('OAuth2 authentication failed:', error);
        navigate('/login', {
          replace: true,
          state: { authError: 'Sign-in failed. Please try again.' },
        });
      }
    };

    handleAuth();
  }, [navigate, searchParams]);

  return <LoginLoading />;
};

export default OAuth2Redirect;
