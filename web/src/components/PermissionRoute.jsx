import { useAuth } from '../hooks/useAuth';
import { ForbiddenPage } from '../pages/ForbiddenPage';
import { hasAnyPermission } from '../utils/permissions';
export const PermissionRoute = ({ children, requiredAny }) => {
    const { permissions } = useAuth();
    if (!hasAnyPermission(permissions, requiredAny)) {
        return <ForbiddenPage message={`You need one of these permissions: ${requiredAny.join(', ')}`} />;
    }
    return children;
};
