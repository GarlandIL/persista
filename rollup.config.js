// rollup.config.js
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/index.js',
  output: [
    {
      file: 'dist/persista.js',
      format: 'umd',
      name: 'Persista',
      sourcemap: true,
    },
    {
      file: 'dist/persista.min.js',
      format: 'umd',
      name: 'Persista',
      plugins: [terser()],
      sourcemap: true,
    },
    {
      file: 'dist/persista.esm.js',
      format: 'esm',
      sourcemap: true,
    },
  ],
};