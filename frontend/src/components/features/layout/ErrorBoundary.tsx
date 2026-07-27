import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Alert, AlertTitle, Box, Button } from '@mui/material';

interface Props {
  children: ReactNode;
  // Distinguishes boundaries in logs ("app", "dashboard", …).
  scope: string;
  // Changing this value clears a caught error — pass the active tab/route so
  // navigating away from a broken view recovers without a reload.
  resetKey?: unknown;
}

interface State {
  error: Error | null;
}

// A lazy chunk that fails to load (deploy replaced the file, offline) throws a
// module-load error rather than a render error; the copy below covers both.
const isChunkLoadError = (error: Error): boolean =>
  /dynamically imported module|Loading chunk|Importing a module script failed/i.test(error.message);

class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.scope}] render error:`, error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const stale = isChunkLoadError(error);

    return (
      <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
        <Alert
          severity="error"
          sx={{ maxWidth: 560, width: '100%' }}
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => (stale ? window.location.reload() : this.setState({ error: null }))}
            >
              {stale ? 'Reload' : 'Try again'}
            </Button>
          }
        >
          <AlertTitle>{stale ? 'This page is out of date' : 'Something went wrong'}</AlertTitle>
          {stale
            ? 'A newer version of the app has been deployed. Reload to pick it up.'
            : error.message || 'An unexpected error occurred while rendering this view.'}
        </Alert>
      </Box>
    );
  }
}

export default ErrorBoundary;
