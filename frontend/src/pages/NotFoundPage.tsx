import { Box, Button, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { tokens } from '@/styles/theme';

const NotFoundPage = () => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      textAlign: 'center',
      px: 2,
      bgcolor: tokens.surface,
    }}
  >
    <Typography variant="h2" component="h1">
      We can't find that page
    </Typography>
    <Typography variant="body1" sx={{ color: tokens.textSubtle, mt: 1 }}>
      Check the address, or head back to the dashboard.
    </Typography>
    <Button
      component={Link}
      to="/"
      variant="contained"
      sx={{ mt: 3 }}
    >
      Go to dashboard
    </Button>
    <Typography variant="body2" sx={{ color: tokens.textSubtlest, mt: 4 }}>
      Error 404
    </Typography>
  </Box>
);

export default NotFoundPage;
