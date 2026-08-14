# Compact Startup Window Design

## Goal

Replace the oversized loading view with a compact, frameless startup window that contains only the startup status UI. The window must not show scrollbars and must provide custom minimize and close controls in its top-right corner.

## Scope

This change applies only while `dsh web` is starting. The existing main application window, settings window, tray behavior, close confirmation, and service page remain unchanged after the service is ready.

## Window Architecture

The application will use two windows during startup:

- `splashWindow`: a fixed-size, non-resizable, frameless startup window centered on screen.
- `mainWindow`: the existing 1280 x 820 application window, created hidden and shown only when the local service is ready or when an error page must be displayed.

The splash window uses an exact 520 x 220 content-pixel size. Its entire surface is the startup interface; there is no outer page background or nested card. This avoids visible seams and unnecessary empty space.

## Lifecycle

1. Application startup creates the hidden main window, tray, and compact splash window.
2. The splash window loads `loading.html` and becomes visible when ready.
3. `dsh web` starts in the background.
4. When the service becomes ready, the splash window closes, the main window loads `http://127.0.0.1:3080`, and the main window is shown.
5. When service startup fails, the splash window closes, the main window loads the existing error page, and the main window is shown.
6. A service retry hides the main window, shows the splash window again, and repeats the startup flow.

Only one splash window is allowed to exist at a time. Window references are cleared after destruction.

## Startup Window Interaction

- The window has no native Windows frame or menu.
- A reserved top strip uses `-webkit-app-region: drag` so the window can be moved.
- The minimize and close controls use `-webkit-app-region: no-drag`.
- The minimize control calls a restricted IPC handler that minimizes only the sender's splash window.
- The close control calls a restricted IPC handler that stops the managed `dsh web` process and exits the application immediately.
- Closing the splash window through any system path follows the same immediate-exit behavior unless the application is already transitioning to the main window or quitting.

The controls use familiar minimize and close symbols, include accessible labels and tooltips, and keep fixed dimensions so hover states cannot shift the layout.

## Page Layout

`loading.html` receives a startup-page class and a compact structure:

- a draggable top area;
- custom window controls aligned to the top-right;
- product icon, startup heading, supporting text, and spinner in the body.

The root document and body use fixed full-window dimensions with `overflow: hidden`. The content is vertically balanced inside the compact window. No scrollable container is present.

Startup-specific CSS is scoped so the existing error and settings pages keep their current layout.

## Security

The preload bridge exposes only two additional commands: minimize the startup window and close the startup window. Main-process handlers verify that the sender is the current splash window and that its URL uses the internal `file:` protocol. Service pages loaded from `127.0.0.1` cannot call these commands.

## Error Handling

- If the splash window is already destroyed, minimize requests return without action.
- Repeated close or quit requests are idempotent through the existing `isQuitting` guard.
- Service events received after a window transition check window existence before loading or showing content.
- A failed retry returns to the existing error page without leaving a hidden unusable window.

## Testing

Automated tests will verify:

- the compact startup dimensions and non-resizable frameless configuration;
- the startup page hides overflow;
- the draggable area and non-draggable controls are present;
- minimize and close controls have accessible names;
- IPC authorization accepts only the current splash window;
- service-ready and service-failed transitions close the splash window and show the correct main-window content.

Manual verification will cover dragging, minimizing, immediate exit, absence of scrollbars, successful transition to the DSH page, and the retry-to-loading transition.

## Out of Scope

- Changing the main window title bar or its close confirmation behavior.
- Changing tray menu behavior.
- Adding maximize or restore controls to the startup window.
- Changing service startup, port cleanup, or timeout logic.
