import { Box, type SxProps, type Theme } from '@mui/material'

interface BrandLogoProps {
  sx?: SxProps<Theme>
}

export const BrandLogo = ({ sx }: BrandLogoProps) => (
  <Box
    component="img"
    src="/morgantilogo.png"
    alt="Morganit GCC"
    sx={{
      display: 'block',
      width: '100%',
      height: 'auto',
      objectFit: 'contain',
      ...sx,
    }}
  />
)
