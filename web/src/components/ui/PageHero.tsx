import { Box, Paper, Stack, Typography } from '@mui/material'
import type { ReactNode } from 'react'

interface PageHeroProps {
  title: string
  description?: ReactNode
  actions?: ReactNode
  badges?: ReactNode
}

export const PageHero = ({ title, description, actions, badges }: PageHeroProps) => (
  <Paper
    sx={{
      p: { xs: 2, md: 2.6 },
      borderRadius: 3,
      position: 'relative',
      overflow: 'hidden',
      color: '#FFFFFF',
      border: '1px solid rgba(255,255,255,0.2)',
      background: 'linear-gradient(132deg, #24488F 0%, #2F8FBE 58%, #7A933D 100%)',
      boxShadow: '0 20px 34px rgba(36, 72, 143, 0.28)',
      '&::after': {
        content: '""',
        position: 'absolute',
        inset: 0,
        background:
          'radial-gradient(circle at 20% -10%, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0) 45%), radial-gradient(circle at 100% 0%, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0) 38%)',
        pointerEvents: 'none',
      },
    }}
  >
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      justifyContent="space-between"
      alignItems={{ xs: 'flex-start', md: 'center' }}
      gap={1.8}
      sx={{ position: 'relative', zIndex: 1 }}
    >
      <Box>
        <Typography variant="h4" sx={{ color: '#FFFFFF' }}>
          {title}
        </Typography>
        {description && (
          <Typography sx={{ mt: 0.6, color: 'rgba(255,255,255,0.92)' }}>
            {description}
          </Typography>
        )}
      </Box>

      {actions && <Box>{actions}</Box>}
    </Stack>

    {badges && (
      <Box sx={{ mt: 1.4, position: 'relative', zIndex: 1 }}>
        {badges}
      </Box>
    )}
  </Paper>
)
