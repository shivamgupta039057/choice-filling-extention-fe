# MCC Choice Helper React Extension

React + Vite version of the Chrome extension popup.

Backend API calls use Axios. Auth token/user, account data, and choice-helper state are managed with Redux Toolkit.

## Structure

- `src/app` - Redux store and top-level app bootstrap.
- `src/routes` - popup routes using `HashRouter`, which is safer inside Chrome extensions.
- `src/features/auth` - login, signup, logout, token/user persistence.
- `src/features/account` - `/api/me`, credits, upload history, payment order flow.
- `src/features/helper` - file upload parse, preview, start, pause, resume, stop, skip blocked choice.
- `src/components` - UI split into auth, account, choice, common, and layout components.
- `src/services/apiservices.js` - backend API client and endpoint calls.
- `src/lib/chrome-extension.js` - Chrome storage, tab messaging, content-script injection helpers.
- `public/content.js` - page automation script for MCC/Rajasthan choice pages.

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
