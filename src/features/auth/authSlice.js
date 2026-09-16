import { createSlice } from "@reduxjs/toolkit";
import localStorageKeys from "../../constant/localStorageKeys";
import { cleanApiUrl, DEFAULT_API_URL } from "../../services/apiservices";

const readSavedUser = () => {
  try {
    return JSON.parse(localStorage.getItem(localStorageKeys.user) || "null");
  } catch {
    return null;
  }
};

const initialState = {
  apiUrl: cleanApiUrl(DEFAULT_API_URL),
  token: localStorage.getItem(localStorageKeys.token) || "",
  user: readSavedUser(),
  initialized: true,
  status: "Login with your extension account."
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setAuth(state, action) {
      state.token = action.payload.token || "";
      state.user = action.payload.user || null;
      state.apiUrl = cleanApiUrl(DEFAULT_API_URL);
      state.status = state.user?.email ? `Logged in as ${state.user.email}.` : "Logged in.";
    },
    setAuthenticatedUser(state, action) {
      state.user = action.payload || null;
    },
    setAuthStatus(state, action) {
      state.status = action.payload;
    },
    clearAuth(state) {
      state.token = "";
      state.user = null;
      state.apiUrl = cleanApiUrl(DEFAULT_API_URL);
      state.status = "Login with your extension account.";
    }
  }
});

export const saveAuth = ({ token, user }) => {
  localStorage.setItem(localStorageKeys.token, token || "");
  localStorage.setItem(localStorageKeys.user, JSON.stringify(user || null));
};

export const removeAuth = () => {
  localStorage.removeItem(localStorageKeys.token);
  localStorage.removeItem(localStorageKeys.user);
};

export const { clearAuth, setAuth, setAuthenticatedUser, setAuthStatus } = authSlice.actions;

export default authSlice.reducer;
