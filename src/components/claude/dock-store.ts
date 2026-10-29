/**
 * Which Claude chats are open in the corner dock, and whether the dock is
 * showing. Kept in localStorage so it survives navigation and reloads: go
 * back from a task, change page, refresh, and the chat is still there.
 *
 * A tiny external store rather than context, so the "Claude chat" buttons
 * scattered over server-rendered pages can open the dock with one call and
 * no provider.
 */

export type DockState = {
  open: boolean;
  tabs: number[];
  active: number | null;
  large: boolean;
};

const KEY = "claude-dock:v1";
const MAX_TABS = 8;

export const SERVER_STATE: DockState = { open: false, tabs: [], active: null, large: false };

let state: DockState = SERVER_STATE;
let loaded = false;
const subs = new Set<() => void>();

function sanitize(raw: unknown): DockState {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<DockState>;
  const tabs = Array.isArray(r.tabs)
    ? r.tabs.filter((n): n is number => Number.isInteger(n) && n > 0).slice(0, MAX_TABS)
    : [];
  const active = typeof r.active === "number" && tabs.includes(r.active) ? r.active : (tabs[0] ?? null);
  return { open: r.open === true && tabs.length > 0, tabs, active, large: r.large === true };
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) state = sanitize(JSON.parse(raw));
  } catch {
    // private window or blocked storage: start closed
  }
}

function commit(next: DockState) {
  state = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // not persisted, still works for this page
  }
  subs.forEach((fn) => fn());
}

export function subscribe(fn: () => void) {
  load();
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

export function getSnapshot(): DockState {
  load();
  return state;
}

export function getServerSnapshot(): DockState {
  return SERVER_STATE;
}

/** Show a task's chat in the dock, adding a tab if it has none yet. */
export function openChat(taskId: number) {
  load();
  const tabs = state.tabs.includes(taskId) ? state.tabs : [...state.tabs, taskId].slice(-MAX_TABS);
  commit({ ...state, open: true, tabs, active: taskId });
}

export function selectTab(taskId: number) {
  load();
  commit({ ...state, active: taskId });
}

export function closeTab(taskId: number) {
  load();
  const tabs = state.tabs.filter((t) => t !== taskId);
  const active = state.active === taskId ? (tabs[tabs.length - 1] ?? null) : state.active;
  commit({ ...state, tabs, active, open: tabs.length > 0 && state.open });
}

export function setDockOpen(open: boolean) {
  load();
  commit({ ...state, open });
}

export function toggleLarge() {
  load();
  commit({ ...state, large: !state.large });
}
