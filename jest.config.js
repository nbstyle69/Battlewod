module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^react-native$': '<rootDir>/src/__mocks__/react-native.js',
    '^react-native-url-polyfill(.*)$': '<rootDir>/src/__mocks__/noop.js',
    '^.*/src/navigation(|/.*)$': '<rootDir>/src/__mocks__/noop.js',
    '^expo-notifications$': '<rootDir>/src/__mocks__/expo-notifications.js',
    '^@react-native-async-storage/async-storage$': '<rootDir>/src/__mocks__/async-storage.js',
    '^@sentry/react-native$': '<rootDir>/src/__mocks__/sentry-rn.js',
    '^expo-haptics$': '<rootDir>/src/__mocks__/expo-haptics.js',
  },
  collectCoverageFrom: [
    'src/utils/**/*.ts',
    'src/services/**/*.ts',
    '!src/**/__tests__/**',
    '!src/**/__mocks__/**',
  ],
};
