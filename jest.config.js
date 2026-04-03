// jest.config.js
module.exports = {
  testEnvironment: 'jest-environment-jsdom',
  testMatch: ['**/tests/**/*.test.js', '**/tests/test.js'],
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  setupFiles: ['./jest.setup.js'],
};