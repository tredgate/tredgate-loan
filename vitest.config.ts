import { defineConfig, configDefaults } from "vitest/config";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: "jsdom",
    globals: true,
    // services/ have their own package.json, dependencies and test run
    exclude: [...configDefaults.exclude, "services/**", "course-examples/**"],
  },
});
