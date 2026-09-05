const React = require('react');
const { View } = require('react-native');
module.exports = { LinearGradient: (p) => React.createElement(View, p, p.children) };
