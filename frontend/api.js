// API_BASE_URL is injected at build time via frontend/config.js (set by Vercel env var BACKEND_URL).
// Falls back to localhost:3000 for local development.
const API_BASE_URL = (typeof window !== 'undefined' && window.ENV_BACKEND_URL && window.ENV_BACKEND_URL !== 'PLACEHOLDER_BACKEND_URL')
  ? window.ENV_BACKEND_URL
  : 'http://localhost:3000';

const api = {
    // Helper to get the auth token
    getToken: () => localStorage.getItem('admin_token'),

    // Helper to set the auth token
    setToken: (token) => localStorage.setItem('admin_token', token),

    // Helper to remove the auth token
    removeToken: () => localStorage.removeItem('admin_token'),

    // Generic request handler
    request: async (endpoint, method = 'GET', body = null) => {
        const headers = {
            'Content-Type': 'application/json',
        };

        const token = api.getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const config = {
            method,
            headers,
        };

        if (body) {
            config.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
            
            // Handle 401 Unauthorized (Token expired or invalid)
            // Skip redirect if we are logging in (endpoint is /admin-login)
            if (response.status === 401 && endpoint !== '/admin-login') {
                api.removeToken();
                window.location.href = 'login.html';
                return;
            }

            // Handle 204 No Content
            if (response.status === 204) {
                return null;
            }

            const text = await response.text();
            const data = text ? JSON.parse(text) : {};

            if (!response.ok) {
                throw new Error(data.error || 'Something went wrong');
            }

            return data;
        } catch (error) {
            console.error('API Request Error:', error);
            throw error;
        }
    },

    // Specific API methods
    sendMagicLink: (email) => api.request('/send-magic-link', 'POST', { email }),
    verifyAdmin: () => api.request('/verify-admin'),
    
    // OTP methods
    sendOtp: (email) => api.request('/send-magic-link', 'POST', { email }), // Uses same endpoint as magic link
    verifyOtp: (email, token) => api.request('/verify-otp', 'POST', { email, token }),
    
    // File upload
    uploadFile: async (file) => {
        const formData = new FormData();
        formData.append('file', file);

        const token = api.getToken();
        const headers = {};
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/upload`, {
                method: 'POST',
                headers,
                body: formData
            });

            if (response.status === 401) {
                api.removeToken();
                window.location.href = 'login.html';
                return;
            }

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Upload failed');
            }
            return data;
        } catch (error) {
            console.error('Upload error:', error);
            throw error;
        }
    },
    
    getAnalytics: () => api.request('/analytics/totals'),
    
    getProducts: () => api.request('/products'),
    createProduct: (productData) => api.request('/products', 'POST', productData),
    updateProduct: (id, productData) => api.request(`/products/${id}`, 'PUT', productData),
    deleteProduct: (id) => api.request(`/products/${id}`, 'DELETE'),

    getUsers: () => api.request('/users'),
    createUser: (userData) => api.request('/users', 'POST', userData),
    updateUser: (id, userData) => api.request(`/users/${id}`, 'PUT', userData),
    deleteUser: (id) => api.request(`/users/${id}`, 'DELETE'),

    getOffers: () => api.request('/offers'),
    createOffer: (offerData) => api.request('/offers', 'POST', offerData),
    updateOffer: (id, offerData) => api.request(`/offers/${id}`, 'PUT', offerData),
    deleteOffer: (id) => api.request(`/offers/${id}`, 'DELETE'),

    getActivityLogs: () => api.request('/activity-logs'),
    logActivity: (logData) => api.request('/activity-logs', 'POST', logData),
    getTransactions: () => api.request('/transactions'),
    
    // Search
    search: (query) => api.request(`/search?q=${encodeURIComponent(query)}`),
};
