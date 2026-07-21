import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, Tab, Tabs, Typography } from '@mui/material';

import PromptVersionsPanel from '@/components/features/prompts/PromptVersionsPanel';
import { PROMPT_TYPES } from '@/configs/PromptConfig';
import { tokens } from '@/styles/theme';

const PromptsPage = () => {
  const { type } = useParams();
  const navigate = useNavigate();

  const firstType = PROMPT_TYPES[0]?.promptType ?? '';
  const activeType = PROMPT_TYPES.some((t) => t.promptType === type)
    ? type
    : firstType;

  useEffect(() => {
    if (!type || !PROMPT_TYPES.some((t) => t.promptType === type)) {
      navigate(`/prompts/${firstType}`, { replace: true });
    }
  }, [type, firstType, navigate]);

  const activeLabel = PROMPT_TYPES.find((t) => t.promptType === activeType)?.label ?? 'Prompts';

  const handleTypeChange = (value: string) => {
    navigate(`/prompts/${value}`);
  };

  return (
    <Box>
      <Typography variant="h3" component="h1">
        Prompts – {activeLabel}
      </Typography>
      <Typography variant="body1" sx={{ color: tokens.textSubtle, mt: 0.5 }}>
        Manage AI prompt versions by type.
      </Typography>

      <Box sx={{ mt: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={activeType}
          onChange={(_, value) => handleTypeChange(value)}
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
