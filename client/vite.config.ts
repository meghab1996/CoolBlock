import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ mode }) => {
  // `npm run dev:phone` starts Vite in "phone" mode: reachable from other devices
  // on your Wi-Fi, over https (phones only share their location with https pages).
  const phone = mode === 'phone';
  return {
    plugins: [react(), ...(phone ? [basicSsl()] : [])],
    build: { chunkSizeWarningLimit: 800 },
    server: {
      port: 5173,
      host: phone ? true : 'localhost',
      // Forward API calls to the Express server so the browser never needs the OpenAI key.
      proxy: {
        '/api': 'http://localhost:3001',
      },
    },
  };
});