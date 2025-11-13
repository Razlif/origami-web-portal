import axios from 'axios';

let authToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export const setApiToken = (token: string | null) => {
  authToken = token;
};

export const registerUnauthorizedHandler = (handler: () => void) => {
  unauthorizedHandler = handler;
};

export const api = axios.create({
  baseURL: '/api',
  timeout: 15000
});

api.interceptors.request.use((config) => {
  if (authToken) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof unauthorizedHandler === 'function') {
      unauthorizedHandler();
    }
    const message = error.response?.data?.message || error.message;
    console.error('API error', message);
    return Promise.reject(error);
  }
);

export default api;
