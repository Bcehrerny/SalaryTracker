import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// IMPORTANT: change "REPO_NAME" below to your actual GitHub repository name.
// e.g. if your repo is https://github.com/yourname/wage-tracker
// then base should be "/wage-tracker/"
export default defineConfig({
  plugins: [react()],
  base: "/SalaryTracker/",
});
