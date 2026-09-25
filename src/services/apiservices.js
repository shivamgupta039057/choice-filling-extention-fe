import axios from "axios";
import { API_ENDPOINTS } from "../constant/apiendpoints";

export const DEFAULT_API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080/api";

export const cleanApiUrl = (value) => String(value || DEFAULT_API_URL).replace(/\/+$/, "");

export const apiBaseUrl = (apiUrl) => cleanApiUrl(apiUrl).replace(/\/api$/, "");

const buildApiError = (response) => {
  const message = response.status === 402
    ? "No credits left. Renew credits from the extension."
    : response.data?.error || response.data?.message || "Backend request failed.";

  const error = new Error(message);
  error.status = response.status;
  error.data = response.data;
  return error;
};

export const createApiClient = ({ apiUrl = DEFAULT_API_URL, token = "" } = {}) => {
  const client = axios.create({
    baseURL: cleanApiUrl(apiUrl),
    validateStatus: () => true
  });

  client.interceptors.request.use((config) => {
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  client.interceptors.response.use((response) => {
    if (response.status < 400 && response.data?.success !== false) {
      return response;
    }

    throw buildApiError(response);
  });

  return client;
};

export const Apiservice = {
  get: (endpoint, apiUrl = DEFAULT_API_URL) => createApiClient({ apiUrl }).get(endpoint),

  getAuth: (endpoint, token, apiUrl = DEFAULT_API_URL) =>
    createApiClient({ apiUrl, token }).get(endpoint),

  post: (endpoint, body, apiUrl = DEFAULT_API_URL) =>
    createApiClient({ apiUrl }).post(endpoint, body),

  postAuth: (endpoint, body, token, apiUrl = DEFAULT_API_URL) =>
    createApiClient({ apiUrl, token }).post(endpoint, body),

  patchAuth: (endpoint, body, token, apiUrl = DEFAULT_API_URL) =>
    createApiClient({ apiUrl, token }).patch(endpoint, body),

  postAPIAuthFormData: (endpoint, body, token, apiUrl = DEFAULT_API_URL) =>
    createApiClient({ apiUrl, token }).post(endpoint, body),

  postAPI: (endpoint, body, apiUrl = DEFAULT_API_URL) =>
    createApiClient({ apiUrl }).post(endpoint, body)
};

export const loginUser = async ({ apiUrl, email, password }) => {
  const { data } = await Apiservice.post(API_ENDPOINTS.auth.login, {
    email,
    password
  }, apiUrl);

  return data;
};

export const signupUser = async ({ apiUrl, email, password }) => {
  const { data } = await Apiservice.post(API_ENDPOINTS.auth.signup, {
    email,
    password
  }, apiUrl);

  return data;
};

export const getAccount = async (auth) => {
  const { data } = await Apiservice.getAuth(API_ENDPOINTS.user.me, auth.token, auth.apiUrl);
  return data;
};

export const getCreditPackages = async (apiUrl) => {
  const { data } = await Apiservice.get(API_ENDPOINTS.payments.packages, apiUrl);
  return Array.isArray(data?.packages) ? data.packages : [];
};

export const createPaymentOrder = async ({ auth, packageId }) => {
  const { data } = await Apiservice.postAuth(
    API_ENDPOINTS.payments.orders,
    { packageId },
    auth.token,
    auth.apiUrl
  );

  return data;
};

export const parsePriorityFile = async ({ auth, file, sheet, headerRow, column, programColumn, candidateRoll, candidateName }) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("sheet", sheet || "");
  formData.append("headerRow", headerRow || "1");
  formData.append("column", column || "");
  formData.append("programColumn", programColumn || "");
  formData.append("candidateRoll", candidateRoll || "");
  formData.append("candidateName", candidateName || "");

  const { data } = await Apiservice.postAPIAuthFormData(
    API_ENDPOINTS.uploads.parse,
    formData,
    auth.token,
    auth.apiUrl
  );

  return data;
};
