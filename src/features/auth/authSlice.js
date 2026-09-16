import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import { fetchAccount } from "../account/accountSlice";
import { cleanApiUrl, DEFAULT_API_URL, loginUser, signupUser } from "../../services/apiservices";
import { getFromStorage, setInStorage } from "../../lib/chrome-extension";
import { STORAGE_KEYS } from "../../constant/localStorageKeys";

const emptyAuth = {
  apiUrl: DEFAULT_API_URL,
  token: "",
  user: null
};

const initialState = {
  ...emptyAuth,
  initialized: false,
  loading: false,
  status: "Login with your extension account."
};

export const restoreAuth = createAsyncThunk("auth/restore", async () => {
  const data = await getFromStorage(STORAGE_KEYS.auth);
  const saved = data[STORAGE_KEYS.auth] || {};

  return {
    apiUrl: cleanApiUrl(DEFAULT_API_URL),
    token: saved.token || "",
    user: saved.user || null
  };
});

export const login = createAsyncThunk("auth/login", async ({ email, password }) => {
  const apiUrl = cleanApiUrl(DEFAULT_API_URL);
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedEmail || !password) {
    throw new Error("Enter email and password.");
  }

  const data = await loginUser({
    apiUrl,
    email: normalizedEmail,
    password
  });

  const auth = { apiUrl, token: data.token, user: data.user };
  await setInStorage({ [STORAGE_KEYS.auth]: auth });
  return auth;
});

export const signup = createAsyncThunk("auth/signup", async ({ email, password }) => {
  const apiUrl = cleanApiUrl(DEFAULT_API_URL);
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedEmail || !password) {
    throw new Error("Enter email and password.");
  }

  const data = await signupUser({
    apiUrl,
    email: normalizedEmail,
    password
  });

  const auth = { apiUrl, token: data.token, user: data.user };
  await setInStorage({ [STORAGE_KEYS.auth]: auth });
  return auth;
});

export const logout = createAsyncThunk("auth/logout", async () => {
  const auth = { apiUrl: cleanApiUrl(DEFAULT_API_URL), token: "", user: null };
  await setInStorage({ [STORAGE_KEYS.auth]: auth });
  return auth;
});

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setAuthStatus(state, action) {
      state.status = action.payload;
    },
    setAuthenticatedUser(state, action) {
      state.user = action.payload;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(restoreAuth.fulfilled, (state, action) => {
        state.apiUrl = action.payload.apiUrl;
        state.token = action.payload.token;
        state.user = action.payload.user;
        state.initialized = true;
        state.status = action.payload.token
          ? `Logged in as ${action.payload.user?.email || "user"}.`
          : "Login with your extension account.";
      })
      .addCase(restoreAuth.rejected, (state) => {
        state.initialized = true;
        state.status = "Login with your extension account.";
      })
      .addCase(login.pending, (state) => {
        state.loading = true;
        state.status = "Logging in...";
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false;
        state.apiUrl = action.payload.apiUrl;
        state.token = action.payload.token;
        state.user = action.payload.user;
        state.status = `Logged in as ${action.payload.user.email}.`;
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.status = action.error.message || "Login failed.";
      })
      .addCase(signup.pending, (state) => {
        state.loading = true;
        state.status = "Creating account...";
      })
      .addCase(signup.fulfilled, (state, action) => {
        state.loading = false;
        state.apiUrl = action.payload.apiUrl;
        state.token = action.payload.token;
        state.user = action.payload.user;
        state.status = `Account created for ${action.payload.user.email}.`;
      })
      .addCase(signup.rejected, (state, action) => {
        state.loading = false;
        state.status = action.error.message || "Signup failed.";
      })
      .addCase(logout.fulfilled, (state, action) => {
        state.apiUrl = action.payload.apiUrl;
        state.token = "";
        state.user = null;
        state.status = "Login with your extension account.";
      })
      .addCase(fetchAccount.fulfilled, (state, action) => {
        if (action.payload.user) {
          state.user = action.payload.user;
          state.status = `Logged in as ${action.payload.user.email}.`;
        }
      })
      .addCase(fetchAccount.rejected, (state, action) => {
        if (state.token && action.payload === "auth-expired") {
          state.token = "";
          state.user = null;
          state.status = "Login expired. Login again.";
        }
      });
  }
});

export const { setAuthenticatedUser, setAuthStatus } = authSlice.actions;

export default authSlice.reducer;
