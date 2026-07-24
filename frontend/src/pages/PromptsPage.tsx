import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Box, Tab, Tabs, Typography } from '@mui/material';

import PromptVersionsPanel from '@/components/features/prompts/PromptVersionsPanel';
import { PROMPT_TYPES } from '@/configs/PromptConfig';
import { tokens } from '@/styles/theme';

const PromptsPage = () => {
  const { type } = useParams();
  const navigate = useNavigate();

  const firstType = PROMPT_TYPES[0]?.promptType ?? '';
  const isValidType = !!type && PROMPT_TYPES.some((t) => t.promptType === type);

  if (!isValidType) {
    return <Navigate to={`/prompts/${firstType}`} replace />;
  }

  const activeType = type;

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
          {PROMPT_TYPES.map((promptType) => (
            <Tab
              key={promptType.promptType}
              label={promptType.label}
              value={promptType.promptType}
            />
          ))}
        </Tabs>
      </Box>

      <Box sx={{ mt: 3 }}>
        {PROMPT_TYPES.map((promptType) =>
          promptType.promptType === activeType ? (
            <PromptVersionsPanel
              key={promptType.promptType}
              promptType={promptType.promptType}
            />
          ) : null
        )}
      </Box>
    </Box>
  );
};

export default PromptsPage;
