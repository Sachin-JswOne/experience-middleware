import { Button } from '@mui/material';
import OutlookIcon from '@/icons/OutlookIcon';

const Login = () => {
  const redirectTo = window.location.pathname + window.location.search;
  const OAUTH2_REDIRECT_OUTLOOK_URI = `${
    window.location.origin
  }/oauth2?redirectTo=${encodeURIComponent(redirectTo)}`;
  const OUTLOOK_AUTH_URL = `${
    import.meta.env.VITE_AUTH_SERVICE_BASE_URL
  }/auth/outlook-login?referer=${encodeURIComponent(
    OAUTH2_REDIRECT_OUTLOOK_URI
  )}`;

  const handleOutlookLogin = () => {
    window.location.href = OUTLOOK_AUTH_URL;
  };

  return (
    <Button
      variant="outlined"
      fullWidth
      size="large"
      startIcon={<OutlookIcon />}
      onClick={handleOutlookLogin}
      sx={{
        textTransform: 'none',
        py: 1.5,
        borderColor: 'grey.400',
        color: 'text.primary',
        '&:hover': {
          borderColor: 'primary.main',
          bgcolor: 'action.hover',
        },
      }}
    >
      Sign in with Outlook
    </Button>
  );
};

export default Login;
