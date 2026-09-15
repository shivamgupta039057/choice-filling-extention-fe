import axios from "axios";

export const DEFAULT_API_URL = "http://localhost:8080/api";

export const cleanApiUrl = (value) => String(value || DEFAULT_API_URL).replace(/\/+$/, "");

export const apiBaseUrl = (apiUrl) => cleanApiUrl(apiUrl).replace(/\/api$/, "");

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
    if (response.status < 400) return response;

    const message = response.status === 402
      ? "No credits left. Renew credits from the extension."
      : response.data?.error || "Backend request failed.";

    return Promise.reject(new Error(message));
  });

  return client;
};

export const loginUser = async ({ apiUrl, email, password }) => {
  const { data } = await createApiClient({ apiUrl }).post("/auth/login", {
    email,
    password
  });

  return data;
};

export const getAccount = async (auth) => {
  const { data } = await createApiClient(auth).get("/me");
  return data;
};

export const getCreditPackages = async (apiUrl) => {
  const { data } = await createApiClient({ apiUrl }).get("/payments/packages");
  return Array.isArray(data?.packages) ? data.packages : [];
};

export const createPaymentOrder = async ({ auth, packageId }) => {
  const { data } = await createApiClient(auth).post("/payments/orders", { packageId });
  return data;
};

export const parsePriorityFile = async ({ auth, file, sheet, headerRow, column, programColumn }) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("sheet", sheet || "");
  formData.append("headerRow", headerRow || "1");
  formData.append("column", column || "");
  formData.append("programColumn", programColumn || "");

  const { data } = await createApiClient(auth).post("/uploads/parse", formData);
  return data;
};
