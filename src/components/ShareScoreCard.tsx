import React, { forwardRef } from 'react';
import { View, Text, Image, StyleSheet, Dimensions } from 'react-native';
import { formatScoreValue } from '../utils/scoreFormat';
import UserAvatar from './UserAvatar';

const CARD_W = 1080;
const CARD_H = 1920;
const SCALE = Dimensions.get('window').width / CARD_W;

interface ShareScoreCardProps {
  wodTitle: string;
  wodType: string | null;
  score: number;
  scoreType: string;
  rx: boolean;
  rank: number | null;
  totalParticipants: number;
  username: string;
  avatarUrl?: string | null;
  boxName: string;
  date: string;
}

const TYPE_COLORS: Record<string, string> = {
  'for-time': '#EF4444', amrap: '#3B82F6', emom: '#8B5CF6',
  tabata: '#F59E0B', strength: '#16A34A', custom: '#6B7280',
};

const TYPE_LABELS: Record<string, string> = {
  'for-time': 'FOR TIME', amrap: 'AMRAP', emom: 'EMOM',
  tabata: 'TABATA', strength: 'FORCE', custom: 'CUSTOM',
};

function medalEmoji(rank: number | null): string {
  if (!rank) return '';
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return '';
}

const ShareScoreCard = forwardRef<View, ShareScoreCardProps>(
  ({ wodTitle, wodType, score, scoreType, rx, rank, totalParticipants, username, avatarUrl, boxName, date }, ref) => {
    const typeColor = TYPE_COLORS[wodType ?? 'custom'] ?? '#6B7280';
    const typeLabel = TYPE_LABELS[wodType ?? 'custom'] ?? 'WOD';
    const medal = medalEmoji(rank);
    const formattedScore = formatScoreValue(score, scoreType);
    const formattedDate = new Date(date).toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });

    return (
      <View
        ref={ref}
        style={styles.card}
        collapsable={false}
      >
        {/* Background gradient layers */}
        <View style={styles.bgBase} />
        <View style={styles.bgGlow} />

        {/* Top: Logo */}
        <View style={styles.topSection}>
          <Image
            source={require('../../assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.brandText}>ATHLEX</Text>
        </View>

        {/* Center content */}
        <View style={styles.centerSection}>
          {/* WOD Type badge */}
          <View style={[styles.typeBadge, { backgroundColor: `${typeColor}30` }]}>  
            <View style={[styles.typeDot, { backgroundColor: typeColor }]} />
            <Text style={[styles.typeText, { color: typeColor }]}>{typeLabel}</Text>
          </View>

          {/* WOD Title */}
          <Text style={styles.wodTitle} numberOfLines={2}>{wodTitle}</Text>
          <Text style={styles.dateText}>{formattedDate}</Text>

          {/* Score */}
          <View style={styles.scoreContainer}>
            <Text style={styles.scoreValue}>{formattedScore}</Text>
            <View style={[styles.rxBadge, { backgroundColor: rx ? '#22c55e20' : '#f59e0b20' }]}>
              <Text style={[styles.rxText, { color: rx ? '#22c55e' : '#f59e0b' }]}>
                {rx ? 'RX' : 'SCALED'}
              </Text>
            </View>
          </View>

          {/* Rank */}
          {rank != null && (
            <View style={styles.rankContainer}>
              <Text style={styles.rankLabel}>CLASSEMENT</Text>
              <Text style={styles.rankValue}>
                {medal ? `${medal} ` : ''}#{rank}
                <Text style={styles.rankTotal}> / {totalParticipants}</Text>
              </Text>
            </View>
          )}
        </View>

        {/* Bottom: athlete info */}
        <View style={styles.bottomSection}>
          <View style={styles.divider} />
          <View style={styles.athleteRow}>
            <UserAvatar
              uri={avatarUrl}
              name={username}
              size={80}
              borderRadius={40}
              backgroundColor={'#C9A22730'}
              textColor={'#C9A227'}
              fontSize={34}
            />
            <View style={styles.athleteInfo}>
              <Text style={styles.athleteName}>{username}</Text>
              <Text style={styles.boxName}>{boxName}</Text>
            </View>
          </View>

          <View style={styles.footerRow}>
            <Image
              source={require('../../assets/logo.png')}
              style={styles.footerLogo}
              resizeMode="contain"
            />
            <Text style={styles.footerText}>athlex.app</Text>
          </View>
        </View>
      </View>
    );
  },
);

ShareScoreCard.displayName = 'ShareScoreCard';

const styles = StyleSheet.create({
  card: {
    width: CARD_W,
    height: CARD_H,
    overflow: 'hidden',
    position: 'relative',
  },
  bgBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0a0a0a',
  },
  bgGlow: {
    position: 'absolute',
    top: '20%',
    left: '10%',
    width: '80%',
    height: '40%',
    borderRadius: 999,
    backgroundColor: '#C9A22710',
  },

  // Top
  topSection: {
    alignItems: 'center',
    paddingTop: 120,
    gap: 16,
  },
  logo: {
    width: 120,
    height: 120,
    borderRadius: 30,
  },
  brandText: {
    fontSize: 42,
    fontWeight: '900',
    color: '#C9A227',
    letterSpacing: 12,
  },

  // Center
  centerSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 80,
    gap: 24,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 50,
    gap: 12,
  },
  typeDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  typeText: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 4,
  },
  wodTitle: {
    fontSize: 72,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 84,
  },
  dateText: {
    fontSize: 28,
    color: '#666666',
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  scoreContainer: {
    alignItems: 'center',
    marginTop: 32,
    gap: 20,
  },
  scoreValue: {
    fontSize: 120,
    fontWeight: '900',
    color: '#C9A227',
    letterSpacing: 2,
  },
  rxBadge: {
    paddingHorizontal: 32,
    paddingVertical: 10,
    borderRadius: 50,
  },
  rxText: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 4,
  },
  rankContainer: {
    alignItems: 'center',
    marginTop: 20,
    gap: 8,
  },
  rankLabel: {
    fontSize: 22,
    fontWeight: '800',
    color: '#555555',
    letterSpacing: 6,
  },
  rankValue: {
    fontSize: 52,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  rankTotal: {
    fontSize: 36,
    fontWeight: '600',
    color: '#555555',
  },

  // Bottom
  bottomSection: {
    paddingHorizontal: 80,
    paddingBottom: 100,
    gap: 32,
  },
  divider: {
    height: 2,
    backgroundColor: '#ffffff10',
    borderRadius: 1,
  },
  athleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#C9A22730',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 34,
    fontWeight: '900',
    color: '#C9A227',
  },
  athleteInfo: {
    flex: 1,
    gap: 4,
  },
  athleteName: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  boxName: {
    fontSize: 26,
    fontWeight: '600',
    color: '#666666',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 8,
  },
  footerLogo: {
    width: 36,
    height: 36,
    borderRadius: 8,
    opacity: 0.5,
  },
  footerText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#444444',
    letterSpacing: 2,
  },
});

export default ShareScoreCard;
