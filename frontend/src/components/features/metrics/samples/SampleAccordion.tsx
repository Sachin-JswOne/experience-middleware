import { memo } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import type { RouteErrorSample } from '@/_types/metrics.interface';
import { formatMs, formatTs } from '@/utils/format';
import { tokens } from '@/styles/theme';
import { logUrlFor } from '../chartShared';
import { pillSx, toneForStatus } from '../statusPill';
import CodeBlock from './CodeBlock';
import SampleWaterfall from './SampleWaterfall';
import { buildCurl, copyText } from './sampleExport';

const nestedAccordionSx = {
  border: `1px solid ${tokens.border}`,
  borderRadius: 1,
  '&:before': { display: 'none' },
};

const DownstreamCall = ({ call }: { call: RouteErrorSample['downstream'][number] }) => (
  <Accordion disableGutters elevation={0} sx={{ ...nestedAccordionSx, mb: 0.5 }}>
    <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 36 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}>
        <Chip
          label={call.statusCode ?? 'network error'}
          size="small"
          variant="outlined"
          sx={{
            height: 18,
            fontSize: 12,
            color: call.success ? tokens.success : tokens.danger,
            borderColor: call.success ? tokens.success : tokens.danger,
          }}
        />
        <Typography
          variant="body2"
          sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {call.target}
        </Typography>
        <Typography variant="body2" sx={{ color: tokens.textSubtle }}>
          {formatMs(call.durationMs)}
        </Typography>
      </Box>
    </AccordionSummary>
    <AccordionDetails>
      {call.requestUrl && (
        <Typography variant="body2" sx={{ mb: 1, wordBreak: 'break-all', color: tokens.textSubtle }}>
          {call.requestUrl}
        </Typography>
      )}
      <CodeBlock label="Request headers" value={JSON.stringify(call.requestHeaders ?? {})} />
      <CodeBlock label="Request body" value={call.requestBody} />
      <CodeBlock label="Response body" value={call.responseBody} />
    </AccordionDetails>
  </Accordion>
);

const RequestIdChip = ({ requestId }: { requestId: string }) => {
  const logUrl = logUrlFor(requestId);

  return (
    <Tooltip title={logUrl ? `Open logs for ${requestId}` : `Copy request id ${requestId}`}>
      <Chip
        label={requestId.slice(0, 8)}
        size="small"
        variant="outlined"
        {...(logUrl
          ? {
              component: 'a' as const,
              href: logUrl,
              target: '_blank',
              rel: 'noopener',
              clickable: true,
              onClick: (e: React.MouseEvent) => e.stopPropagation(),
            }
          : {
              onClick: (e: React.MouseEvent) => {
                e.stopPropagation();
                void copyText(requestId, 'Request id copied');
              },
            })}
        sx={{ height: 18, fontSize: 12, fontFamily: 'monospace', color: tokens.textSubtle }}
      />
    </Tooltip>
  );
};

interface Props {
  sample: RouteErrorSample;
  slow: boolean;
  // Band mode mixes routes — identify each sample's route inline.
  showRoute?: boolean;
  utc?: boolean;
}

const SampleAccordion = ({ sample, slow, showRoute, utc }: Props) => (
  <Accordion disableGutters elevation={0} sx={{ ...nestedAccordionSx, mb: 1 }}>
    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1, minWidth: 0 }}>
        <Chip label={sample.statusCode} size="small" sx={pillSx(toneForStatus(sample.statusCode))} />
        {slow && (
          <Chip
            label="slow"
            size="small"
            variant="outlined"
            sx={{ height: 20, fontSize: 12, color: tokens.warning, borderColor: tokens.warning }}
          />
        )}
        <Typography variant="body2" sx={{ color: tokens.textSubtle }}>
          {formatTs(sample.ts, 'HH:mm:ss', utc)}
        </Typography>
        <Typography
          variant="body2"
          sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {showRoute ? (
            <Typography
              component="span"
              variant="body2"
              sx={{ fontWeight: tokens.weightBold, mr: 0.75 }}
            >
              {`${sample.method} ${sample.route}`}
            </Typography>
          ) : null}
          {sample.url}
        </Typography>
        <Typography variant="body2" sx={{ color: tokens.textSubtle }}>
          {formatMs(sample.durationMs)}
        </Typography>
        {sample.pod && (
          <Tooltip title={`Served by pod ${sample.pod}`}>
            <Chip
              label={sample.pod}
              size="small"
              variant="outlined"
              sx={{ height: 18, fontSize: 12, maxWidth: 110, color: tokens.textSubtle }}
            />
          </Tooltip>
        )}
        {sample.requestId && <RequestIdChip requestId={sample.requestId} />}
        <Tooltip title="Copy as cURL">
          <IconButton
            size="small"
            aria-label="Copy request as cURL"
            onClick={(e) => {
              e.stopPropagation();
              void copyText(buildCurl(sample), 'cURL copied to clipboard');
            }}
          >
            <ContentCopyIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      </Box>
    </AccordionSummary>
    <AccordionDetails>
      {sample.requestId && (
        <Typography variant="body2" sx={{ mb: 1, color: tokens.textSubtle, fontFamily: 'monospace' }}>
          request-id: {sample.requestId}
        </Typography>
      )}
      <SampleWaterfall sample={sample} />
      <CodeBlock label="Request headers" value={JSON.stringify(sample.requestHeaders)} />
      <CodeBlock
        label={sample.method === 'GET' ? 'Query params' : 'Request body'}
        value={sample.requestBody}
      />
      <CodeBlock label="Response body" value={sample.responseBody} />
      {sample.downstream.length > 0 && (
        <Box>
          <Typography
            variant="body2"
            sx={{ color: tokens.textSubtle, mb: 0.5, fontWeight: tokens.weightBold }}
          >
            Downstream calls
          </Typography>
          {sample.downstream.map((call, idx) => (
            <DownstreamCall key={`${call.target}-${idx}`} call={call} />
          ))}
        </Box>
      )}
    </AccordionDetails>
  </Accordion>
);

export default memo(SampleAccordion);
