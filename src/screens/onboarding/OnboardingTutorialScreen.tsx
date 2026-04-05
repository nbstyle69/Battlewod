import React, { useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Dimensions, TouchableOpacity,
  Animated, ViewToken, Image,
} from 'react-native';
import { Dumbbell, Clock, Trophy, Building2, Users, ChevronRight } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme, AppTheme } from '../../context/ThemeContext';

const { width } = Dimensions.get('window');

export const ONBOARDING_KEY = '@athlex:onboardingDone';

interface Slide {
  id: string;
  title: string;
  description: string;
  icon: 'logo' | 'wod' | 'comp' | 'box';
  color: string;
}

const SLIDES: Slide[] = [
  {
    id: '1',
    title: 'Bienvenue sur AthleX',
    description: "Ta plateforme d'entra\u00EEnement.\nEntra\u00EEne-toi, rivalise, progresse.",
    icon: 'logo',
    color: '#059669',
  },
  {
    id: '2',
    title: 'WODs & Timer',
    description: 'G\u00E9n\u00E8re des WODs adapt\u00E9s \u00E0 ton niveau et chronom\u00E8tre tes performances avec la cam\u00E9ra.',
    icon: 'wod',
    color: '#3B82F6',
  },
  {
    id: '3',
    title: 'Comp\u00E9titions & ELO',
    description: "Affronte les autres athl\u00E8tes dans ta box ou \u00E0 l'ext\u00E9rieur, grimpe dans le classement ELO et d\u00E9bloque des badges.",
    icon: 'comp',
    color: '#F59E0B',
  },
  {
    id: '4',
    title: 'Ta Box, ta communaut\u00E9',
    description: 'Rejoins ta box, consulte le whiteboard, r\u00E9serve tes cr\u00E9neaux.',
    icon: 'box',
    color: '#8B5CF6',
  },
];

function SlideIcon({ type, color }: { type: Slide['icon']; color: string }) {
  const size = 64;
  switch (type) {
    case 'logo':
      return (
        <Image
          source={require('../../../assets/logo.png')}
          style={{ width: 120, height: 120, resizeMode: 'contain' }}
        />
      );
    case 'wod':
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Dumbbell size={size} color={color} />
          <Clock size={size} color={color} style={{ marginLeft: 16 }} />
        </View>
      );
    case 'comp':
      return <Trophy size={80} color={color} />;
    case 'box':
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Building2 size={size} color={color} />
          <Users size={size} color={color} style={{ marginLeft: 16 }} />
        </View>
      );
  }
}

interface Props {
  onDone: () => void;
}

export default function OnboardingTutorialScreen({ onDone }: Props) {
  const { theme } = useTheme();
  const S = createStyles(theme);
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      setCurrentIndex(viewableItems[0].index);
    }
  }, []);

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  async function handleDone() {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    onDone();
  }

  function handleNext() {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    } else {
      handleDone();
    }
  }

  const isLast = currentIndex === SLIDES.length - 1;

  return (
    <View style={S.container}>
      {/* Skip button */}
      {!isLast && (
        <TouchableOpacity style={S.skipBtn} onPress={handleDone} activeOpacity={0.7} accessibilityLabel="Passer l'introduction">
          <Text style={S.skipText}>Passer</Text>
        </TouchableOpacity>
      )}

      {/* Slides */}
      <Animated.FlatList
        ref={flatListRef}
        data={SLIDES}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false },
        )}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        renderItem={({ item, index }) => {
          const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
          const opacity = scrollX.interpolate({ inputRange, outputRange: [0, 1, 0], extrapolate: 'clamp' });
          const translateY = scrollX.interpolate({ inputRange, outputRange: [40, 0, 40], extrapolate: 'clamp' });

          return (
            <View style={S.slide}>
              <Animated.View style={[S.slideContent, { opacity, transform: [{ translateY }] }]}>
                <View style={[S.iconCircle, { backgroundColor: item.color + '18' }]}>
                  <SlideIcon type={item.icon} color={item.color} />
                </View>
                <Text style={S.title}>{item.title}</Text>
                <Text style={S.description}>{item.description}</Text>
              </Animated.View>
            </View>
          );
        }}
      />

      {/* Bottom: dots + button */}
      <View style={S.bottomContainer}>
        {/* Dots */}
        <View style={S.dotsRow}>
          {SLIDES.map((_, i) => {
            const dotWidth = scrollX.interpolate({
              inputRange: [(i - 1) * width, i * width, (i + 1) * width],
              outputRange: [8, 24, 8],
              extrapolate: 'clamp',
            });
            const dotOpacity = scrollX.interpolate({
              inputRange: [(i - 1) * width, i * width, (i + 1) * width],
              outputRange: [0.3, 1, 0.3],
              extrapolate: 'clamp',
            });
            return (
              <Animated.View
                key={i}
                style={[S.dot, { width: dotWidth, opacity: dotOpacity, backgroundColor: SLIDES[currentIndex]?.color ?? '#059669' }]}
              />
            );
          })}
        </View>

        {/* CTA Button */}
        <TouchableOpacity
          style={[S.ctaBtn, { backgroundColor: SLIDES[currentIndex]?.color ?? '#059669' }]}
          onPress={handleNext}
          activeOpacity={0.85}
          accessibilityLabel={isLast ? "Commencer" : "Slide suivant"}
          accessibilityRole="button"
        >
          <Text style={S.ctaText}>
            {isLast ? "C'est parti !" : 'Suivant'}
          </Text>
          {!isLast && <ChevronRight size={20} color="#fff" style={{ marginLeft: 4 }} />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(t: AppTheme) { return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: t.background,
  },
  skipBtn: {
    position: 'absolute',
    top: 60,
    right: 24,
    zIndex: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  skipText: {
    color: t.textMuted,
    fontSize: 15,
    fontWeight: '500',
  },
  slide: {
    width,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  slideContent: {
    alignItems: 'center',
  },
  iconCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: t.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    color: t.textSecondary,
    textAlign: 'center',
    maxWidth: 320,
  },
  bottomContainer: {
    paddingBottom: 60,
    alignItems: 'center',
    gap: 28,
  },
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 16,
    minWidth: 220,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
}); }
