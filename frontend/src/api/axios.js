import axios from "axios";

// One place for the backend URL — set REACT_APP_API_URL in a .env file
// before deploying so this doesn't need editing across every page that
// calls the API. Falls back to the local dev server when unset.
// Exported so the handful of pages that build their own axios/fetch calls
// (instead of using the shared `API` instance below) can still point at the
// right backend instead of hardcoding localhost.
export const API_URL =
  process.env.REACT_APP_API_URL || "http://localhost:5000/api";

const API = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Attaches the stored token automatically — callers never need to build
// the Authorization header by hand.
API.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// An expired/invalid token gets the same "you're signed out" experience
// everywhere instead of each page separately guessing what a 401 means.
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("role");
      localStorage.removeItem("userInfo");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);

export default API;
