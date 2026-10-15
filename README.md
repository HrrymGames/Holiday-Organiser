# Holiday Organiser 🏖️

A little iPhone app for planning trips with friends. You make groups, your friends join with just a username (no passwords), you post questions, and you get a live roundup of everyone's answers with charts.

- **Invite links:** create a group and you get a link to send your friends. When they open it, they see the group, who's already in and what they'll be asked, and they choose whether to join.
- **Groups:** everyone using the app also sees the list of groups and can tap **Join**.
- **No passwords:** people type a username. If they switch phones they just tap their name.
- **Five question types:**
  - **Word**: free text ("Any must-dos?")
  - **Number**: one number, with optional min/max and units ("How many nights?")
  - **Range**: a from–to range on a slider ("What's your budget?", e.g. £400–£900)
  - **Choice**: multiple choice, single or multi-pick, optionally with "something else" ("Where does everyone want to go?")
  - **Dates**: a calendar where people tap every day they're free ("Which dates can you do?"). You set the window, which defaults to the whole of next year.
- **Results roundup:**
  - how many people have answered each question, and who you're still waiting on
  - each person's progress, which you can tap to see all their answers
  - number answers: average, median, lowest and highest, plus a bar per person
  - range answers: everyone's range on one chart, with the stretch that **works for everyone** (or for the most people) highlighted
  - choice answers: votes per option and who picked what
  - word answers: everyone's answers listed with their names
  - date answers: the best dates (the longest stretches where everyone, or the most people, is free, and who that is), plus a calendar shaded by how many people can make each day
- **You're in charge:** only the organiser (unlocked with a PIN) can create groups, add, edit, reorder or close questions, remove people, and choose whether everyone can see the results.
- Everything updates live, works in light and dark mode, and installs to the home screen like a normal app.

It's a web app (a "PWA"), not an App Store app. That means you don't need a Mac, Xcode or a $99 Apple developer account, and friends install it in 10 seconds from a link.

---

## 1. Try it straight away (demo mode)

Out of the box the app runs in **demo mode**, which saves data only on the device you're using. That's handy for having a play, but friends won't see your groups. To try it on a computer:

```bash
npx serve .
```

Then open the address it prints. The default organiser PIN is `1234` (this copy uses the one in `js/config.js`) (tap ⚙︎ → *I'm the organiser*).

## 2. Connect a shared database (free, about 5 minutes)

This is what lets everyone see the same groups. It uses Google Firebase's free plan.

1. Go to <https://console.firebase.google.com>, click **Create a project** and give it any name. You can turn Google Analytics off.
2. In the left menu open **Build → Firestore Database** → **Create database**.
   - Location: pick one near you (e.g. `europe-west2 (London)`).
   - Start in **production mode**.
3. On the Firestore **Rules** tab, replace everything with the contents of [`firestore.rules`](firestore.rules) and click **Publish**. If you published the rules before the Dates question type existed, publish them again. Otherwise date questions will be refused.
4. Go to **Project settings** (⚙︎ next to *Project Overview*) → **Your apps** → click the **`</>`** (Web) icon. Give it a nickname and register it. You don't need Firebase Hosting.
5. Copy the `firebaseConfig = { ... }` object it shows you into [`js/config.js`](js/config.js), replacing `null`:

   ```js
   export const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "my-holiday.firebaseapp.com",
     projectId: "my-holiday",
     storageBucket: "my-holiday.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abc123",
   };
   ```

   These values aren't secret, so it's fine to commit them.
6. While you're in `js/config.js`, **change `organiserPin`** to something only you know.

The ⚙︎ menu shows "✓ Connected to the shared database" when this is working.

## 3. Put it online

**GitHub Pages (already set up):**

1. On GitHub open the repo's **Settings → Pages**. Under *Build and deployment*, set **Source** to **GitHub Actions**.
2. Merge into `main` (or run the *Deploy to GitHub Pages* workflow from the **Actions** tab).
3. Your app will be at `https://<your-username>.github.io/<repo-name>/`.

> On a free GitHub account, Pages only works for **public** repos. If yours is private, you can either make it public or use Netlify instead: go to <https://app.netlify.com/drop> and drag the project folder onto the page.

## 4. Add it to your iPhone

1. Open the link in **Safari**.
2. Tap the **Share** button, then **Add to Home Screen**.
3. It now opens full-screen from its own icon, like any other app.

Send friends the same link, or send them a group's invite link so they land straight on that group (see below).

## How to use it

**You (the organiser)**

1. Tap ⚙︎ → *I'm the organiser* and enter your PIN. That device stays unlocked until you turn it off.
2. **＋ New group**: give it a name, a description and an icon.
3. An **Invite friends** sheet pops up. Tap **Share link…** to send it in Messages, WhatsApp and so on, or **Copy link**. You can find the link again any time in the group's **Manage** tab, or by tapping **⤴︎** at the top.
4. In the group's **Manage** tab, tap **＋ Add**, choose Word / Number / Range / Choice / Dates, and post the question.
5. Watch the **Results** tab fill up. Use the **⋯** menu on a question to edit it, close it to new answers, or delete it.
6. If you want, turn on **Let everyone see the results**.

**Friends**

1. Tap the invite link. They'll see the group, who's in and the questions waiting. To join, they type a name and tap **Join group**, or tap **Not now** to look around first.
2. Answer the questions. They can come back and change their answers at any time.

## Good to know

- Invite links only work for friends once the app is online (step 3) and connected to Firebase (step 2). In demo mode the link opens an empty app on their phone.
- With no passwords, anyone who has the link could join or pick someone else's name. That's fine for a group of friends, but don't use it for anything private.
- The organiser PIN is stored in the app's code, so a determined friend could find it by reading the source. It stops accidental edits; it isn't real security.
- Firebase's free plan allows 50,000 reads and 20,000 writes a day, far more than a friend group will use.

## Project layout

| Path | What it is |
| --- | --- |
| `index.html` | The page shell |
| `js/config.js` | **Your settings**: Firebase config, organiser PIN, app name |
| `js/app.js` | Screens, routing and all the interactions |
| `js/stats.js` | Averages, medians, range overlaps, vote counts and best dates |
| `js/charts.js` | The bar, range, vote and calendar charts |
| `js/store/` | Data storage: `firebase.js` (shared) or `local.js` (demo mode) |
| `css/styles.css` | iPhone-style design, light and dark |
| `sw.js`, `manifest.webmanifest`, `icons/` | Home-screen app and offline support |
| `firestore.rules` | Database security rules to paste into Firebase |

There's no build step: it's plain HTML, CSS and JavaScript.
