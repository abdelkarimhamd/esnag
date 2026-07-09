import { Box, Paper, Stack, Typography } from '@mui/material';
const toneStyles = {
    primary: { bar: '#24488F', glow: 'rgba(36, 72, 143, 0.12)' },
    secondary: { bar: '#2F8FBE', glow: 'rgba(47, 143, 190, 0.12)' },
    success: { bar: '#7A933D', glow: 'rgba(122, 147, 61, 0.12)' },
    warning: { bar: '#C08A23', glow: 'rgba(192, 138, 35, 0.12)' },
    neutral: { bar: '#5F7398', glow: 'rgba(95, 115, 152, 0.12)' },
};
export const StatCard = ({ label, value, hint, icon, tone = 'primary' }) => {
    const style = toneStyles[tone];
    return (<Paper sx={{
            p: 1.8,
            borderRadius: 3,
            position: 'relative',
            overflow: 'hidden',
            '&::before': {
                content: '""',
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: 4,
                backgroundColor: style.bar,
            },
        }}>
      <Stack spacing={0.8}>
        <Box display="flex" alignItems="center" justifyContent="space-between" gap={1}>
          <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ letterSpacing: '0.04em' }}>
            {label}
          </Typography>
          {icon}
        </Box>

        <Typography variant="h4" sx={{ lineHeight: 1.1 }}>
          {value}
        </Typography>

        {hint && (<Typography variant="body2" color="text.secondary" sx={{ backgroundColor: style.glow, px: 1, py: 0.4, borderRadius: 1.5 }}>
            {hint}
          </Typography>)}
      </Stack>
    </Paper>);
};
