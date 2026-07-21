# Wage Tracker

A personal wage & tip tracker for shift work — dashboard, work log, tips,
monthly statistics, and salary prediction. Data is stored locally in your
browser (localStorage), nothing is sent to a server.

## Deploy to GitHub Pages

1. **Create a new GitHub repo** and push this whole folder to it (as the
   `main` branch).

2. **Set the base path.** Open `vite.config.js` and change:
   ```js
   base: "/REPO_NAME/",
   ```
   to your actual repo name, e.g. if your repo is
   `https://github.com/yourname/wage-tracker`, use:
   ```js
   base: "/wage-tracker/",
   ```
   (If you're deploying to a *user/organization* page named
   `yourname.github.io`, use `base: "/"` instead.)

3. **Enable Pages via GitHub Actions.** In your repo on GitHub:
   Settings → Pages → Build and deployment → Source → **GitHub Actions**.

4. **Push to `main`.** The included workflow
   (`.github/workflows/deploy.yml`) will automatically install
   dependencies, build the site, and publish it. Your app will be live at:
   ```
   https://yourname.github.io/REPO_NAME/
   ```

## Run locally first (optional but recommended)

```bash
npm install
npm run dev
```
Opens at http://localhost:5173

To build the production files yourself instead of using the Actions
workflow:
```bash
npm run build
npm run preview   # preview the production build locally
```

## Notes

- Data persists per-browser via `localStorage` (see `src/storage.js`). It
  will **not** sync across devices or browsers — it's local to whichever
  browser you use the app in.
- All pay-rule numbers (hourly rate, vakantieuren %, vakantiegeld %,
  pension %, monthly goal) are editable in the Settings tab.
- Tips are always added on top of net salary and never included in any
  tax/pension calculation.
