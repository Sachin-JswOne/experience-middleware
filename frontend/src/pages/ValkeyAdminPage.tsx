import { useEffect, useState } from 'react';
import { Box, Chip, Tab, Tabs, Typography } from '@mui/material';

import KeyBrowserPanel from '@/components/features/valkey/KeyBrowserPanel';
import ClusterInfoPanel from '@/components/features/valkey/ClusterInfoPanel';
import ValkeyAdminService from '@/services/ValkeyAdminService';
import type { ValkeyStatus } from '@/_types/valkey.interface';
import AppConfig from '@/configs/AppConfig';
import { hasPermission } from '@/utils/permissions';
import { tokens } from '@/styles/theme';

type TabValue = 'keys' | 'cluster';

const ValkeyAdminPage = () => {
  const [tab, setTab] = useState<TabValue>('keys');
  const [status, setStatus] = useState<ValkeyStatus | null>(null);

  const canWrite = hasPermission(AppConfig.VALKEY_WRITE_PERMISSION);

  useEffect(() => {
    void ValkeyAdminService.getStatus().then((result) => {
      if (result.data) setStatus(result.data);
    });
  }, []);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Typography variant="h3" component="h1">
          Cache Admin
        </Typography>
        {status && (
          <>
            <Chip
              label={
                status.available ? 'Connected' : status.connected ? 'Unavailable' : 'Not configured'
              }
              color={status.available ? 'success' : 'error'}
              size="small"
            />
            <Chip label={status.mode} size="small" />
            {status.mode === 'cluster' && (
              <Chip
                label={`${status.nodeCount} master${status.nodeCount === 1 ? '' : 's'}`}
                size="small"
              />
            )}
          </>
        )}
      </Box>
      <Typography variant="body1" sx={{ color: tokens.textSubtle, mt: 0.5 }}>
        Browse keys and operate on the Valkey cluster.
        {!canWrite && ' You have read-only access.'}
      </Typography>

      <Box sx={{ mt: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tab} onChange={(_, value) => setTab(value)} aria-label="Cache admin sections">
          <Tab label="Key Browser" value="keys" />
          <Tab label="Cluster Info" value="cluster" />
        </Tabs>
      </Box>

      <Box sx={{ mt: 3 }}>
        {tab === 'keys' ? (
          <KeyBrowserPanel canWrite={canWrite} />
        ) : (
          <ClusterInfoPanel canWrite={canWrite} />
        )}
      </Box>
    </Box>
  );
};

export default ValkeyAdminPage;
