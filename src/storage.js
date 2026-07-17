// Mimics the window.storage key-value API (get/set/delete/list) using
// the browser's localStorage, so the app code doesn't need to change.
// Note: this is per-browser storage only (no cross-device sync).

const PREFIX = "wage-tracker:";

function fullKey(key) {
  return PREFIX + key;
}

const storage = {
  async get(key) {
    try {
      const raw = localStorage.getItem(fullKey(key));
      if (raw === null) return null;
      return { key, value: raw, shared: false };
    } catch (e) {
      throw e;
    }
  },
  async set(key, value) {
    try {
      localStorage.setItem(fullKey(key), value);
      return { key, value, shared: false };
    } catch (e) {
      console.error("storage.set failed", e);
      return null;
    }
  },
  async delete(key) {
    try {
      localStorage.removeItem(fullKey(key));
      return { key, deleted: true, shared: false };
    } catch (e) {
      return null;
    }
  },
  async list(prefix = "") {
    try {
      const keys = Object.keys(localStorage)
        .filter((k) => k.startsWith(fullKey(prefix)))
        .map((k) => k.slice(PREFIX.length));
      return { keys, prefix, shared: false };
    } catch (e) {
      return null;
    }
  },
};

if (typeof window !== "undefined") {
  window.storage = storage;
}

export default storage;
