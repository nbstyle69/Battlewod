import React, { useEffect, useRef, ReactNode } from 'react';
import { View, Animated, PanResponder, ViewStyle } from 'react-native';

interface AutoScrollCarouselProps<T> {
  data: T[];
  renderItem: (item: T, index: number) => ReactNode;
  itemWidth: number;
  gap?: number;
  speed?: number;
  style?: ViewStyle;
}

export default function AutoScrollCarousel<T>({
  data,
  renderItem,
  itemWidth,
  gap = 12,
  speed = 30,
  style,
}: AutoScrollCarouselProps<T>) {
  const translateX = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const currentOffset = useRef(0);
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalItemWidth = itemWidth + gap;
  const halfWidth = data.length * totalItemWidth;

  const doubled = data.length > 0 ? [...data, ...data] : [];

  function startScroll(from: number) {
    const remaining = halfWidth - Math.abs(from);
    if (remaining <= 0) {
      translateX.setValue(0);
      currentOffset.current = 0;
      startScroll(0);
      return;
    }

    const duration = (remaining / speed) * 1000;

    animRef.current = Animated.timing(translateX, {
      toValue: -halfWidth,
      duration,
      useNativeDriver: true,
    });

    animRef.current.start(({ finished }) => {
      if (finished) {
        translateX.setValue(0);
        currentOffset.current = 0;
        startScroll(0);
      }
    });
  }

  function stopScroll() {
    if (animRef.current) {
      animRef.current.stop();
      animRef.current = null;
    }
  }

  function resumeAfterDelay() {
    if (pauseTimer.current) clearTimeout(pauseTimer.current);
    pauseTimer.current = setTimeout(() => {
      translateX.stopAnimation((value) => {
        currentOffset.current = value;
        startScroll(value);
      });
    }, 3000);
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5 && Math.abs(gs.dx) > 10,
      onPanResponderGrant: () => {
        stopScroll();
        if (pauseTimer.current) clearTimeout(pauseTimer.current);
        translateX.stopAnimation((value) => {
          currentOffset.current = value;
          translateX.setOffset(value);
          translateX.setValue(0);
        });
      },
      onPanResponderMove: (_, gs) => {
        translateX.setValue(gs.dx);
      },
      onPanResponderRelease: () => {
        translateX.flattenOffset();
        translateX.stopAnimation((value) => {
          let clamped = value % halfWidth;
          if (clamped > 0) clamped = clamped - halfWidth;
          translateX.setValue(clamped);
          currentOffset.current = clamped;
        });
        resumeAfterDelay();
      },
    })
  ).current;

  useEffect(() => {
    if (data.length <= 0 || halfWidth <= 0) return;
    const t = setTimeout(() => startScroll(0), 500);
    return () => {
      clearTimeout(t);
      stopScroll();
      if (pauseTimer.current) clearTimeout(pauseTimer.current);
    };
  }, [data.length, halfWidth, speed]);

  if (data.length === 0) return null;

  return (
    <View style={[{ overflow: 'hidden' }, style]} {...panResponder.panHandlers}>
      <Animated.View
        style={{
          flexDirection: 'row',
          transform: [{ translateX }],
        }}
      >
        {doubled.map((item, index) => (
          <View
            key={`carousel-${index}`}
            style={{
              width: itemWidth,
              marginRight: index < doubled.length - 1 ? gap : 0,
            }}
          >
            {renderItem(item, index % data.length)}
          </View>
        ))}
      </Animated.View>
    </View>
  );
}
