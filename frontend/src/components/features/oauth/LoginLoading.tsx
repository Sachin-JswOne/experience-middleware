import { Backdrop, Box, CircularProgress, Typography } from '@mui/material';

const LoginLoading = () => (
  <Backdrop
    open
    sx={{
      zIndex: (theme) => theme.zIndex.drawer + 1,
      color: '#fff',
      display: 'flex',
      flexDirection: 'column',
    }}
  >
    <Box sx={{ textAlign: 'center' }}>
      <CircularProgress color="inherit" size={48} />
      <Typography variant="h6" sx={{ mt: 3 }}>
        Logging you in, stay tuned...
      </Typography>
    </Box>
  </Backdrop>
);

export default LoginLoading;
