// ─────────────────────────────────────────────────────────────────────────────
// App configuration. This is the only file you need to edit.
// ─────────────────────────────────────────────────────────────────────────────

// 1. Shared database (Firebase Firestore).
//    Paste the config object from Firebase console → Project settings → Your apps.
//    Leave as `null` to run in "demo mode", where data is only saved on this device.
//    (Firebase web config values are not secret — it's fine to commit them.)
export const firebaseConfig = {
  apiKey: "AIzaSyC8M-IFpdqnZtIv8n6QXnwj6sA_Um5EDUw",
  authDomain: "trip-planner-34535.firebaseapp.com",
  projectId: "trip-planner-34535",
  storageBucket: "trip-planner-34535.firebasestorage.app",
  messagingSenderId: "1082304627667",
  appId: "1:1082304627667:web:4dffa4ce3d2e41944c6526",
};
// Example:
// export const firebaseConfig = {
//   apiKey: "AIza...",
//   authDomain: "my-holiday.firebaseapp.com",
//   projectId: "my-holiday",
//   storageBucket: "my-holiday.appspot.com",
//   messagingSenderId: "123456789",
//   appId: "1:123456789:web:abc123",
// };

// 2. Organiser PIN. Entering this in the app (⚙︎ → "I'm the organiser") unlocks
//    creating groups, adding questions and managing members on that device.
//    Change it to something only you know.
export const organiserPin = "4321";

// 3. App name shown in the header.
export const appName = "Holiday Organiser";
