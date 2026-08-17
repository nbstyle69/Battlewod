import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, Dimensions, Platform,
} from 'react-native';
import { ChevronLeft, MapPin, Users, Navigation } from 'lucide-react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { ExplorerStackParamList } from '../../navigation';
import { Box } from '../../types';

type Nav = NativeStackNavigationProp<ExplorerStackParamList>;
type Route = RouteProp<ExplorerStackParamList, 'BoxDirectoryMap'>;

let MapView: any = null;
let Marker: any = null;
let Callout: any = null;
try {
  const maps = require('react-native-maps');
  MapView = maps.default;
  Marker = maps.Marker;
  Callout = maps.Callout;
} catch (_) {}

const { width } = Dimensions.get('window');

export default function BoxDirectoryMapScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const s = createStyles(theme);

  const boxes: Box[] = (route.params?.boxes ?? []) as Box[];
  const [selected, setSelected] = useState<Box | null>(null);
  const mapRef = useRef<any>(null);

  const initialRegion = boxes.length > 0
    ? {
        latitude: boxes.reduce((a, b) => a + (b.latitude ?? 0), 0) / boxes.length,
        longitude: boxes.reduce((a, b) => a + (b.longitude ?? 0), 0) / boxes.length,
        latitudeDelta: 2,
        longitudeDelta: 2,
      }
    : { latitude: 46.6, longitude: 2.2, latitudeDelta: 8, longitudeDelta: 8 };

  if (!MapView) {
    return (
      <View style={[s.container, s.center]}>
        <View style={s.headerAbs}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <ChevronLeft color={theme.text} size={22} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Carte des Boxs</Text>
        </View>
        <Text style={s.emptyText}>
          react-native-maps non installé.{'\n'}Installez-le pour afficher la carte.
        </Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {/* Header floating */}
      <View style={s.headerAbs}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <ChevronLeft color={theme.text} size={22} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Carte des Boxs</Text>
        <Text style={s.headerSub}>{boxes.length} box{boxes.length > 1 ? 's' : ''}</Text>
      </View>

      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton={false}
        customMapStyle={theme.mode === 'dark' ? darkMapStyle : []}
      >
        {boxes.map(box => (
          <Marker
            key={box.id}
            coordinate={{ latitude: box.latitude!, longitude: box.longitude! }}
            onPress={() => setSelected(box)}
          >
            <View style={s.markerWrap}>
              {box.logo_url ? (
                <Image source={{ uri: box.logo_url }} style={s.markerLogo} />
              ) : (
                <View style={[s.markerLogo, s.markerPlaceholder]}>
                  <Text style={s.markerLetter}>{box.name.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={s.markerArrow} />
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Bottom sheet when selected */}
      {selected && (
        <View style={s.sheet}>
          <TouchableOpacity
            style={s.sheetCard}
            activeOpacity={0.85}
            onPress={() => {
              setSelected(null);
              navigation.navigate('BoxDirectoryDetail', { boxId: selected.id });
            }}
          >
            {selected.logo_url ? (
              <Image source={{ uri: selected.logo_url }} style={s.sheetLogo} />
            ) : (
              <View style={[s.sheetLogo, s.sheetLogoPlaceholder]}>
                <Text style={s.sheetLogoLetter}>{selected.name.charAt(0)}</Text>
              </View>
            )}
            <View style={s.sheetContent}>
              <Text style={s.sheetName}>{selected.name}</Text>
              {selected.city ? (
                <View style={s.metaRow}>
                  <MapPin size={11} color={theme.textMuted} />
                  <Text style={s.metaText}>{selected.city}</Text>
                </View>
              ) : null}
              <View style={s.metaRow}>
                <Users size={11} color={theme.textMuted} />
                <Text style={s.metaText}>{selected.member_count ?? 0} membres</Text>
              </View>
            </View>
            <Navigation size={18} color={theme.accent} />
          </TouchableOpacity>
          <TouchableOpacity style={s.sheetClose} onPress={() => setSelected(null)}>
            <Text style={s.sheetCloseText}>Fermer</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#1d1d1d' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8e8e8e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1d1d1d' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c2c2c' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e0e0e' }] },
];

function createStyles(t: AppTheme) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.background },
    center: { alignItems: 'center', justifyContent: 'center' },
    headerAbs: {
      position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
      paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12,
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: `${t.card}E0`,
    },
    backBtn: {
      width: 36, height: 36, borderRadius: 10,
      backgroundColor: t.surface, alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { fontSize: 18, fontWeight: '900', color: t.text },
    headerSub: { fontSize: 11, color: t.textMuted },
    emptyText: { fontSize: 14, color: t.textMuted, textAlign: 'center', lineHeight: 22 },
    sheet: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      paddingHorizontal: 16, paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    },
    sheetCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: t.card, borderRadius: 16, padding: 14,
      borderWidth: 1, borderColor: t.border,
      ...Platform.select({
        ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 12 },
        android: { elevation: 8 },
      }),
    },
    sheetLogo: { width: 48, height: 48, borderRadius: 12 },
    sheetLogoPlaceholder: {
      backgroundColor: `${t.accent}15`, alignItems: 'center', justifyContent: 'center',
    },
    sheetLogoLetter: { fontSize: 20, fontWeight: '900', color: t.accent },
    sheetContent: { flex: 1 },
    sheetName: { fontSize: 15, fontWeight: '800', color: t.text },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
    metaText: { fontSize: 11, color: t.textMuted },
    sheetClose: { alignItems: 'center', paddingTop: 10 },
    sheetCloseText: { fontSize: 12, fontWeight: '600', color: t.textMuted },
    markerWrap: { alignItems: 'center' },
    markerLogo: {
      width: 40, height: 40, borderRadius: 10,
      borderWidth: 2, borderColor: t.accent,
    },
    markerPlaceholder: {
      backgroundColor: t.card, alignItems: 'center', justifyContent: 'center',
    },
    markerLetter: { fontSize: 16, fontWeight: '900', color: t.accent },
    markerArrow: {
      width: 0, height: 0, marginTop: -1,
      borderLeftWidth: 6, borderRightWidth: 6, borderTopWidth: 8,
      borderLeftColor: 'transparent', borderRightColor: 'transparent',
      borderTopColor: t.accent,
    },
  });
}
