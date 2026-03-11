import React from 'react';
import { View, Text } from 'react-native';

const MapView = (props) => (
  <View style={[{ backgroundColor: '#e0e0e0', alignItems: 'center', justifyContent: 'center' }, props.style]}>
    <Text>Map Area (Web Mock)</Text>
  </View>
);

export const Marker = () => null;
export const Polyline = () => null;
export default MapView;
