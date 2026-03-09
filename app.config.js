const resolveGoogleMapsApiKey = () =>
  (
    process.env.GOOGLE_MAPS_API_KEY ??
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ??
    process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ??
    ''
  ).trim();

module.exports = ({ config }) => {
  const apiKey = resolveGoogleMapsApiKey();

  return {
    ...config,
    android: {
      ...config.android,
      config: {
        ...(config.android?.config ?? {}),
        googleMaps: {
          ...(config.android?.config?.googleMaps ?? {}),
          apiKey
        }
      }
    }
  };
};
