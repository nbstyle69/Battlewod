import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, Dimensions, TouchableOpacity,
  Animated, ViewToken, Image, TextInput, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Dumbbell, Clock, Trophy, Building2, Camera, ChevronRight, Hash, ArrowRight, Zap } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme, AppTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { awardLevelBadge } from '../../services/gamification';
import { trackOnboardingStep, trackOnboardingComplete, trackOnboardingBoxJoin, trackOnboardingSkipBox } from '../../lib/analytics';
import { captureError } from '../../lib/sentry';
import GlassBackground from '../../components/glass/GlassBackground';

const { width, height } = Dimensions.get('window');

export const ONBOARDING_KEY = '@athlex:onboardingDone';

interface Slide {
  id: string;
  key: 'welcome' | 'wodTimer' | 'compElo' | 'box' | 'badge';
  icon: 'logo' | 'wod' | 'comp' | 'box' | 'badge';
  color: string;
}

const SLIDES: Slide[] = [
  { id: '1', key: 'welcome',  icon: 'logo',  color: '#059669' },
  { id: '2', key: 'wodTimer', icon: 'wod',   color: '#3B82F6' },
  { id: '3', key: 'compElo',  icon: 'comp',  color: '#F59E0B' },
  { id: '4', key: 'box',      icon: 'box',   color: '#8B5CF6' },
  { id: '5', key: 'badge',    icon: 'badge', color: '#10b981' },
];

// ── Confetti Particle ──────────────────────────────────────

const CONFETTI_COLORS = ['#10b981', '#34d399', '#6ee7b7', '#F59E0B', '#3B82F6', '#8B5CF6', '#EC4899', '#fff'];
const PARTICLE_COUNT = 40;

function ConfettiOverlay({ active }: { active: boolean }) {
  const particles = useRef(
    Array.from({ length: PARTICLE_COUNT }, () => ({
      x: new Animated.Value(Math.random() * width),
      y: new Animated.Value(-20),
      rotate: new Animated.Value(0),
      opacity: new Animated.Value(1),
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      size: 6 + Math.random() * 8,
      drift: (Math.random() - 0.5) * 120,
    })),
  ).current;

  useEffect(() => {
    if (!active) return;
    const anims = particles.map((p, i) => {
      p.x.setValue(Math.random() * width);
      p.y.setValue(-20 - Math.random() * 100);
      p.opacity.setValue(1);
      p.rotate.setValue(0);
      const duration = 1800 + Math.random() * 1200;
      const delay = i * 40;
      return Animated.parallel([
        Animated.timing(p.y, { toValue: height + 40, duration, delay, useNativeDriver: true }),
        Animated.timing(p.x, { toValue: (Math.random() * width) + p.drift, duration, delay, useNativeDriver: true }),
        Animated.timing(p.rotate, { toValue: 360 * (Math.random() > 0.5 ? 1 : -1), duration, delay, useNativeDriver: true }),
        Animated.timing(p.opacity, { toValue: 0, duration: duration * 0.6, delay: delay + duration * 0.4, useNativeDriver: true }),
      ]);
    });
    Animated.stagger(20, anims).start();
  }, [active]);

  if (!active) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((p, i) => {
        const spin = p.rotate.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] });
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              width: p.size,
              height: p.size * 0.6,
              borderRadius: 2,
              backgroundColor: p.color,
              opacity: p.opacity,
              transform: [
                { translateX: p.x },
                { translateY: p.y },
                { rotate: spin },
              ],
            }}
          />
        );
      })}
    </View>
  );
}

// ── Slide Icons ────────────────────────────────────────────

function SlideIcon({ type, color, badgeScale }: { type: Slide['icon']; color: string; badgeScale?: Animated.Value }) {
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Dumbbell size={size} color={color} />
          <Clock size={48} color={color} />
          <Camera size={48} color={color} />
        </View>
      );
    case 'comp': {
      return (
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Trophy size={80} color={color} />
          <EloCounter />
        </View>
      );
    }
    case 'box':
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Building2 size={size} color={color} />
          <Hash size={48} color={color} />
        </View>
      );
    case 'badge':
      return (
        <Animated.View style={badgeScale ? { transform: [{ scale: badgeScale }] } : undefined}>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 80 }}>🚀</Text>
          </View>
        </Animated.View>
      );
  }
}

// ── ELO animated counter ──────────────────────────────────

function EloCounter() {
  const [display, setDisplay] = useState(1000);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const listener = anim.addListener(({ value }) => setDisplay(Math.round(value)));
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1250, duration: 2000, useNativeDriver: false }),
        Animated.delay(1000),
        Animated.timing(anim, { toValue: 1000, duration: 1500, useNativeDriver: false }),
        Animated.delay(500),
      ]),
    ).start();
    return () => anim.removeListener(listener);
  }, []);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Zap size={16} color="#F59E0B" />
      <Text style={{ fontSize: 18, fontWeight: '900', color: '#F59E0B', fontVariant: ['tabular-nums'] }}>
        ELO {display}
      </Text>
    </View>
  );
}

// ── Main Component ────────────────────────────────────────

interface Props {
  onDone: () => void;
}

export default function OnboardingTutorialScreen({ onDone }: Props) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { user, joinBox, skipBox, currentBox } = useAuth();
  const isLoggedIn = !!user;
  const S = createStyles(theme);
  // The welcome/badge slides use the app brand accent (emerald in dark, silver in light).
  const slideColor = (raw?: string) =>
    raw === '#059669' || raw === '#10b981' ? theme.accent : (raw ?? theme.accent);
  const flatListRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;

  // Box join state (slide 4)
  const [boxCode, setBoxCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [boxJoined, setBoxJoined] = useState(false);

  // Badge animation (slide 5)
  const badgeScale = useRef(new Animated.Value(0)).current;
  const [confettiActive, setConfettiActive] = useState(false);
  const [badgeAwarded, setBadgeAwarded] = useState(false);

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      const idx = viewableItems[0].index;
      setCurrentIndex(idx);
      trackOnboardingStep(idx + 1, SLIDES[idx]?.key ?? '');

      // Trigger badge animation on slide 5
      if (idx === 4 && !badgeAwarded) {
        setBadgeAwarded(true);
        awardFirstStepBadge();
        badgeScale.setValue(0);
        Animated.spring(badgeScale, {
          toValue: 1,
          friction: 4,
          tension: 80,
          useNativeDriver: true,
        }).start();
        setTimeout(() => setConfettiActive(true), 200);
      }
    }
  }, [badgeAwarded]);

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  async function awardFirstStepBadge() {
    if (!user?.id) return;
    try {
      await awardLevelBadge(user.id, 'first_step');
    } catch (e) {
      captureError(e, { action: 'awardFirstStepBadge' });
    }
  }

  async function handleDone() {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
    trackOnboardingComplete();
    // Auto-skip box if user is logged in but didn't join a box during onboarding
    if (isLoggedIn && !currentBox && !boxJoined) {
      await skipBox();
    }
    onDone();
  }

  function handleNext() {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    } else {
      handleDone();
    }
  }

  async function handleJoinBox() {
    if (boxCode.trim().length !== 6) {
      Alert.alert(t('onboarding.invalidCode'), t('onboarding.invalidCodeMsg'));
      return;
    }
    setJoining(true);
    const { error } = await joinBox(boxCode.trim().toUpperCase());
    setJoining(false);
    if (error) {
      Alert.alert(t('common.error'), error);
      return;
    }
    setBoxJoined(true);
    trackOnboardingBoxJoin();
  }

  function handleSkipBox() {
    trackOnboardingSkipBox();
    handleNext();
  }

  const isLast = currentIndex === SLIDES.length - 1;
  const isBoxSlide = currentIndex === 3;

  return (
    <View style={S.container}>
      <GlassBackground />
      <ConfettiOverlay active={confettiActive} />

      {/* Skip button */}
      {!isLast && (
        <TouchableOpacity style={S.skipBtn} onPress={handleDone} activeOpacity={0.7}>
          <Text style={S.skipText}>{t('onboarding.tutorial.skip')}</Text>
        </TouchableOpacity>
      )}

      {/* Slides */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={0}
      >
        <Animated.FlatList
          ref={flatListRef}
          data={SLIDES}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          bounces={false}
          scrollEnabled={!isBoxSlide || boxJoined || !isLoggedIn}
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
            // Parallax: icon moves slower
            const iconTranslateX = scrollX.interpolate({
              inputRange,
              outputRange: [width * 0.3, 0, -width * 0.3],
              extrapolate: 'clamp',
            });

            return (
              <View style={S.slide}>
                <Animated.View style={[S.slideContent, { opacity, transform: [{ translateY }] }]}>
                  {/* Icon with parallax */}
                  <Animated.View style={[S.iconCircle, { backgroundColor: slideColor(item.color) + '18', transform: [{ translateX: iconTranslateX }] }]}>
                    <SlideIcon type={item.icon} color={slideColor(item.color)} badgeScale={item.icon === 'badge' ? badgeScale : undefined} />
                  </Animated.View>
                  <Text style={S.title}>{t(`onboarding.slides.${item.key}.title`)}</Text>
                  <Text style={S.description}>{t(`onboarding.slides.${item.key}.description`)}</Text>

                  {/* Box join inline (slide 4) — only show input when logged in */}
                  {item.icon === 'box' && isLoggedIn && (
                    <View style={S.boxSection}>
                      {boxJoined ? (
                        <View style={S.boxJoinedRow}>
                          <Text style={S.boxJoinedText}>{t('onboarding.tutorial.boxJoined')}</Text>
                        </View>
                      ) : (
                        <>
                          <View style={S.boxInputRow}>
                            <TextInput
                              style={S.boxCodeInput}
                              placeholder="ABC123"
                              placeholderTextColor={theme.textMuted}
                              value={boxCode}
                              onChangeText={v => setBoxCode(v.toUpperCase())}
                              autoCapitalize="characters"
                              maxLength={6}
                            />
                            <TouchableOpacity
                              style={[S.boxJoinBtn, (boxCode.length !== 6 || joining) && { opacity: 0.4 }]}
                              onPress={handleJoinBox}
                              disabled={boxCode.length !== 6 || joining}
                              activeOpacity={0.85}
                            >
                              {joining ? (
                                <ActivityIndicator color="#fff" size="small" />
                              ) : (
                                <Text style={S.boxJoinBtnText}>{t('onboarding.tutorial.join')}</Text>
                              )}
                            </TouchableOpacity>
                          </View>
                          <TouchableOpacity onPress={handleSkipBox} style={S.skipBoxBtn} activeOpacity={0.7}>
                            <Text style={S.skipBoxText}>{t('onboarding.tutorial.continueWithoutBox')}</Text>
                            <ArrowRight size={14} color={theme.textMuted} />
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  )}
                </Animated.View>
              </View>
            );
          }}
        />
      </KeyboardAvoidingView>

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
                style={[S.dot, { width: dotWidth, opacity: dotOpacity, backgroundColor: slideColor(SLIDES[currentIndex]?.color) }]}
              />
            );
          })}
        </View>

        {/* CTA Button — hidden on box slide when logged in (buttons are inline) */}
        {(!isBoxSlide || !isLoggedIn) && (
          <TouchableOpacity
            style={[S.ctaBtn, { backgroundColor: slideColor(SLIDES[currentIndex]?.color) }]}
            onPress={handleNext}
            activeOpacity={0.85}
          >
            <Text style={S.ctaText}>
              {isLast ? t('onboarding.tutorial.discoverApp') : currentIndex === 0 ? t('onboarding.tutorial.letsGo') : t('onboarding.tutorial.next')}
            </Text>
            {!isLast && <ChevronRight size={20} color="#fff" style={{ marginLeft: 4 }} />}
          </TouchableOpacity>
        )}

        {/* Box slide: show "Suivant" only if box was joined */}
        {isBoxSlide && boxJoined && (
          <TouchableOpacity
            style={[S.ctaBtn, { backgroundColor: SLIDES[currentIndex]?.color ?? '#8B5CF6' }]}
            onPress={handleNext}
            activeOpacity={0.85}
          >
            <Text style={S.ctaText}>{t('onboarding.tutorial.next')}</Text>
            <ChevronRight size={20} color="#fff" style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function createStyles(t: AppTheme) { return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
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
    paddingHorizontal: 32,
  },
  slideContent: {
    alignItems: 'center',
    width: '100%',
  },
  iconCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: t.text,
    textAlign: 'center',
    marginBottom: 14,
  },
  description: {
    fontSize: 15,
    lineHeight: 23,
    color: t.textSecondary,
    textAlign: 'center',
    maxWidth: 320,
  },
  bottomContainer: {
    paddingBottom: 60,
    alignItems: 'center',
    gap: 24,
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

  // Box slide
  boxSection: {
    width: '100%',
    marginTop: 24,
    gap: 12,
  },
  boxInputRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  boxCodeInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: '900',
    color: t.text,
    letterSpacing: 8,
    textAlign: 'center',
    backgroundColor: t.card,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: t.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  boxJoinBtn: {
    backgroundColor: '#8B5CF6',
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  boxJoinBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  skipBoxBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  skipBoxText: {
    fontSize: 14,
    color: t.textMuted,
    textDecorationLine: 'underline',
  },
  boxJoinedRow: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  boxJoinedText: {
    fontSize: 18,
    fontWeight: '800',
    color: t.success,
  },
}); }
