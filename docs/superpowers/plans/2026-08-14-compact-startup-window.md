# Compact Startup Window Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the oversized loading view with an exact 520 x 220 frameless startup window that has no scrollbars and provides custom minimize and immediate-exit controls.

**Architecture:** Keep the existing main window hidden while a dedicated `splashWindow` owns the loading page. A focused startup-window module provides constants, renderer CSS, and sender authorization helpers; the main process owns lifecycle transitions and restricted IPC handlers.

**Tech Stack:** Electron 39, CommonJS, HTML/CSS/JavaScript, Node.js built-in test runner.

## Global Constraints

- The splash content size is exactly 520 x 220 pixels.
- The splash is frameless, fixed-size, centered, non-resizable, and has no menu or scrollbars.
- Close stops the managed `dsh web` process and exits immediately; minimize targets the Windows taskbar.
- The existing main window, title bar, tray, settings window, and close confirmation behavior remain unchanged.
- Service pages loaded from `http://127.0.0.1:3080` cannot invoke splash controls.

---

### Task 1: Startup Window Contract and Markup

**Files:**
- Create: `src/startup-window.js`
- Modify: `src/pages/loading.html`
- Modify: `src/pages/styles.css`
- Create: `src/pages/loading.js`
- Test: `test/startup-window.test.js`

**Interfaces:**
- Produces: `STARTUP_CONTENT_SIZE`, `createStartupWindowOptions(baseOptions)`, and `isAuthorizedStartupSender(event, splashWindow)` from `src/startup-window.js`.
- Produces: renderer calls `window.desktop.minimizeStartup()` and `window.desktop.closeStartup()`.

- [ ] **Step 1: Write failing tests for exact window options, sender authorization, overflow, drag regions, and accessible controls**

Add Node tests that assert 520 x 220 `useContentSize`, `frame: false`, `resizable: false`, authorized sender identity plus `file:` URL, `.startup-page { overflow: hidden; }`, `-webkit-app-region: drag`, `-webkit-app-region: no-drag`, and buttons named `最小化` and `关闭`.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `node --test test/startup-window.test.js`
Expected: FAIL because `src/startup-window.js` and the startup markup contract do not exist.

- [ ] **Step 3: Implement the startup-window module and compact loading page**

Use exact constants and a narrow authorization helper:

```js
const STARTUP_CONTENT_SIZE = Object.freeze({ width: 520, height: 220 });

function createStartupWindowOptions(baseOptions) {
  return {
    ...baseOptions,
    width: STARTUP_CONTENT_SIZE.width,
    height: STARTUP_CONTENT_SIZE.height,
    useContentSize: true,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false
  };
}

function isAuthorizedStartupSender(event, splashWindow) {
  return Boolean(
    splashWindow &&
    !splashWindow.isDestroyed() &&
    event.sender === splashWindow.webContents &&
    event.sender.getURL().startsWith('file:')
  );
}
```

Make `loading.html` a `startup-page`, add a draggable header, two icon buttons with `title` and `aria-label`, load `loading.js`, and scope CSS so other pages are unchanged.

- [ ] **Step 4: Run the focused tests and verify pass**

Run: `node --test test/startup-window.test.js`
Expected: all startup-window tests PASS.

- [ ] **Step 5: Commit the startup UI contract**

```powershell
git add src/startup-window.js src/pages/loading.html src/pages/loading.js src/pages/styles.css test/startup-window.test.js
git commit -m "feat: add compact startup window UI"
```

### Task 2: Main-Process Splash Lifecycle and IPC

**Files:**
- Modify: `src/main.js`
- Modify: `src/preload.js`
- Test: `test/startup-window.test.js`

**Interfaces:**
- Consumes: `createStartupWindowOptions()` and `isAuthorizedStartupSender()` from Task 1.
- Produces: `createSplashWindow()`, `closeSplashWindow()`, `showStartupState()`, and IPC channels `startup:minimize`, `startup:close`.

- [ ] **Step 1: Add failing source-contract tests for lifecycle and preload IPC**

Assert that preload exposes `minimizeStartup` and `closeStartup`, `main.js` creates a separate `splashWindow`, ready and failed events close it before showing the main window, retry invokes the startup state, and both IPC handlers reject non-splash senders.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `node --test test/startup-window.test.js`
Expected: FAIL because lifecycle and IPC wiring are absent.

- [ ] **Step 3: Implement splash creation, transitions, and secure controls**

Create the existing main window hidden without loading `loading.html`. Create and show the splash separately. On ready, destroy the splash, load the service URL, and show the main window. On failure, destroy the splash, load the error page, and show the main window. On retry, hide the main window and recreate/show the splash before restarting the service.

Register handlers with this authorization pattern:

```js
ipcMain.handle('startup:minimize', (event) => {
  if (!isAuthorizedStartupSender(event, splashWindow)) throw new Error('Unauthorized IPC sender');
  splashWindow.minimize();
});

ipcMain.handle('startup:close', (event) => {
  if (!isAuthorizedStartupSender(event, splashWindow)) throw new Error('Unauthorized IPC sender');
  return quitApplication();
});
```

Guard the splash `close` event so user closure triggers `quitApplication()`, while programmatic transition destruction does not quit.

- [ ] **Step 4: Run focused and full tests**

Run: `node --test test/startup-window.test.js`
Expected: PASS.

Run: `npm test`
Expected: 0 failures.

- [ ] **Step 5: Commit lifecycle integration**

```powershell
git add src/main.js src/preload.js test/startup-window.test.js
git commit -m "feat: use dedicated startup window"
```

### Task 3: Verification and Packaging

**Files:**
- Verify: `src/main.js`, `src/preload.js`, `src/startup-window.js`, `src/pages/loading.html`, `src/pages/loading.js`, `src/pages/styles.css`
- Generated: `dist/DSH-Desktop-Setup-1.0.0-x64.exe`

**Interfaces:**
- Consumes the complete startup-window implementation.
- Produces a verified Windows installer with the compact startup experience.

- [ ] **Step 1: Run automated verification**

Run: `npm test`
Expected: all tests PASS with 0 failures.

Run: `npm run check`
Expected: all JavaScript syntax checks exit 0.

- [ ] **Step 2: Run the Electron app and inspect the startup window**

Run: `npm start`
Verify exact compact framing, no scrollbars, working drag area, taskbar minimize, immediate-exit close, and transition to the main or error window.

- [ ] **Step 3: Build the Windows installer**

Run: `npm run dist`
Expected: `dist/DSH-Desktop-Setup-1.0.0-x64.exe` is generated successfully.

- [ ] **Step 4: Record artifact integrity and final repository state**

Run: `Get-FileHash dist\DSH-Desktop-Setup-1.0.0-x64.exe -Algorithm SHA256`
Expected: a SHA-256 digest for the rebuilt installer.

Run: `git status --short --branch`
Expected: branch status plus only intentionally ignored build artifacts.
