/**
 * Safe Storage Helper
 * Provides a safe wrapper around localStorage to handle environments where
 * storage might be disabled or blocked.
 */
export const SafeStorage = {
    getItem(key) {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            // SEC: Fail securely if storage is disabled/blocked (e.g. privacy settings)
            return null;
        }
    },
    setItem(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (e) {
            // SEC: Fail securely if storage is disabled/blocked
            console.warn('Storage write error:', e);
        }
    }
};
