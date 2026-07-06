import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  // The API base the extension talks to. Overridable via VITE_API_BASE_URL.
  define: {
    __API_BASE__: JSON.stringify(process.env.VITE_API_BASE_URL || 'http://localhost:5001'),
    __APP_URL__: JSON.stringify(process.env.VITE_APP_URL || 'http://localhost:5173'),
  },
  build: {
    rollupOptions: {
      // Keep chunk names stable so MV3 doesn't choke on hashed dynamic imports
      output: { chunkFileNames: 'assets/[name].js' },
    },
  },
})
