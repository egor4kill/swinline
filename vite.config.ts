import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// На GitHub Pages workflow сам подставляет VITE_BASE=/имя-репозитория/
export default defineConfig({ plugins: [react()], base: process.env.VITE_BASE || '/' })
