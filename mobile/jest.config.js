// Tests for the plain-TypeScript logic in src/ (no Expo or React Native needed).
// Hub times are Manila local time, so the tests run on Manila time too.
process.env.TZ = 'Asia/Manila';

module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      { tsconfig: { target: 'ES2020', module: 'commonjs', strict: true, esModuleInterop: true, resolveJsonModule: true, types: ['jest', 'node'] } },
    ],
  },
};
