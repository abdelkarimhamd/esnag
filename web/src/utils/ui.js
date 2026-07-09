const tokenToLabel = (token) => token
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
export const formatStatusLabel = (status) => tokenToLabel(status);
export const formatPriorityLabel = (priority) => tokenToLabel(priority);
export const snagStatusChipColor = (status) => {
    if (status === 'closed') {
        return 'success';
    }
    if (status === 'rejected') {
        return 'error';
    }
    if (status === 'ready_for_review') {
        return 'warning';
    }
    if (status === 'in_progress') {
        return 'secondary';
    }
    if (status === 'assigned') {
        return 'primary';
    }
    return 'default';
};
export const snagPriorityChipColor = (priority) => {
    if (priority === 'critical') {
        return 'error';
    }
    if (priority === 'high') {
        return 'warning';
    }
    if (priority === 'medium') {
        return 'secondary';
    }
    return 'default';
};
