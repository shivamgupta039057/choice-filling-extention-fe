# MCC Choice Helper React Extension

React + Vite version of the Chrome extension popup.

Backend API calls use Axios.

## Build

```bash
npm install
npm run build
```

Load this folder in Chrome:

```text
extension-vite/dist
```

## Runtime

Keep backend running:

```bash
cd ../backend
npm run dev
```

The extension popup uses `http://localhost:8080/api` by default.
