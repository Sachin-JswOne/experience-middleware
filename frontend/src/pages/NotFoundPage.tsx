import { Box, Button, Typography } from '@mui/material';
import { Link } from 'react-router-dom';

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
    }}
  >
    <Typography variant="h1" color="text.secondary" sx={{ fontWeight: 'bold' }}>
      404
    </Typography>
    <Typography variant="h5" sx={{ mt: 2, mb: 1 }}>
      Page Not Found
    </Typography>
    <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
      The page you are looking for does not exist or has been moved.
    </Typography>
    <Button component={Link} to="/" variant="contained" size="large">
      Go to Dashboard
    </Button>
  </Box>
);

export default NotFoundPage;
