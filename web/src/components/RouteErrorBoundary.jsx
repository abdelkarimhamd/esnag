import { Alert, Box, Button, Paper, Stack, Typography } from '@mui/material';
import React from 'react';

class RouteErrorBoundaryClass extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, message: '' };
    }
    static getDerivedStateFromError(error) {
        return {
            hasError: true,
            message: error instanceof Error && error.message ? error.message : 'Unexpected rendering error.',
        };
    }
    componentDidCatch(error) {
        console.error('Route rendering error', error);
    }
    render() {
        if (!this.state.hasError) {
            return this.props.children;
        }
        return (<Paper sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Box>
            <Typography variant="h5">Something went wrong</Typography>
            <Typography color="text.secondary">
              The page could not be rendered safely. You can retry or return to projects.
            </Typography>
          </Box>
          <Alert severity="error">{this.state.message}</Alert>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={() => window.location.reload()}>
              Retry
            </Button>
            <Button variant="outlined" href="/projects">
              Projects
            </Button>
          </Stack>
        </Stack>
      </Paper>);
    }
}
export const RouteErrorBoundary = ({ children }) => <RouteErrorBoundaryClass>{children}</RouteErrorBoundaryClass>;
