# MCC Choice Helper React Extension

React + Vite version of the Chrome extension popup.

Backend API calls use Axios. Redux stores only auth token/user details; account and choice-helper work runs in pages/hooks with simple async handlers.

## Structure

- `src/app` - Redux store and top-level app bootstrap.
- `src/routes` - popup routes using `HashRouter`, which is safer inside Chrome extensions.
- `src/features/auth` - token/user persistence only.
- `src/pages/DashboardPage.jsx` - account API calls, credit packages, payment order flow.
- `src/hooks/useChoiceHelper.js` - file upload parse, preview, start, pause, resume, stop, skip blocked choice.
- `src/components` - UI split into auth, account, choice, common, and layout components.
- `src/services/apiservices.js` - backend API client and endpoint calls.
- `src/lib/chrome-extension.js` - Chrome storage, tab messaging, content-script injection helpers.
- `public/content.js` - page automation script for MCC choice pages.

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
