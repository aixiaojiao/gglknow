import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: {
        background: 'src/background/index.ts'
      },
      output: {
        entryFileNames: '[name]/index.js',
        chunkFileNames: 'shared/[name]-[hash].js',
        assetFileNames: '[name]/[ext]/[name].[ext]',
        // 为 Service Worker 内联所有依赖
        manualChunks: (id) => {
          // 如果是 background 相关的代码，不创建单独的 chunk
          if (id.includes('src/background') || id.includes('src/utils') || id.includes('src/types')) {
            return undefined; // 内联到主文件
          }
          // 其他文件可以共享 chunk
          return 'shared';
        }
      }
    }
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  }
}) 