module.exports = {
  Platform: {
    OS: 'ios',
    select: jest.fn((obj) => obj.ios ?? obj.default),
    Version: 17,
    isPad: false,
    isTVOS: false,
  },
  NativeModules: {},
  NativeEventEmitter: jest.fn(() => ({
    addListener: jest.fn(),
    removeAllListeners: jest.fn(),
  })),
  AppState: {
    currentState: 'active',
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
  Linking: {
    openURL: jest.fn(),
    canOpenURL: jest.fn().mockResolvedValue(true),
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
};
