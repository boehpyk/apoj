import { ref, computed } from 'vue';

const STORAGE_KEY = 'adminCredentials';

export function useAdminAuth() {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    const credentials = ref(stored ? JSON.parse(stored) : null);

    const isAuthenticated = computed(() => credentials.value !== null);

    function logout() {
        sessionStorage.removeItem(STORAGE_KEY);
        credentials.value = null;
    }

    /**
     * Verifies the password against the backend before storing credentials.
     * Returns true on success, throws on wrong password or network error.
     */
    async function tryLogin(password) {
        const encoded = btoa(`admin:${password}`);
        const res = await fetch('/api/admin/songs', {
            headers: { Authorization: `Basic ${encoded}` }
        });
        if (res.status === 401 || res.status === 403) {
            throw new Error('Wrong password');
        }
        if (!res.ok) {
            throw new Error('Login failed');
        }
        const creds = { username: 'admin', password };
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
        credentials.value = creds;
        return await res.json();
    }

    async function apiFetch(url, options = {}) {
        if (!credentials.value) throw new Error('Not authenticated');
        const encoded = btoa(`${credentials.value.username}:${credentials.value.password}`);
        const headers = { ...options.headers, Authorization: `Basic ${encoded}` };
        const res = await fetch(url, { ...options, headers });
        if (res.status === 401 || res.status === 403) {
            logout();
            throw new Error('Authentication failed');
        }
        return res;
    }

    return { isAuthenticated, credentials, tryLogin, logout, apiFetch };
}
