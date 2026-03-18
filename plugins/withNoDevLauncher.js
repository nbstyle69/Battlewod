/**
 * Expo config plugin to remove expo-dev-launcher references from the
 * generated Android project. Fixes Gradle 8.14+ incompatibility.
 * See: https://github.com/expo/expo/issues/36217
 */
const { withSettingsGradle, withAppBuildGradle } = require('expo/config-plugins');

function withNoDevLauncher(config) {
  // 1. Remove expo-dev-launcher from settings.gradle includes
  config = withSettingsGradle(config, (cfg) => {
    cfg.modResults.contents = cfg.modResults.contents
      .split('\n')
      .filter((line) => !line.includes('expo-dev-launcher') && !line.includes('expo-dev-menu'))
      .join('\n');
    return cfg;
  });

  // 2. Remove expo-dev-launcher-gradle-plugin from app/build.gradle
  config = withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = cfg.modResults.contents
      .split('\n')
      .filter((line) => !line.includes('expo-dev-launcher'))
      .join('\n');
    return cfg;
  });

  return config;
}

module.exports = withNoDevLauncher;
