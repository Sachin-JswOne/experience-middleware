import { Box, Typography } from '@mui/material';
import { tokens } from '@/styles/theme';
import { tryPretty } from './sampleExport';

/** Monospace payload panel — request/response bodies and header dumps. */
const CodeBlock = ({ label, value }: { label: string; value?: string }) => (
  <Box sx={{ mb: 1.5 }}>
    <Typography
      variant="body2"
      sx={{ color: tokens.textSubtle, mb: 0.5, fontWeight: tokens.weightBold }}
    >
      {label}
    </Typography>
    <Box
      component="pre"
      sx={{
        m: 0,
        p: 1.5,
        bgcolor: tokens.surfaceSunken,
        border: `1px solid ${tokens.border}`,
        borderRadius: `${tokens.radiusSmall}px`,
        fontSize: 12,
        lineHeight: 1.5,
        overflow: 'auto',
        maxHeight: 240,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {tryPretty(value)}
    </Box>
  </Box>
);

export default CodeBlock;
