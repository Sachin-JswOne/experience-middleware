import { useState } from 'react';
import { useSnackbar } from 'notistack';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
} from '@mui/material';

import PromptService, { IPromptCreatePayload } from '@/services/PromptService';
import LocalStorage from '@/utils/LocalStorage';
import type { ILooseObject } from '@/_types/common.interface';

interface AddPromptDialogProps {
  open: boolean;
  promptType: string;
  onClose: () => void;
  onCreated: () => void;
}

const AddPromptDialog = ({ open, promptType, onClose, onCreated }: AddPromptDialogProps) => {
  const { enqueueSnackbar } = useSnackbar();
  const [prompt, setPrompt] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = prompt.trim().length > 0 && description.trim().length > 0;
  const userInfo: ILooseObject | undefined = LocalStorage.getItem('userInfo');
  const handleClose = (_event: object, reason: 'backdropClick' | 'escapeKeyDown') => {
    if (submitting && reason === 'backdropClick') return;
    onClose();
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    const payload: IPromptCreatePayload = {
      promptType: promptType,
      prompt: prompt.trim(),
      description: description.trim(),
      createdBy: userInfo?.email,
      activate: true
    };
    const result = await PromptService.createPrompt(promptType, payload);
    if (result.error.message || result.error.code) {
      enqueueSnackbar(result.error.message || 'Failed to create prompt', { variant: 'error' });
    } else {
      enqueueSnackbar('Prompt created successfully', { variant: 'success' });
      setPrompt('');
      setDescription('');
      onCreated();
    }
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Add Prompt Version</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            required
            disabled={submitting}
          />
          <TextField
            label="Prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            multiline
            minRows={12}
            fullWidth
            required
            disabled={submitting}
            inputProps={{
              style: { fontFamily: 'monospace', fontSize: '13px' },
            }}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={!canSubmit || submitting}
        >
          {submitting ? 'Saving…' : 'Submit'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddPromptDialog;
