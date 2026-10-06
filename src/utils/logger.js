// logger.js — dev-only console output.
//
// React Native does NOT strip console.* from release builds, so anything
// logged with console.log ends up in `adb logcat` / device logs on a
// production device where other apps with log access (or someone with a
// USB cable) can read it. Use this instead: it prints in development
// (__DEV__) and is a silent no-op in release builds.
//
// NEVER pass tokens, ID tokens, emails, request bodies or full URLs to
// these functions. Real production errors belong in captureError()
// (see sentry.js), not the console.

const isDev = typeof __DEV__ !== "undefined" && __DEV__;

export const log = (...args) => { if (isDev) console.log(...args); };
export const warn = (...args) => { if (isDev) console.warn(...args); };
export const error = (...args) => { if (isDev) console.error(...args); };

export default { log, warn, error };
