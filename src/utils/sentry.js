// sentry.js — crash + error reporting, behind a thin wrapper.
//
// Everything in the app imports from here rather than from
// "@sentry/react-native" directly, for two reasons:
//   - if the DSN isn't configured (local dev, a fork, a build where you
//     don't want reporting) every call degrades to a console log instead of
//     crashing on an uninitialised client;
//   - swapping providers later touches one file.
//
// Usage:
//   import { initSentry, captureError, addBreadcrumb, setSentryUser } from "./src/utils/sentry";
//   captureError(e, { scope: "lists.create", listId });

import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";
import { log } from "./logger";

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || "";
const ENV = process.env.EXPO_PUBLIC_ENV || "dev";

// Shared scrubber: the JWT and Google id token are the only genuinely
// sensitive values the app holds. Strip anything that looks like one before
// it leaves the device, regardless of which code path attached it.
const SENSITIVE_KEY = /token|authorization|secret|password|cookie/i;

function scrubObject(obj) {
  if (!obj || typeof obj !== "object") return;
  for (const key of Object.keys(obj)) {
    if (SENSITIVE_KEY.test(key)) obj[key] = "[redacted]";
    else if (obj[key] && typeof obj[key] === "object") scrubObject(obj[key]);
  }
}

export function scrubEvent(event) {
  if (!event) return event;
  if (event.request?.headers) {
    delete event.request.headers.Authorization;
    delete event.request.headers.authorization;
    delete event.request.headers.Cookie;
    delete event.request.headers.cookie;
  }
  if (event.request) delete event.request.cookies;
  scrubObject(event.extra);
  scrubObject(event.contexts);
  if (Array.isArray(event.breadcrumbs)) {
    for (const b of event.breadcrumbs) scrubObject(b?.data);
  }
  return event;
}

let enabled = false;

export function initSentry() {
  if (!DSN) {
    log("[sentry] no EXPO_PUBLIC_SENTRY_DSN set — reporting disabled");
    return;
  }
  Sentry.init({
    dsn: DSN,
    environment: ENV,
    // Only send a share of traces in prod; 100% in dev is fine and makes the
    // first integration test obvious.
    tracesSampleRate: ENV === "prod" ? 0.2 : 1.0,
    // Native crashes (the ones that never reach JS) — this is the main
    // reason to use Sentry over a plain error boundary.
    enableNativeCrashHandling: true,
    enableAutoSessionTracking: true,
    // Don't let a debug build pollute prod issue counts.
    debug: __DEV__ && ENV !== "prod",
    release: Constants?.expoConfig?.version
      ? `mindcart@${Constants.expoConfig.version}`
      : undefined,
    beforeSend(event) {
      return scrubEvent(event);
    },
  });

  enabled = true;
}

/** Tie errors to a user so you can see "this crash hit 3 people, here's who". */
export function setSentryUser(user) {
  if (!enabled) return;
  if (!user) {
    Sentry.setUser(null);
    return;
  }
  // id + email only — no name/avatar, nothing else the backend holds.
  Sentry.setUser({ id: user.id, email: user.email });
}

/**
 * Report an error. `context` is a flat object of extra tags —
 * always include a `scope` so issues group sensibly.
 */
export function captureError(error, context = {}) {
  if (!enabled) {
    log("[sentry:disabled]", context?.scope || "", error?.message || error);
    return;
  }
  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(context)) {
      if (key === "scope") scope.setTag("scope", String(value));
      else scope.setExtra(key, value);
    }
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
  });
}

/** Non-error signal worth having in the trail before a crash. */
export function addBreadcrumb(message, data = {}) {
  if (!enabled) return;
  Sentry.addBreadcrumb({ message, data, level: "info" });
}

export function captureMessage(message, level = "info") {
  if (!enabled) return;
  Sentry.captureMessage(message, level);
}

/** Wrap the root component so Sentry can instrument navigation + native. */
export const wrapWithSentry = (Component) => (enabled ? Sentry.wrap(Component) : Component);

export default Sentry;