module.exports = {
  Mixpanel: class {
    init() { return Promise.resolve(); }
    track() {}
    identify() {}
    getPeople() { return { set() {}, deleteUser() {} }; }
    reset() {}
    flush() {}
    setUseIpAddressForGeolocation() {}
  },
};
