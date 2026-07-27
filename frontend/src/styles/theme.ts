import { createTheme } from '@mui/material/styles';

// Design tokens sourced from frontend/DESIGN.md (light theme).
// Components should consume these via the theme or this export —
// never hand-authored hex values.
export const tokens = {
  // Surfaces
  surface: '#FFFFFF',
  surfaceSunken: '#F8F8F8',
  // Text
  text: '#292A2E',
  textSubtle: '#505258',
  textSubtlest: '#6B6E76',
  textInverse: '#FFFFFF',
  // Borders
  border: '#0B120E24',
  borderInput: '#8C8F97',
  borderFocused: '#4688EC',
  // Brand / selected
  brand: '#1868DB',
  brandHovered: '#1558BC',
  brandPressed: '#144794',
  backgroundSelected: '#E9F2FE',
  backgroundSelectedHovered: '#CFE1FD',
  // Neutral interaction fills
  backgroundNeutralSubtleHovered: '#0515240F',
  backgroundNeutralSubtlePressed: '#0B120E24',
  backgroundNeutralBold: '#292A2E',
  // Semantic roles
  danger: '#C9372C',
  dangerHovered: '#AE2E24',
  success: '#5B7F24',
  warning: '#E06C00',
  // Status lozenges (DESIGN.md: bg-subtler + border + bolder text)
  pillSuccessBg: '#D3F1A7',
  pillSuccessBorder: '#6A9A23',
  pillSuccessText: '#37471F',
  pillDangerBg: '#FFD5D2',
  pillDangerBorder: '#E2483D',
  pillDangerText: '#5D1F1A',
  pillWarningBg: '#FCE4A6',
  pillWarningBorder: '#E06C00',
  pillWarningText: '#693200',
  pillNeutralBg: '#F0F1F2',
  pillNeutralBorder: '#7D818A',
  pillNeutralText: '#292A2E',
  // Overlay blanket
  blanket: '#050C1F75',
  // Elevation (pair raised/overlay surfaces with these only)
  shadowRaised: '0px 1px 1px #1E1F2140, 0px 0px 1px #1E1F214F',
  shadowOverlay: '0px 8px 12px #1E1F2126, 0px 0px 1px #1E1F214F',
  // Radius by component class
  radiusSmall: 4,
  radiusMedium: 6,
  radiusLarge: 8,
  radiusXlarge: 12,
  // Type
  fontFamily:
    "'Atlassian Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', system-ui, sans-serif",
  weightBold: 653,
};

const heading = (fontSize: string, lineHeight: string) => ({
  fontFamily: tokens.fontFamily,
  fontSize,
  lineHeight,
  fontWeight: tokens.weightBold,
});

const theme = createTheme({
  palette: {
    primary: {
      main: tokens.brand,
      dark: tokens.brandHovered,
      light: tokens.borderFocused,
      contrastText: tokens.textInverse,
    },
    error: {
      main: tokens.danger,
      dark: tokens.dangerHovered,
    },
    warning: {
      main: tokens.warning,
    },
    success: {
      main: tokens.success,
    },
    info: {
      main: tokens.brand,
    },
    text: {
      primary: tokens.text,
      secondary: tokens.textSubtle,
      disabled: '#080F214A',
    },
    divider: tokens.border,
    background: {
      default: tokens.surface,
      paper: tokens.surface,
    },
    action: {
      hover: tokens.backgroundNeutralSubtleHovered,
      selected: tokens.backgroundSelected,
    },
  },
  typography: {
    fontFamily: tokens.fontFamily,
    h1: heading('2rem', '2.25rem'),
    h2: heading('1.75rem', '2rem'),
    h3: heading('1.5rem', '1.75rem'),
    h4: heading('1.25rem', '1.5rem'),
    h5: heading('1rem', '1.25rem'),
    h6: heading('0.875rem', '1.25rem'),
    body1: {
      fontSize: '0.875rem',
      lineHeight: '1.25rem',
    },
    body2: {
      fontSize: '0.75rem',
      lineHeight: '1rem',
    },
    caption: {
      fontSize: '0.75rem',
      lineHeight: '1rem',
      color: tokens.textSubtlest,
    },
    button: {
      fontSize: '0.875rem',
      fontWeight: 500,
      textTransform: 'none',
    },
  },
  shape: {
    borderRadius: tokens.radiusMedium,
  },
  components: {
    MuiButtonBase: {
      defaultProps: {
        disableRipple: true,
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: tokens.radiusMedium,
          paddingBlock: '0.375rem',
          paddingInline: '0.75rem',
          '&:focus-visible': {
            outline: `2px solid ${tokens.borderFocused}`,
            outlineOffset: 2,
          },
        },
        containedPrimary: {
          '&:hover': { backgroundColor: tokens.brandHovered },
          '&:active': { backgroundColor: tokens.brandPressed },
        },
        outlined: {
          borderColor: tokens.border,
          color: tokens.textSubtle,
          '&:hover': {
            borderColor: tokens.border,
            backgroundColor: tokens.backgroundNeutralSubtleHovered,
          },
          '&:active': {
            backgroundColor: tokens.backgroundNeutralSubtlePressed,
          },
        },
        text: {
          color: tokens.textSubtle,
          '&:hover': {
            backgroundColor: tokens.backgroundNeutralSubtleHovered,
          },
          '&:active': {
            backgroundColor: tokens.backgroundNeutralSubtlePressed,
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: tokens.radiusMedium,
          color: tokens.textSubtle,
          '&:hover': {
            backgroundColor: tokens.backgroundNeutralSubtleHovered,
          },
          '&:focus-visible': {
            outline: `2px solid ${tokens.borderFocused}`,
            outlineOffset: 2,
          },
        },
      },
    },
    MuiAppBar: {
      defaultProps: {
        elevation: 0,
        color: 'inherit',
      },
      styleOverrides: {
        root: {
          backgroundColor: tokens.surface,
          color: tokens.text,
          borderBlockEnd: `1px solid ${tokens.border}`,
        },
      },
    },
    MuiToolbar: {
      styleOverrides: {
        root: {
          minHeight: 56,
          '@media (min-width: 600px)': { minHeight: 56 },
        },
      },
    },
    MuiCard: {
      defaultProps: {
        variant: 'outlined',
      },
      styleOverrides: {
        root: {
          borderRadius: tokens.radiusLarge,
          borderColor: tokens.border,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        rounded: {
          borderRadius: tokens.radiusLarge,
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          boxShadow: tokens.shadowOverlay,
        },
      },
    },
    MuiPopover: {
      styleOverrides: {
        paper: {
          boxShadow: tokens.shadowOverlay,
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: tokens.backgroundNeutralBold,
          color: tokens.textInverse,
          borderRadius: tokens.radiusSmall,
          fontSize: '0.75rem',
          lineHeight: '1rem',
          paddingBlock: '0.25rem',
          paddingInline: '0.375rem',
          maxWidth: 240,
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: tokens.radiusMedium,
          '&:hover': {
            backgroundColor: tokens.backgroundNeutralSubtleHovered,
          },
          '&.Mui-selected': {
            backgroundColor: tokens.backgroundSelected,
            color: tokens.brand,
            '&:hover': {
              backgroundColor: tokens.backgroundSelectedHovered,
            },
          },
          '&:focus-visible': {
            outline: `2px solid ${tokens.borderFocused}`,
            outlineOffset: -2,
          },
        },
      },
    },
    MuiBackdrop: {
      styleOverrides: {
        root: {
          backgroundColor: tokens.blanket,
        },
      },
    },
  },
});

export default theme;
