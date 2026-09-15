import axios from "axios";
import toast from "react-hot-toast";



const baseurl = "https://api.nutsfresco.com/api/v1";
export const imgBaseUrl = "https://api.nutsfresco.com";

console.log("baseurl", baseurl);

export const Apiservice = {
    get: async (endpoint) => {
        try {
            const res = await axios.get(baseurl + endpoint);

            if (res.data.success === false) {
                toast.error(res.data.message);
                return res;
            }

            return res;
        } catch (error) {
            toast.error(error?.message);
        }
    },

    getAuth: async (endpoint, token) => {
        try {
            const res = await axios.get(baseurl + endpoint, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (res.data.success === false) {
                toast.error(res.data.message);
                return res;
            }

            return res;
        } catch (error) {
            throw error;
        }
    },

    post: async (endpoint, body) => {
        try {
            const res = await axios.post(baseurl + endpoint, body);

            if (res.data.success === false) {
                toast.error(res.data.message);
                return res;
            }

            return res;
        } catch (error) {
            toast.error(
                error?.response?.data?.message || error?.message
            );

            return undefined;
        }
    },

    postAuth: async (endpoint, body, token) => {
        try {
            const res = await axios.post(
                baseurl + endpoint,
                body,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            console.log(
                "ffffffffffresresresresres",
                res
            );

            if (res.data.success === false) {
                return res;
            }

            toast.success(res.data.message);

            return res;
        } catch (error) {
            throw error;
        }
    },

    patchAuth: async (endpoint, body, token) => {
        try {
            const res = await axios.patch(
                baseurl + endpoint,
                body,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            if (res.data.success === false) {
                return res;
            }

            toast.success(res.data.message);

            return res;
        } catch (error) {
            throw error;
        }
    },

    postAPIAuthFormData: async (endpoint, body, token) => {
        try {
            const res = await axios.post(
                baseurl + endpoint,
                body,
                {
                    headers: {
                        "Content-Type": "multipart/form-data",
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            if (res.data.success === false) {
                toast.error(res.data.message);
                return res;
            }

            return res;
        } catch (error) {
            throw error;
        }
    },

    postAPI: async (endpoint, body) => {
        try {
            const res = await axios.post(
                "https://ecommerce.imgglobal.in/backend/" + endpoint,
                body
            );

            if (res.data.success === false) {
                toast.error(res.data.message);
                return res;
            }

            return res;
        } catch (error) {
            toast.error(error?.message);
        }
    },
};