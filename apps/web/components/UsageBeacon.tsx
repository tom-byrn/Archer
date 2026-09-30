"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useConvexAuth, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

/**
 * Records how long signed-in people spend in the app, for the admin
 * dashboard: a heartbeat (`usage.heartbeat`) every 30 seconds carrying the
 * time since the last one that the tab was visible and someone had touched
 * the mouse or keyboard in the past two minutes, and one on every page
 * change. A tab keeps its session id in sessionStorage until it has been
 * idle for 30 minutes. Renders nothing.
 */

const BEAT_MS = 30_000;
const TICK_MS = 5_000;
const IDLE_MS = 2 * 60_000;
const SESSION_GAP_MS = 30 * 60_000;
const STORAGE_KEY = "archer.usage-session";

/** "Chrome · macOS" from the user agent; coarse on purpose. */
export function describeDevice(ua: string): string {
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Other";
  const os = /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X|Macintosh/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux|CrOS/.test(ua)
            ? "Linux"
            : "Other";
  return `${browser} · ${os}`;
}

/** This tab's session id: kept while it's in use, new after a long gap. */
function sessionKey(now: number): string {
  try {
    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null") as { key: string; at: number } | null;
    const key = stored && now - stored.at < SESSION_GAP_MS ? stored.key : crypto.randomUUID();
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ key, at: now }));
    return key;
  } catch {
    return crypto.randomUUID();
  }
}

export function UsageBeacon() {
  const { isAuthenticated } = useConvexAuth();
  const beat = useMutation(api.usage.heartbeat);
  const pathname = usePathname();
  const state = useRef({ activeMs: 0, lastInput: Date.now(), lastTick: Date.now(), lastBeat: 0 });
  const send = useRef<(path: string) => void>(() => {});

  send.current = (path: string) => {
    const s = state.current;
    const now = Date.now();
    const activeMs = s.activeMs;
    s.activeMs = 0;
    s.lastBeat = now;
    beat({ key: sessionKey(now), path, activeMs, device: describeDevice(navigator.userAgent) }).catch(() => {
      s.activeMs += activeMs; // retry with the next beat
    });
  };

  // Count visible, non-idle time; beat on a timer.
  useEffect(() => {
    if (!isAuthenticated) return;
    const s = state.current;
    const onInput = () => {
      s.lastInput = Date.now();
    };
    const events = ["pointermove", "pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;
    for (const e of events) window.addEventListener(e, onInput, { passive: true, capture: true });
    s.lastTick = Date.now();
    const timer = window.setInterval(() => {
      const now = Date.now();
      const elapsed = Math.min(now - s.lastTick, TICK_MS * 2);
      s.lastTick = now;
      if (document.visibilityState === "visible" && now - s.lastInput < IDLE_MS) s.activeMs += elapsed;
      if (s.activeMs > 0 && now - s.lastBeat >= BEAT_MS) send.current(window.location.pathname);
    }, TICK_MS);
    return () => {
      window.clearInterval(timer);
      for (const e of events) window.removeEventListener(e, onInput, { capture: true });
    };
  }, [isAuthenticated]);

  // A page view: beat now, so the path is recorded even on a short visit.
  useEffect(() => {
    if (isAuthenticated) send.current(pathname);
  }, [isAuthenticated, pathname]);

  return null;
}
