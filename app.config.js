// Dynamic Expo config — sensitive values injected from environment variables.
// Expo CLI automatically loads .env before running this file.
// For EAS cloud builds, set secrets via: eas secret:create --scope project --name GOOGLE_MAPS_API_KEY --value "..."

module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    config: {
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_API_KEY ?? '',
      },
    },
  },
});
