/// <reference types="vitest" />
import path from 'path';
import dts from 'vite-plugin-dts';
import { defineConfig } from 'vite';
import packageJson from './package.json';

const getPackageName = () => {
  return packageJson.name;
};

const getPackageNameCamelCase = () => {
  try {
    return getPackageName().replace(/-./g, (char) => char[1].toUpperCase());
  } catch (err) {
    throw new Error('Name property in package.json is missing.');
  }
};

const fileName = {
  es: `${getPackageName()}.js`,
  iife: `${getPackageName()}.iife.js`,
};

const formats = Object.keys(fileName) as Array<keyof typeof fileName>;

export default defineConfig({
  base: './',
  build: {
    outDir: './dist',
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: getPackageNameCamelCase(),
      formats,
      fileName: (format) => fileName[format],
    },
  },
  test: {
    watch: false,
  },
  resolve: {
    alias: {
      '~': path.resolve(__dirname, 'src'),
    },
  },
  plugins: [
    dts({
      outDir: './dist', // dts.root + 'dist' => where we need to rollup.
      root: './', //vite.root + ../ = ./ = (dts.root)
      staticImport: true,
      insertTypesEntry: true,
      rollupTypes: true,
    }),
  ],
});
