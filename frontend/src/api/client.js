import axios from 'axios';

// Always use same-origin relative URLs. In production the backend serves the
// built app, so "/api/..." hits the same host. In dev, Vite proxies "/api" and
// "/uploads" to the local backend (see vite.config.js). Only set VITE_API_URL
// if the API genuinely lives on a different origin — do NOT set it to localhost
// for production, or that value gets baked into the build.
const baseURL = import.meta.env.VITE_API_URL ?? '';

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
