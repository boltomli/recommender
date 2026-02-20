import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on mode
  const env = loadEnv(mode, process.cwd(), '')

  // Check if static mode is enabled
  const isStaticMode = env.VITE_STATIC_MODE === 'true' || mode === 'static'

  return {
    plugins: [vue()],
    server: {
      port: 5173,
      host: true,
      proxy: {
        // 开发环境：代理 LLM 请求到后端
        '/api/llm-proxy': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          rewrite: (path) => {
            console.log('[Vite Proxy] Rewriting path:', path);
            return path.replace(/^\/api\/llm-proxy/, '/api/proxy/llm');
          },
          configure: (proxy, _options) => {
            proxy.on('error', (err, _req, _res) => {
              console.log('[Vite Proxy] Error:', err);
            });
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              console.log('[Vite Proxy] Request:', req.url, '->', proxyReq.path);
            });
            proxy.on('proxyRes', (proxyRes, req, _res) => {
              console.log('[Vite Proxy] Response:', proxyRes.statusCode, req.url);
            });
          },
        },
      },
    },
    define: {
      // Ensure static mode is available at build time
      __STATIC_MODE__: JSON.stringify(isStaticMode)
    },
    build: {
      // Copy public/data directory to dist
      copyPublicDir: true,
      // Optimize chunks
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor': ['vue', 'axios'],
            'ui': ['bootstrap']
          }
        }
      }
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src')
      }
    }
  }
})