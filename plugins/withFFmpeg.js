const { withDangerousMod, withPlugins } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo config plugin to integrate ffmpeg-kit-react-native.
 * - Android: adds ffmpeg-kit maven repo + excludes duplicate META-INF
 * - iOS: no extra config needed (auto-linked by CocoaPods)
 */
function withFFmpegAndroid(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      // 1. Add maven repo for ffmpeg-kit to android/build.gradle
      const buildGradlePath = path.join(
        cfg.modRequest.platformProjectRoot,
        'build.gradle'
      );
      if (fs.existsSync(buildGradlePath)) {
        let contents = fs.readFileSync(buildGradlePath, 'utf-8');
        const mavenRepo = `        maven { url "https://github.com/ArsenyKondratev/ffmpeg-kit/raw/main/prebuilt/bundle-android-aar/release" }`;
        if (!contents.includes('ArsenyKondratev/ffmpeg-kit')) {
          contents = contents.replace(
            /allprojects\s*\{\s*repositories\s*\{/,
            `allprojects {\n    repositories {\n${mavenRepo}`
          );
          fs.writeFileSync(buildGradlePath, contents, 'utf-8');
        }
      }

      // 2. Add packaging options to app/build.gradle
      const appBuildGradlePath = path.join(
        cfg.modRequest.platformProjectRoot,
        'app',
        'build.gradle'
      );
      if (fs.existsSync(appBuildGradlePath)) {
        let contents = fs.readFileSync(appBuildGradlePath, 'utf-8');
        const packagingBlock = `
    packagingOptions {
        pickFirst 'lib/x86/libc++_shared.so'
        pickFirst 'lib/x86_64/libc++_shared.so'
        pickFirst 'lib/armeabi-v7a/libc++_shared.so'
        pickFirst 'lib/arm64-v8a/libc++_shared.so'
    }`;
        if (!contents.includes('pickFirst') && contents.includes('android {')) {
          contents = contents.replace(
            /android\s*\{/,
            `android {${packagingBlock}`
          );
          fs.writeFileSync(appBuildGradlePath, contents, 'utf-8');
        }
      }

      return cfg;
    },
  ]);
}

module.exports = (config) => {
  return withFFmpegAndroid(config);
};
