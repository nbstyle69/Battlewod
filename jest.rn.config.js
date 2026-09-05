// Suite « montage réel » : les écrans sont montés avec le vrai react-native
// (preset jest de RN, react-test-renderer), pas le mock statique de jest.config.js.
// Lancement : npm run test:rn
module.exports = {
  preset: 'react-native',
  rootDir: __dirname,
  // Pas <rootDir>/src : src/__mocks__/react-native.js y serait pris pour le mock automatique du paquet.
  roots: ['<rootDir>/src/__tests__'],
  testMatch: ['**/__tests__/**/*.rn.test.tsx'],
  transform: { '^.+\\.[jt]sx?$': ['babel-jest', { presets: ['babel-preset-expo'] }] },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|expo|expo-.*|@expo|lucide-react-native|react-native-svg)/)',
  ],
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$': '<rootDir>/src/__mocks__/async-storage.js',
    '^@sentry/react-native$': '<rootDir>/src/__mocks__/sentry-rn.js',
    '^expo-notifications$': '<rootDir>/src/__mocks__/expo-notifications.js',
    '^expo-haptics$': '<rootDir>/src/__mocks__/expo-haptics.js',
    '^expo-linear-gradient$': '<rootDir>/src/__mocks__/rn/linearGradient.js',
    '^react-native-svg$': '<rootDir>/src/__mocks__/rn/svg.js',
    '^expo-localization$': '<rootDir>/src/__mocks__/rn/localization.js',
    '^mixpanel-react-native$': '<rootDir>/src/__mocks__/rn/mixpanel.js',
    '\\.(png|jpg)$': '<rootDir>/src/__mocks__/rn/img.js',
  },
  setupFiles: ['<rootDir>/jest.setup.js'],
};
