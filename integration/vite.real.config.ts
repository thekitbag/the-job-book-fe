import config from '../vite.config.ts'
export default {
  ...config,
  server: {
    ...config.server,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3002', changeOrigin: true },
      '/__test': { target: 'http://127.0.0.1:3002', changeOrigin: true },
    },
  },
}
