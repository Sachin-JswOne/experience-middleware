import { Backdrop, Box, CircularProgress, Typography } from '@mui/material';

const LoginLoading = () => (
  <Backdrop
    open
    sx={{
      zIndex: (theme) => theme.zIndex.drawer + 1,
      color: '#FFFFFF',
    }}
  >
    <Box sx={{ textAlign: 'center' }}>
      <CircularProgress color="inherit" size={48} thickness={2} />
      <Typography variant="h5" component="p" sx={{ mt: 3 }}>
        Signing you in…
      </Typography>
    </Box>
  </Backdrop>
);

export default LoginLoading;
