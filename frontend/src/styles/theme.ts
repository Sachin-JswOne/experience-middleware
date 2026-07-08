import { createTheme } from '@mui/material/styles';

// Create Material UI theme
const theme = createTheme({
  palette: {
    primary: {
      main: '#2241A6' // JSW Blue
    },
    secondary: {
      main: '#F4F9FF',
      dark: '#CAE0FE'
    },
    warning: {
      main: '#ED6C02' // Red for draft
    },
    success: {
      main: '#02B474' // Green for published
    }
  },
  typography: {
    fontFamily: '"Source Sans 3", system-ui, -apple-system, sans-serif'
  }
});

export default theme;
