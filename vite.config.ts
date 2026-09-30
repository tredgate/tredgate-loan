import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    // Forward API calls to the Express backend started by `npm run dev:api` (see server/)
    proxy: {
      '/api': 'http://localhost:3000'
    }
  }
})
