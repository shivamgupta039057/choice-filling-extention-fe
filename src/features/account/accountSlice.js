import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import {
  apiBaseUrl,
  createPaymentOrder,
  DEFAULT_API_URL,
  getAccount,
  getCreditPackages
} from "../../services/apiservices";
import { setInStorage } from "../../lib/chrome-extension";
import { STORAGE_KEYS } from "../../constant/localStorageKeys";

const initialState = {
  uploads: [],
  transactions: [],
  packages: [],
  loading: false,
  paymentLoading: false,
  status: ""
};

export const fetchAccount = createAsyncThunk(
  "account/fetch",
  async (_, { getState, rejectWithValue }) => {
    const auth = getState().auth;
    if (!auth.token) return rejectWithValue("auth-expired");

    try {
      const data = await getAccount(auth);
      await setInStorage({
        [STORAGE_KEYS.auth]: {
          apiUrl: auth.apiUrl,
          token: auth.token,
          user: data.user
        }
      });
      return data;
    } catch (error) {
      if ([401, 403].includes(error.status)) {
        await setInStorage({
          [STORAGE_KEYS.auth]: {
            apiUrl: auth.apiUrl,
            token: "",
            user: null
          }
        });
        return rejectWithValue("auth-expired");
      }

      return rejectWithValue(error.message || "Could not refresh account.");
    }
  }
);

export const fetchCreditPackages = createAsyncThunk("account/packages", async (_, { getState }) => {
  const apiUrl = getState().auth?.apiUrl || DEFAULT_API_URL;
  return getCreditPackages(apiUrl);
});

export const createCreditOrder = createAsyncThunk("account/createOrder", async (packageId, { getState }) => {
  const auth = getState().auth;
  if (!auth.token) throw new Error("Login first to renew credits.");

  const order = await createPaymentOrder({ auth, packageId });
  return {
    ...order,
    checkoutUrl: order.checkoutUrl || `${apiBaseUrl(auth.apiUrl)}/api/payments/checkout/${order.orderId}`
  };
});

const accountSlice = createSlice({
  name: "account",
  initialState,
  reducers: {
    clearAccount(state) {
      state.uploads = [];
      state.transactions = [];
      state.status = "";
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAccount.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchAccount.fulfilled, (state, action) => {
        state.loading = false;
        state.uploads = Array.isArray(action.payload.uploads) ? action.payload.uploads : [];
        state.transactions = Array.isArray(action.payload.transactions) ? action.payload.transactions : [];
      })
      .addCase(fetchAccount.rejected, (state) => {
        state.loading = false;
      })
      .addCase(fetchCreditPackages.fulfilled, (state, action) => {
        state.packages = Array.isArray(action.payload) ? action.payload : [];
      })
      .addCase(createCreditOrder.pending, (state) => {
        state.paymentLoading = true;
        state.status = "Creating payment order...";
      })
      .addCase(createCreditOrder.fulfilled, (state) => {
        state.paymentLoading = false;
        state.status = "Payment opened in a new tab. Click Refresh after payment.";
      })
      .addCase(createCreditOrder.rejected, (state, action) => {
        state.paymentLoading = false;
        state.status = action.error.message || "Could not create payment order.";
      });
  }
});

export const { clearAccount } = accountSlice.actions;

export default accountSlice.reducer;
