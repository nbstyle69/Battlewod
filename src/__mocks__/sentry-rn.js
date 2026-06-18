module.exports = {
  init: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  setUser: jest.fn(),
  setTag: jest.fn(),
  setExtra: jest.fn(),
  addBreadcrumb: jest.fn(),
  withScope: jest.fn((cb) => cb({ setExtra: jest.fn(), setTag: jest.fn(), setLevel: jest.fn() })),
  wrap: jest.fn((fn) => fn),
  ReactNativeTracing: jest.fn(),
  ReactNavigationInstrumentation: jest.fn(),
};
