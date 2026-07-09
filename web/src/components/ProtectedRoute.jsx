import { Box, CircularProgress } from '@mui/material';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
export const ProtectedRoute = ({ children }) => {
    const { loading, authenticated, organizations } = useAuth();
    if (loading) {
        return (<Box minHeight="100vh" display="flex" alignItems="center" justifyContent="center">
        <CircularProgress />
      </Box>);
    }
    if (!authenticated) {
        return <Navigate to="/login" replace/>;
    }
    if (organizations.length === 0) {
        return <Navigate to="/login" replace/>;
    }
    return children;
};
