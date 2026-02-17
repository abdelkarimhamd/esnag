import { Alert, Box, Button, Paper, Stack, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'

interface ForbiddenPageProps {
  title?: string
  message?: string
}

export const ForbiddenPage = ({
  title = 'Access Restricted',
  message = 'You do not have permission to access this section.',
}: ForbiddenPageProps) => (
  <Paper sx={{ p: 3 }}>
    <Stack spacing={2}>
      <Box>
        <Typography variant="h5">{title}</Typography>
        <Typography color="text.secondary">
          Contact your administrator if you need this access granted for your role.
        </Typography>
      </Box>

      <Alert severity="warning">{message}</Alert>

      <Box>
        <Button component={RouterLink} to="/projects" variant="contained">
          Back to Projects
        </Button>
      </Box>
    </Stack>
  </Paper>
)
