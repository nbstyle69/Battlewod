import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, ActivityIndicator } from 'react-native';
import { Dumbbell, Trophy, Layout, User, Building2, ClipboardList, Users, MessageCircle, Home } from 'lucide-react-native';
import KettlebellIcon from '../components/KettlebellIcon';

import { useAuth } from '../context/AuthContext';
import { Colors } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';

import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import WaitingScreen from '../screens/onboarding/WaitingScreen';
import JoinBoxScreen from '../screens/onboarding/JoinBoxScreen';
import CreateBoxScreen from '../screens/onboarding/CreateBoxScreen';
import HomeScreen from '../screens/home/HomeScreen';
import TimerScreen from '../screens/timer/TimerScreen';
import TimerRunScreen from '../screens/timer/TimerRunScreen';
import VideoPlaybackScreen from '../screens/timer/VideoPlaybackScreen';
import WODScreen from '../screens/wod/WODScreen';
import WODGeneratorScreen from '../screens/wod/WODGeneratorScreen';
import HomeWODGeneratorScreen from '../components/WodGeneratorCard';
import OneRMCalculatorScreen from '../screens/home/OneRMCalculatorScreen';
import CompetitionScreen from '../screens/competition/CompetitionScreen';
import PhysicalCompetitionScreen from '../screens/competition/PhysicalCompetitionScreen';
import MatchScreen from '../screens/competition/MatchScreen';
import MatchmakingScreen from '../screens/competition/MatchmakingScreen';
import MatchWODScreen from '../screens/competition/MatchWODScreen';
import MatchCameraScreen from '../screens/competition/MatchCameraScreen';
import MatchScoreScreen from '../screens/competition/MatchScoreScreen';
import TournamentScreen from '../screens/competition/TournamentScreen';
import TournamentWODScreen from '../screens/competition/TournamentWODScreen';
import BOTournamentScreen from '../screens/backoffice/BOTournamentScreen';
import LeaderboardScreen from '../screens/leaderboard/LeaderboardScreen';
import WhiteboardScreen from '../screens/whiteboard/WhiteboardScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import AdminScreen from '../screens/admin/AdminScreen';
import BODashboardScreen from '../screens/backoffice/BODashboardScreen';
import BOMembersScreen from '../screens/backoffice/BOMembersScreen';
import BOWODsScreen from '../screens/backoffice/BOWODsScreen';
import MessagesScreen from '../screens/messages/MessagesScreen';
import CommunityScreen from '../screens/community/CommunityScreen';
import CompetitionDetailScreen from '../screens/competition/CompetitionDetailScreen';
import PublicProfileScreen from '../screens/profile/PublicProfileScreen';
import FriendsScreen from '../screens/home/FriendsScreen';
import WodHistoryScreen from '../screens/wod/WodHistoryScreen';
import NotificationSettingsScreen from '../screens/settings/NotificationSettingsScreen';

export type RootStackParamList = {
  Auth: undefined;
  Onboarding: undefined;
  Main: undefined;
  BoxOwner: undefined;
};

export type OnboardingStackParamList = {
  Waiting: undefined;
  JoinBox: undefined;
  CreateBox: undefined;
};

export type BoxOwnerTabParamList = {
  BODashboard: undefined;
  BOWODs: undefined;
  BOMembers: undefined;
  BOMessages: undefined;
  BOProfile: undefined;
};

export type BODashboardStackParamList = {
  Dashboard: undefined;
  WODs: undefined;
  Members: undefined;
  BOTournament: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Competitions: undefined;
  Whiteboard: undefined;
};

export type TimerType = 'for-time' | 'amrap' | 'emom' | 'tabata' | 'ywyr' | 'libre';
export type BlockType = Exclude<TimerType, 'libre'>;
export type SeqBlock = {
  id: string;
  type: BlockType;
  durationMin: number;  // amrap/for-time duration (0=unlimited for ft)
  emomInterval: number; // 1-5 min
  emomRounds: number;
  workSec: number;      // tabata work
  restSec: number;      // tabata rest
  tabRounds: number;    // tabata rounds
  pauseSec: number;     // pause after this block (0=none)
};

export type CompetitionSummary = {
  id: string;
  name: string;
  description?: string;
  level?: string;
  status: 'open' | 'active' | 'completed';
  startDate: string;
  endDate: string;
  participants: number;
  maxParticipants: number;
  prize: string;
  wods?: Array<{ title: string; type: string; duration: number; movements: string; hasTimer?: boolean }>;
};

export type HomeStackParamList = {
  HomeList: undefined;
  WODGenerator: undefined;
  WodHistory: undefined;
  NotificationSettings: undefined;
  OneRMCalculator: undefined;
  Timer: undefined;
  Leaderboard: undefined;
  Profile: undefined;
  Friends: undefined;
  CompetitionDetail: { competition: CompetitionSummary };
  PublicProfile: { userId: string };
  VideoPlayback: {
    videoURL: string;
    title?: string;
    recordedAt?: string;
    timerStartOffset?: number;
    timerStopOffset?: number;
    countdownDuration?: number;
  };
  TimerRun: {
    timerType: TimerType;
    countdown: number;
    totalSeconds: number;   // amrap: duration
    maxTime: number;        // for-time: 0=illimité, >0=cap en secondes
    interval: number;       // emom: 1-5 min | libre: 0=↓countdown 1=↑for-time
    rounds: number;         // emom / tabata / libre
    workTime: number;       // tabata / libre (secondes)
    restTime: number;       // tabata / libre (secondes)
    withCamera: boolean;
    sequence: string;     // JSON SeqBlock[] for 'libre' mode, else '[]'
    videoTitle: string;   // optional title overlay ('' = none)
    withTimestamp: boolean;
  };
};

export type WODStackParamList = {
  WODList: undefined;
  WODGenerator: undefined;
};

export type CompetitionStackParamList = {
  CompetitionList: undefined;
  PhysicalCompetition: undefined;
  TimerRun: {
    timerType: TimerType;
    countdown: number;
    totalSeconds: number;
    maxTime: number;
    interval: number;
    rounds: number;
    workTime: number;
    restTime: number;
    withCamera: boolean;
    sequence: string;
    videoTitle: string;
    withTimestamp: boolean;
  };
  Matchmaking: undefined;
  Match: { matchId: string };
  MatchWOD: {
    matchId: string;
    opponentName: string;
    opponentElo: number;
    opponentLevel: string;
    wodTitle: string;
    wodType: string;
    wodDuration: number;
    wodMovements: string;
    wodScoring: string;
  };
  MatchCamera: {
    matchId: string;
    wodTitle: string;
    wodType: string;
    wodDuration: number;
    wodMovements: string;
    wodScoring: string;
  };
  MatchScore: {
    matchId: string;
    recordedSeconds: number;
    wodTitle: string;
    wodType: string;
    wodScoring: string;
  };
  Tournament: { tournamentId: string };
  VideoPlayback: {
    videoURL: string;
    title?: string;
    recordedAt?: string;
    timerStartOffset?: number;
    timerStopOffset?: number;
    countdownDuration?: number;
  };
  TournamentWOD: {
    tournamentId: string;
    tournamentName: string;
    wod: {
      id: string;
      tournament_id: string;
      order_index: number;
      title: string;
      description: string | null;
      type: string;
      duration_minutes: number;
      movements: string[];
      scoring: string;
      deadline_hours: number;
      opens_at: string | null;
      closes_at: string | null;
      status: 'pending' | 'active' | 'closed';
      timer_type?: string | null;
      time_cap_seconds?: number | null;
      rounds?: number | null;
      work_seconds?: number | null;
      rest_seconds?: number | null;
    };
    existingScore: {
      tournament_wod_id: string;
      score_value: string;
      video_url: string | null;
      status: string;
    } | null;
  };
};

export type WhiteboardStackParamList = {
  WhiteboardMain: undefined;
  PublicProfile: { userId: string };
  Messages: undefined;
};

export type CommunityStackParamList = {
  CommunityMain: undefined;
  PublicProfile: { userId: string };
};

const RootStack       = createNativeStackNavigator<RootStackParamList>();
const AuthStack       = createNativeStackNavigator<AuthStackParamList>();
const OnbStack        = createNativeStackNavigator<OnboardingStackParamList>();
const Tab             = createBottomTabNavigator<MainTabParamList>();
const BOTab           = createBottomTabNavigator<BoxOwnerTabParamList>();
const BODashStack     = createNativeStackNavigator<BODashboardStackParamList>();
const WODStack        = createNativeStackNavigator<WODStackParamList>();
const CompStack       = createNativeStackNavigator<CompetitionStackParamList>();
const HomeStack       = createNativeStackNavigator<HomeStackParamList>();
const WhiteboardStack  = createNativeStackNavigator<WhiteboardStackParamList>();
const CommunityStack   = createNativeStackNavigator<CommunityStackParamList>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
}

function OnboardingNavigator() {
  return (
    <OnbStack.Navigator screenOptions={{ headerShown: false }}>
      <OnbStack.Screen name="Waiting"   component={WaitingScreen} />
      <OnbStack.Screen name="JoinBox"   component={JoinBoxScreen} />
      <OnbStack.Screen name="CreateBox" component={CreateBoxScreen} />
    </OnbStack.Navigator>
  );
}

function HomeNavigator() {
  const { user } = useAuth();
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="HomeList" component={HomeScreen} />
      <HomeStack.Screen name="WODGenerator" component={HomeWODGeneratorScreen} />
      <HomeStack.Screen name="OneRMCalculator" component={OneRMCalculatorScreen} />
      <HomeStack.Screen name="Timer" component={TimerScreen} />
      <HomeStack.Screen name="TimerRun" component={TimerRunScreen} />
      <HomeStack.Screen name="VideoPlayback" component={VideoPlaybackScreen} />
      <HomeStack.Screen name="Leaderboard" component={LeaderboardScreen} />
      <HomeStack.Screen name="Friends"     component={FriendsScreen} />
      <HomeStack.Screen name="WodHistory"   component={WodHistoryScreen} />
      <HomeStack.Screen name="NotificationSettings" component={NotificationSettingsScreen} />
      <HomeStack.Screen name="Profile" component={user?.role === 'admin' ? AdminScreen : ProfileScreen} />
      <HomeStack.Screen name="CompetitionDetail" component={CompetitionDetailScreen} />
      <HomeStack.Screen name="PublicProfile" component={PublicProfileScreen} />
    </HomeStack.Navigator>
  );
}

function WODNavigator() {
  return (
    <WODStack.Navigator screenOptions={{ headerShown: false }}>
      <WODStack.Screen name="WODList" component={WODScreen} />
      <WODStack.Screen name="WODGenerator" component={WODGeneratorScreen} />
    </WODStack.Navigator>
  );
}

function WhiteboardNavigator() {
  return (
    <WhiteboardStack.Navigator screenOptions={{ headerShown: false }}>
      <WhiteboardStack.Screen name="WhiteboardMain" component={WhiteboardScreen} />
      <WhiteboardStack.Screen name="PublicProfile"  component={PublicProfileScreen} />
      <WhiteboardStack.Screen name="Messages"       component={MessagesScreen} />
    </WhiteboardStack.Navigator>
  );
}

function CommunityNavigator() {
  return (
    <CommunityStack.Navigator screenOptions={{ headerShown: false }}>
      <CommunityStack.Screen name="CommunityMain" component={CommunityScreen} />
      <CommunityStack.Screen name="PublicProfile" component={PublicProfileScreen} />
    </CommunityStack.Navigator>
  );
}

function CompetitionNavigator() {
  return (
    <CompStack.Navigator screenOptions={{ headerShown: false }}>
      <CompStack.Screen name="CompetitionList"    component={CompetitionScreen} />
      <CompStack.Screen name="PhysicalCompetition" component={PhysicalCompetitionScreen} />
      <CompStack.Screen name="TimerRun"            component={TimerRunScreen} />
      <CompStack.Screen name="Matchmaking" component={MatchmakingScreen} />
      <CompStack.Screen name="Match" component={MatchScreen} />
      <CompStack.Screen name="MatchWOD" component={MatchWODScreen} />
      <CompStack.Screen name="MatchCamera" component={MatchCameraScreen} />
      <CompStack.Screen name="MatchScore" component={MatchScoreScreen} />
      <CompStack.Screen name="Tournament" component={TournamentScreen} />
      <CompStack.Screen name="TournamentWOD" component={TournamentWODScreen} />
      <CompStack.Screen name="VideoPlayback" component={VideoPlaybackScreen} />
    </CompStack.Navigator>
  );
}

function BODashboardNavigator() {
  return (
    <BODashStack.Navigator screenOptions={{ headerShown: false }}>
      <BODashStack.Screen name="Dashboard"    component={BODashboardScreen} />
      <BODashStack.Screen name="WODs"          component={BOWODsScreen} />
      <BODashStack.Screen name="Members"       component={BOMembersScreen} />
      <BODashStack.Screen name="BOTournament"  component={BOTournamentScreen} />
    </BODashStack.Navigator>
  );
}

function BoxOwnerTabs() {
  const { theme } = useTheme();
  const tabStyle = {
    backgroundColor: theme.tabBar,
    borderTopColor: theme.tabBarBorder,
    borderTopWidth: 1,
    height: 70,
    paddingBottom: 10,
    paddingTop: 8,
  };
  return (
    <BOTab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: tabStyle,
        tabBarActiveTintColor: theme.tabBarActive,
        tabBarInactiveTintColor: theme.tabBarInactive,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, React.ReactNode> = {
            BODashboard: <Building2 color={color} size={size} />,
            BOWODs:      <ClipboardList color={color} size={size} />,
            BOMembers:   <Users color={color} size={size} />,
            BOMessages:  <MessageCircle color={color} size={size} />,
            BOProfile:   <User color={color} size={size} />,
          };
          return icons[route.name] ?? null;
        },
      })}
    >
      <BOTab.Screen name="BODashboard" component={BODashboardNavigator} options={{ tabBarLabel: 'Dashboard' }} />
      <BOTab.Screen name="BOWODs"      component={BOWODsScreen}          options={{ tabBarLabel: 'WODs' }} />
      <BOTab.Screen name="BOMembers"   component={BOMembersScreen}       options={{ tabBarLabel: 'Membres' }} />
      <BOTab.Screen name="BOMessages"  component={MessagesScreen}        options={{ tabBarLabel: 'Messages' }} />
      <BOTab.Screen name="BOProfile"   component={ProfileScreen}         options={{ tabBarLabel: 'Profil' }} />
    </BOTab.Navigator>
  );
}

function MainTabs() {
  const { theme } = useTheme();
  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.tabBar,
          borderTopColor: theme.tabBarBorder,
          borderTopWidth: 1,
          height: 70,
          paddingBottom: 10,
          paddingTop: 8,
        },
        tabBarActiveTintColor: theme.tabBarActive,
        tabBarInactiveTintColor: theme.tabBarInactive,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ color, size, focused }) => {
          const icons: Record<string, React.ReactNode> = {
            Home:         <Home color={color} size={size} />,
            Competitions: <Trophy color={color} size={size} />,
            Whiteboard:   <Layout color={color} size={size} />,
          };
          return icons[route.name] ?? null;
        },
      })}
    >
      <Tab.Screen name="Competitions" component={CompetitionNavigator} options={{ tabBarLabel: 'Compétitions' }} />
      <Tab.Screen name="Home"         component={HomeNavigator}         options={{ tabBarLabel: 'Accueil', tabBarAccessibilityLabel: 'Accueil' }} />
      <Tab.Screen name="Whiteboard"   component={WhiteboardNavigator}   options={{ tabBarLabel: 'Whiteboard' }} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { session, user, currentBox, loading, boxSkipped } = useAuth();

  const { theme } = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  const isAuthenticated = !!session && !!user;
  const isSuperAdmin    = user?.role === 'super_admin' || user?.role === 'admin';
  const isBoxOwner      = user?.role === 'box_owner';
  const isB2BUser       = user?.role === 'member' || user?.role === 'box_owner';
  // Legacy 'athlete' users bypass onboarding — only new B2B roles require a box
  // boxSkipped = user explicitly chose to continue without a box
  const needsOnboarding = isAuthenticated && isB2BUser && !currentBox && !boxSkipped;

  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          // ── Not logged in ──────────────────────────────
          <RootStack.Screen name="Auth" component={AuthNavigator} />
        ) : needsOnboarding ? (
          // ── Logged in but no box yet ───────────────────
          <RootStack.Screen name="Onboarding" component={OnboardingNavigator} />
        ) : isBoxOwner ? (
          // ── Box owner with their box ───────────────────
          <RootStack.Screen name="BoxOwner" component={BoxOwnerTabs} />
        ) : (
          // ── Member / athlete / super_admin ─────────────
          <RootStack.Screen name="Main" component={MainTabs} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
