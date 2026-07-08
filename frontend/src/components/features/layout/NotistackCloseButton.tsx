import { IconButton } from '@mui/material';
import { Close } from '@mui/icons-material';
import { closeSnackbar, SnackbarKey } from 'notistack';

interface NotistackCloseButtonProps {
  snackbarKey: SnackbarKey;
}

const NotistackCloseButton = ({ snackbarKey }: NotistackCloseButtonProps) => (
  <IconButton
    onClick={() => closeSnackbar(snackbarKey)}
    size="small"
    color="inherit"
  >
    <Close fontSize="small" />
  </IconButton>
);

export default NotistackCloseButton;
