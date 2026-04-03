const terser = require('@rollup/plugin-terser');

module.exports = {
  input: 'src/index.js',
  output: [
    {
      file: 'dist/persista.js',
      format: 'umd',
      name: 'Persista',
      sourcemap: true,
      inlineDynamicImports: true,
      exports: 'named',
    },
    {
      file: 'dist/persista.min.js',
      format: 'umd',
      name: 'Persista',
      plugins: [terser()],
      sourcemap: true,
      inlineDynamicImports: true,
      exports: 'named',
    },
    {
      file: 'dist/persista.esm.js',
      format: 'esm',
      sourcemap: true,
      inlineDynamicImports: true,
    },
  ],
};