import { Box } from '@mui/material';
export const BrandLogo = ({ sx }) => (<Box component="img" src="/morgantilogo.png" alt="Morganit GCC" sx={{
        display: 'block',
        width: '100%',
        height: 'auto',
        objectFit: 'contain',
        ...sx,
    }}/>);
