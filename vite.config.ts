// vite.config.js
import { resolve } from 'path'
import { defineConfig } from 'vite'
import packageJson from './package.json'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'lib/main.ts'),
      name: 'NerdoMemoryDB',
      // the proper extensions will be added
      fileName: 'nerdo-memory-db',
    },
    rollupOptions: {
      // make sure to externalize deps that shouldn't be bundled
      // into your library
      external: Object.keys(packageJson.peerDependencies || {}),
      output: {
        // Provide global variables to use in the UMD build
        // for externalized deps
        globals: Object.keys(packageJson.peerDependencies || {}).reduce((obj: Record<string, string>, name) => {
          obj[name] = name
          return obj
        }, {}),
      },
    },
  },
})
