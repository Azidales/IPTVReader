import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({base:'./',build:{target:'es2022',outDir:'dist-desktop',emptyOutDir:true,rollupOptions:{input:resolve(__dirname,'desktop.html')}}});
