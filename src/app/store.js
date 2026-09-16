import { configureStore } from "@reduxjs/toolkit";
import accountReducer from "../features/account/accountSlice";
import authReducer from "../features/auth/authSlice";
import helperReducer from "../features/helper/helperSlice";

export const store = configureStore({
  reducer: {
    account: accountReducer,
    auth: authReducer,
    helper: helperReducer
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false
    })
});
