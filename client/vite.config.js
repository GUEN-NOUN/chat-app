import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: '/chat/',
  build: {
    outDir: path.resolve(__dirname, '../www/chat'),
    emptyOutDir: true
  },
  server: {
    host: '0.0.0.0',   // expose to LAN so Android/iOS live reload can connect
    port: 5173,
    proxy: {
      '/api':      'http://localhost:3000',
      '/socket.io':'http://localhost:3000',
      '/uploads':  'http://localhost:3000'
    }
  }
});
