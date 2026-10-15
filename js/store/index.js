// Picks the shared Firebase store when configured, otherwise the on-device demo store.
import { firebaseConfig } from "../config.js";

let store;
let loadError = null;
if (firebaseConfig) {
  try {
    store = await import("./firebase.js");
  } catch (e) {
    console.error("Couldn't start Firebase, falling back to demo mode:", e);
    loadError = e;
    store = await import("./local.js");
  }
} else {
  store = await import("./local.js");
}

export default store;
export { loadError };
