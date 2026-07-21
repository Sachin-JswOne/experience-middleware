import { Button } from '@mui/material';
import OutlookIcon from '@/icons/OutlookIcon';
import { API_ROUTES } from '@/configs/ApiRoutes';

const Login = () => {
  const redirectTo = window.location.pathname + window.location.search;
  const OAUTH2_REDIRECT_OUTLOOK_URI = `${
    window.location.origin
  }/oauth2?redirectTo=${encodeURIComponent(redirectTo)}`;
  const OUTLOOK_AUTH_URL = API_ROUTES.AUTH.OUTLOOK_LOGIN(
    OAUTH2_REDIRECT_OUTLOOK_URI
  );

  const handleOutlookLogin = () => {
    window.location.href = OUTLOOK_AUTH_URL;
  };

  return (
    <Button
      variant="outlined"
      fullWidth
      startIcon={<OutlookIcon />}
      onClick={handleOutlookLogin}
      sx={{ py: 1 }}
    >
      Sign in with Outlook
    </Button>
  );
};

export default Login;
