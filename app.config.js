// Dynamic Expo config — sensitive values injected from environment variables.
// Expo CLI automatically loads .env before running this file.
// EAS builds : GOOGLE_MAPS_ANDROID_API_KEY (variable Sensitive de l'environnement
// production) — clé Google Maps restreinte au package com.athlex.app + SHA-1.
// Le dépôt est public : aucune clé n'y entre, même restreinte.

module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    config: {
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY ?? '',
      },
    },
  },
});
