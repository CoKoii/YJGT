import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

const repositoryName = 'YJGT'
const isGithubPagesBuild = process.env.GITHUB_ACTIONS === 'true'

// https://vite.dev/config/
export default defineConfig({
  base: isGithubPagesBuild ? `/${repositoryName}/` : '/',
  plugins: [
    vue(),
    vueDevTools(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('vue') || id.includes('pinia')) return 'framework'
          if (id.includes('ant-design-vue') || id.includes('@ant-design')) return 'ui-ant'
          if (id.includes('vxe-')) return 'ui-vxe'
          if (id.includes('echarts')) return 'charts'
          if (id.includes('langchain') || id.includes('@openai') || id.includes('openai')) return 'ai'
          return 'vendor'
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
})
