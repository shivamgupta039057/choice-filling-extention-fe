export const API_ENDPOINTS = {
  auth: {
    login: "/auth/login",
    signup: "/auth/signup"
  },
  user: {
    me: "/me"
  },
  uploads: {
    parse: "/uploads/parse"
  },
  payments: {
    packages: "/payments/packages",
    orders: "/payments/orders",
    orderStatus: (orderId) => `/payments/orders/${orderId}/status`
  }
};

export const apiEndPoints = API_ENDPOINTS;
