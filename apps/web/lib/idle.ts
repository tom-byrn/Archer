/**
 * Run `task` once the page has loaded and the browser is idle: background work
 * such as fetching code the page will probably need, kept off the critical
 * path. Browsers without requestIdleCallback (Safari) get a short timeout
 * instead. Returns a cancel function, so it can be a useEffect cleanup as is.
 */
export function whenIdle(task: () => void): () => void {
  let cancel = () => {};
  const idle = () => {
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(task);
      cancel = () => window.cancelIdleCallback(id);
    } else {
      const id = window.setTimeout(task, 500);
      cancel = () => window.clearTimeout(id);
    }
  };
  if (document.readyState === "complete") {
    idle();
  } else {
    window.addEventListener("load", idle, { once: true });
    cancel = () => window.removeEventListener("load", idle);
  }
  return () => cancel();
}
