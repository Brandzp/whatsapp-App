import axios from 'axios';

// In production the API is served from the same origin as the built app, so use
// relative URLs. In dev the Vite server (5173) talks to the backend on 4000.
// Override with VITE_API_URL if the API lives elsewhere.
const baseURL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:4000' : '');

const api = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('wa_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !location.pathname.startsWith('/login')) {
      localStorage.removeItem('wa_token');
      location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
