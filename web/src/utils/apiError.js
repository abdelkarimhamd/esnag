const extractRequestId = (error) => {
    if (!(typeof error === 'object' && error && 'response' in error)) {
        return null;
    }
    const response = error.response;
    const fromBody = response?.data?.request_id;
    if (typeof fromBody === 'string' && fromBody.trim() !== '') {
        return fromBody;
    }
    const fromHeader = response?.headers?.['x-request-id'];
    if (typeof fromHeader === 'string' && fromHeader.trim() !== '') {
        return fromHeader;
    }
    return null;
};
const resolveFieldErrors = (error) => {
    if (!(typeof error === 'object' && error && 'response' in error)) {
        return {};
    }

    const response = error.response;
    const errors = response?.data?.errors;
    if (!errors || typeof errors !== 'object') {
        return {};
    }

    return errors;
};
const appendReference = (message, requestId) => {
    if (!requestId) {
        return message;
    }

    return `${message} (Ref: ${requestId})`;
};
export const normalizeApiError = (error, fallback) => {
    const requestId = extractRequestId(error);
    const fieldErrors = resolveFieldErrors(error);
    const status = typeof error === 'object' && error && 'response' in error
        ? (error.response?.status ?? null)
        : null;
    const code = typeof error === 'object' && error && 'response' in error
        ? (typeof error.response?.data?.code === 'string' ? error.response.data.code : null)
        : null;
    const hint = typeof error === 'object' && error && 'response' in error
        ? (typeof error.response?.data?.hint === 'string' ? error.response.data.hint : null)
        : null;
    const action = typeof error === 'object' && error && 'response' in error
        ? (typeof error.response?.data?.action === 'string' ? error.response.data.action : null)
        : null;

    if (typeof error === 'object' && error && 'response' in error) {
        const response = error.response;
        const firstError = Object.values(fieldErrors).flat().at(0);
        if (firstError && typeof firstError === 'string') {
            return {
                message: appendReference(firstError, requestId),
                fieldErrors,
                requestId,
                status,
                code,
                hint,
                action,
            };
        }

        if (response?.data?.message) {
            return {
                message: appendReference(response.data.message, requestId),
                fieldErrors,
                requestId,
                status,
                code,
                hint,
                action,
            };
        }
    }

    if (error instanceof Error && error.message.trim() !== '') {
        return {
            message: appendReference(error.message, requestId),
            fieldErrors,
            requestId,
            status,
            code,
            hint,
            action,
        };
    }

    return {
        message: appendReference(fallback, requestId),
        fieldErrors,
        requestId,
        status,
        code,
        hint,
        action,
    };
};
export const parseApiError = (error, fallback) => {
    return normalizeApiError(error, fallback).message;
};
export const isApiStatus = (error, status) => {
    if (typeof error === 'object' && error && 'response' in error) {
        const responseStatus = error.response?.status;
        return responseStatus === status;
    }
    return false;
};
