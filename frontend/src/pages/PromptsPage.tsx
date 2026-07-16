import { useState } from 'react';
import { Box, Tab, Tabs, Typography } from '@mui/material';

import PromptVersionsPanel from '@/components/features/prompts/PromptVersionsPanel';
import { PROMPT_TYPES } from '@/configs/PromptConfig';
import { tokens } from '@/styles/theme';

const PromptsPage = () => {
  const [activeType, setActiveType] = useState(PROMPT_TYPES[0]?.promptType ?? '');

  return (
    <Box>
      <Typography variant="h3" component="h1">
        Prompts – Segmentation
      </Typography>
      <Typography variant="body1" sx={{ color: tokens.textSubtle, mt: 0.5 }}>
        Manage AI prompt versions by type.
      </Typography>

      <Box sx={{ mt: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={activeType}
          onChange={(_, value) => setActiveType(value)}
          aria-label="Prompt types"
        >
          {PROMPT_TYPES.map((type) => (
            <Tab
              key={type.promptType}
              label={type.label}
              value={type.promptType}
            />
          ))}
        </Tabs>
      </Box>

      <Box sx={{ mt: 3 }}>
        {PROMPT_TYPES.map((type) =>
          type.promptType === activeType ? (
            <PromptVersionsPanel
              key={type.promptType}
              promptType={type.promptType}
            />
          ) : null
        )}
      </Box>
    </Box>
  );
};

export default PromptsPage;
