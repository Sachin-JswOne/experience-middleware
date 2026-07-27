import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import LoginLoading from '@/components/features/oauth/LoginLoading';
import UserService from '@/services/UserService';
import AppConfig from '@/configs/AppConfig';
import { safeRedirectPath, writeSession, type SessionUser } from '@/utils/session';

/**
 * Lands here from the IdP with a one-time `auth-id`. The server exchanges it
 * for a token and — in cookie mode — keeps the token in an httpOnly cookie,
 * returning only the profile. Either shape is accepted: whether `token` comes
 * back decides what gets stored locally.
 */
const OAuth2Redirect = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const processedRef = useRef(false);

  useEffect(() => {
    const handleAuth = async () => {
      if (processedRef.current) return;
      processedRef.current = true;

      const authId = searchParams.get('auth-id');
      // Never navigate to an off-origin destination supplied in the URL.
      const redirectTo = safeRedirectPath(searchParams.get('redirectTo'));

      if (!authId) {
        navigate('/login', {
          replace: true,
          state: { authError: 'Sign-in failed: missing authorization details. Please try again.' },
        });
        return;
      }

      const result = await UserService.exchangeAuthId(authId);
      if (!result.data) {
        navigate('/login', {
          replace: true,
          state: {
            authError:
              result.error.message || 'Sign-in failed. Please try again.',
          },
        });
        return;
      }

      const { profile, token } = result.data;
      const session: SessionUser = {
        compatibleVersion: AppConfig.COMPATIBLE_VERSION,
        name: profile.name,
        email: profile.email,
        username: profile.username,
        permissions: profile.permissions,
        organizations: profile.organizations,
        // Absent in cookie mode — the browser holds the credential instead.
        ...(token ? { token } : {}),
      };

      writeSession(session);
      navigate(redirectTo, { replace: true });
    };

    void handleAuth();
  }, [navigate, searchParams]);

  return <LoginLoading />;
};

export default OAuth2Redirect;
