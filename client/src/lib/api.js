import axios from 'axios';

const getBaseURL = () => {
  let url = import.meta.env.VITE_API_URL || '/api';
  if (
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:' &&
    url.startsWith('http://')
  ) {
    url = url.replace(/^http:\/\//i, 'https://');
  }
  return url;
};

const api = axios.create({ baseURL: getBaseURL() });

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    if (config.baseURL && config.baseURL.startsWith('http://')) {
      config.baseURL = config.baseURL.replace(/^http:\/\//i, 'https://');
    }
    if (config.url && config.url.startsWith('http://')) {
      config.url = config.url.replace(/^http:\/\//i, 'https://');
    }
  }
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url || '';
    const isAuthCall = url.startsWith('/auth/login') || url.startsWith('/auth/register');
    if (err.response?.status === 401 && !isAuthCall) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const uploadMedia = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await api.post('/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};

export const errorMessage = (err) =>
  err.response?.data?.message || 'Something went wrong. Please try again.';

export default api;
