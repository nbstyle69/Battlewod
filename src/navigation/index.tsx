import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Image, ActivityIndicator, Platform } from 'react-native';
import { Dumbbell, Trophy, Layout, User, Building2, ClipboardList, Users, MessageCircle, Home, CalendarClock } from 'lucide-react-native';
import KettlebellIcon from '../components/KettlebellIcon';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { Colors } from '../theme/colors';
import { useTheme } from '../context/ThemeContext';

import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import ForgotPasswordScreen from '../screens/auth/ForgotPasswordScreen';
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
import TournamentScreen from '../screens/competition/TournamentScreen';
import TournamentWODScreen from '../screens/competition/TournamentWODScreen';
import BOTournamentScreen from '../screens/backoffice/BOTournamentScreen';
import LeaderboardScreen from '../screens/leaderboard/LeaderboardScreen';
import WhiteboardScreen from '../screens/whiteboard/WhiteboardScreen';
import WODDetailScreen from '../screens/whiteboard/WODDetailScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import AdminScreen from '../screens/admin/AdminScreen';
import BODashboardScreen from '../screens/backoffice/BODashboardScreen';
import BOMembersScreen from '../screens/backoffice/BOMembersScreen';
import BOWODsScreen from '../screens/backoffice/BOWODsScreen';
import BOScheduleScreen from '../screens/backoffice/BOScheduleScreen';
import BOStatsScreen from '../screens/backoffice/BOStatsScreen';
import BOReportScreen from '../screens/backoffice/BOReportScreen';
import BONotificationsScreen from '../screens/backoffice/BONotificationsScreen';
import BOGamificationScreen from '../screens/backoffice/BOGamificationScreen';
import MessagesScreen from '../screens/messages/MessagesScreen';
import CommunityScreen from '../screens/community/CommunityScreen';
import CompetitionDetailScreen from '../screens/competition/CompetitionDetailScreen';
import PublicProfileScreen from '../screens/profile/PublicProfileScreen';
import FriendsScreen from '../screens/home/FriendsScreen';
import WodHistoryScreen from '../screens/wod/WodHistoryScreen';
import NotificationSettingsScreen from '../screens/settings/NotificationSettingsScreen';
import DailyTournamentsScreen from '../screens/tournament/DailyTournamentsScreen';
import DailyTournamentDetailScreen from '../screens/tournament/DailyTournamentDetailScreen';
import ReservationScreen from '../screens/reservation/ReservationScreen';
import MyReservationsScreen from '../screens/reservation/MyReservationsScreen';
import InterCompetitionListScreen from '../screens/competition/InterCompetitionListScreen';
import InterCompetitionDetailScreen from '../screens/competition/InterCompetitionDetailScreen';
import InterScoreSubmitScreen from '../screens/competition/InterScoreSubmitScreen';
import InterTeamScreen from '../screens/competition/InterTeamScreen';
import DocumentsScreen from '../screens/documents/DocumentsScreen';
import EloHistoryScreen from '../screens/profile/EloHistoryScreen';
import LegalScreen from '../screens/documents/LegalScreen';
import ChangelogScreen from '../screens/home/ChangelogScreen';

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
  BOSchedule: undefined;
  BOMembers: undefined;
  BOMessages: undefined;
  BOProfile: undefined;
};

export type BOProfileStackParamList = {
  ProfileMain: undefined;
  EloHistory: undefined;
  Legal: undefined;
  PublicProfile: { userId: string };
  NotificationSettings: undefined;
};

export type BODashboardStackParamList = {
  Dashboard: undefined;
  WODs: undefined;
  Members: undefined;
  BOTournament: undefined;
  BOStats: undefined;
  BOReport: undefined;
  BONotifications: undefined;
  BOGamification: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  Legal: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Competitions: undefined;
  Whiteboard: undefined;
  Reservation: undefined;
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
  Changelog: undefined;
  WODGenerator: undefined;
  WodHistory: undefined;
  NotificationSettings: undefined;
  DailyTournaments: undefined;
  DailyTournamentDetail: { tournamentId: string };
  OneRMCalculator: undefined;
  Timer: undefined;
  Leaderboard: undefined;
  Profile: undefined;
  EloHistory: undefined;
  Legal: undefined;
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
    overlaysBurned?: boolean;
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
  WodHistory: undefined;
};

export type CompetitionStackParamList = {
  CompetitionList: undefined;
  PhysicalCompetition: undefined;
  DailyTournaments: undefined;
  DailyTournamentDetail: { tournamentId: string };
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
  Tournament: { tournamentId: string };
  InterCompetitionList: undefined;
  InterCompetitionDetail: { competitionId: string };
  InterScoreSubmit: {
    competitionId: string;
    wodId: string;
    wodTitle: string;
    wodDescription: string;
    timeCap: number | null;
    scoringType: string;
    existingScore: { id: string; score_value: any; score_display: string | null; video_url: string | null; status: string } | null;
  };
  InterTeam: { competitionId: string; teamSize: number };
  VideoPlayback: {
    videoURL: string;
    title?: string;
    recordedAt?: string;
    timerStartOffset?: number;
    timerStopOffset?: number;
    countdownDuration?: number;
    overlaysBurned?: boolean;
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
  WODDetail: { wodId: string; scrollToLeaderboard?: boolean };
  PublicProfile: { userId: string };
  Messages: undefined;
  Documents: undefined;
};

export type CommunityStackParamList = {
  CommunityMain: undefined;
  PublicProfile: { userId: string };
};

export type ReservationStackParamList = {
  ReservationMain: undefined;
  MyReservations: undefined;
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
const ResStack          = createNativeStackNavigator<ReservationStackParamList>();
const BOProfileStack    = createNativeStackNavigator<BOProfileStackParamList>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <AuthStack.Screen name="Legal" component={LegalScreen} />
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
      <HomeStack.Screen name="Changelog" component={ChangelogScreen} />
      <HomeStack.Screen name="WODGenerator" component={HomeWODGeneratorScreen} />
      <HomeStack.Screen name="OneRMCalculator" component={OneRMCalculatorScreen} />
      <HomeStack.Screen name="Timer" component={TimerScreen} />
      <HomeStack.Screen name="TimerRun" component={TimerRunScreen} />
      <HomeStack.Screen name="VideoPlayback" component={VideoPlaybackScreen} />
      <HomeStack.Screen name="Leaderboard" component={LeaderboardScreen} />
      <HomeStack.Screen name="Friends"     component={FriendsScreen} />
      <HomeStack.Screen name="WodHistory"   component={WodHistoryScreen} />
      <HomeStack.Screen name="NotificationSettings" component={NotificationSettingsScreen} />
      <HomeStack.Screen name="DailyTournaments" component={DailyTournamentsScreen} />
      <HomeStack.Screen name="DailyTournamentDetail" component={DailyTournamentDetailScreen} />
      <HomeStack.Screen name="Profile" component={user?.role === 'admin' || user?.role === 'super_admin' ? AdminScreen : ProfileScreen} />
      <HomeStack.Screen name="CompetitionDetail" component={CompetitionDetailScreen} />
      <HomeStack.Screen name="PublicProfile" component={PublicProfileScreen} />
      <HomeStack.Screen name="EloHistory" component={EloHistoryScreen} />
      <HomeStack.Screen name="Legal" component={LegalScreen} />
    </HomeStack.Navigator>
  );
}

function WODNavigator() {
  return (
    <WODStack.Navigator screenOptions={{ headerShown: false }}>
      <WODStack.Screen name="WODList" component={WODScreen} />
      <WODStack.Screen name="WODGenerator" component={WODGeneratorScreen} />
      <WODStack.Screen name="WodHistory"   component={WodHistoryScreen} />
    </WODStack.Navigator>
  );
}

function WhiteboardNavigator() {
  return (
    <WhiteboardStack.Navigator screenOptions={{ headerShown: false }}>
      <WhiteboardStack.Screen name="WhiteboardMain" component={WhiteboardScreen} />
      <WhiteboardStack.Screen name="WODDetail"      component={WODDetailScreen} />
      <WhiteboardStack.Screen name="PublicProfile"  component={PublicProfileScreen} />
      <WhiteboardStack.Screen name="Messages"       component={MessagesScreen} />
      <WhiteboardStack.Screen name="Documents"      component={DocumentsScreen} />
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

function ReservationNavigator() {
  return (
    <ResStack.Navigator screenOptions={{ headerShown: false }}>
      <ResStack.Screen name="ReservationMain" component={ReservationScreen} />
      <ResStack.Screen name="MyReservations" component={MyReservationsScreen} />
    </ResStack.Navigator>
  );
}

function CompetitionNavigator() {
  return (
    <CompStack.Navigator screenOptions={{ headerShown: false }}>
      <CompStack.Screen name="CompetitionList"    component={CompetitionScreen} />
      <CompStack.Screen name="PhysicalCompetition" component={PhysicalCompetitionScreen} />
      <CompStack.Screen name="TimerRun"            component={TimerRunScreen} />
      <CompStack.Screen name="Tournament" component={TournamentScreen} />
      <CompStack.Screen name="TournamentWOD" component={TournamentWODScreen} />
      <CompStack.Screen name="VideoPlayback" component={VideoPlaybackScreen} />
      <CompStack.Screen name="DailyTournaments" component={DailyTournamentsScreen} />
      <CompStack.Screen name="DailyTournamentDetail" component={DailyTournamentDetailScreen} />
      <CompStack.Screen name="InterCompetitionList" component={InterCompetitionListScreen} />
      <CompStack.Screen name="InterCompetitionDetail" component={InterCompetitionDetailScreen} />
      <CompStack.Screen name="InterScoreSubmit" component={InterScoreSubmitScreen} />
      <CompStack.Screen name="InterTeam" component={InterTeamScreen} />
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
      <BODashStack.Screen name="BOStats"        component={BOStatsScreen} />
      <BODashStack.Screen name="BOReport"       component={BOReportScreen} />
      <BODashStack.Screen name="BONotifications" component={BONotificationsScreen} />
      <BODashStack.Screen name="BOGamification" component={BOGamificationScreen} />
    </BODashStack.Navigator>
  );
}

function BoxOwnerTabs() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const tabStyle = {
    backgroundColor: theme.tabBar,
    borderTopColor: theme.tabBarBorder,
    borderTopWidth: 1,
    height: 60 + insets.bottom,
    paddingBottom: 10 + insets.bottom,
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
            BOSchedule:  <CalendarClock color={color} size={size} />,
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
      <BOTab.Screen name="BOSchedule"  component={BOScheduleScreen}      options={{ tabBarLabel: 'Horaires' }} />
      <BOTab.Screen name="BOMembers"   component={BOMembersScreen}       options={{ tabBarLabel: 'Membres' }} />
      <BOTab.Screen name="BOMessages"  component={MessagesScreen}        options={{ tabBarLabel: 'Messages' }} />
      <BOTab.Screen name="BOProfile"   component={BOProfileNavigator}    options={{ tabBarLabel: 'Profil' }} />
    </BOTab.Navigator>
  );
}

function BOProfileNavigator() {
  const { user } = useAuth();
  return (
    <BOProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <BOProfileStack.Screen name="ProfileMain" component={user?.role === 'admin' || user?.role === 'super_admin' ? AdminScreen : ProfileScreen} />
      <BOProfileStack.Screen name="EloHistory" component={EloHistoryScreen} />
      <BOProfileStack.Screen name="Legal" component={LegalScreen} />
      <BOProfileStack.Screen name="PublicProfile" component={PublicProfileScreen} />
      <BOProfileStack.Screen name="NotificationSettings" component={NotificationSettingsScreen} />
    </BOProfileStack.Navigator>
  );
}

function MainTabs() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'android' ? insets.bottom : 0;
  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.tabBar,
          borderTopColor: theme.tabBarBorder,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 84 : 60 + bottomInset,
          paddingBottom: Platform.OS === 'ios' ? 24 : 10 + bottomInset,
          paddingTop: 8,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarActiveTintColor: theme.tabBarActive,
        tabBarInactiveTintColor: theme.tabBarInactive,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.2 },
        tabBarIcon: ({ color, size, focused }) => {
          const iconSize = 22;
          const icons: Record<string, React.ReactNode> = {
            Competitions: <Trophy color={color} size={iconSize} />,
            Home:         <Home color={color} size={iconSize} />,
            Whiteboard:   <Layout color={color} size={iconSize} />,
            Reservation:  <CalendarClock color={color} size={iconSize} />,
          };
          return (
            <View style={{ alignItems: 'center', gap: 3 }}>
              {icons[route.name] ?? null}
              {focused && (
                <View style={{
                  width: 4, height: 4, borderRadius: 2,
                  backgroundColor: theme.tabBarActive,
                }} />
              )}
            </View>
          );
        },
      })}
    >
      <Tab.Screen name="Competitions" component={CompetitionNavigator} options={{ tabBarLabel: 'Compétitions' }} />
      <Tab.Screen name="Home"         component={HomeNavigator}         options={{ tabBarLabel: 'Accueil' }} />
      <Tab.Screen name="Whiteboard"   component={WhiteboardNavigator}   options={{ tabBarLabel: 'Ma Box' }} />
      <Tab.Screen name="Reservation"  component={ReservationNavigator}  options={{ tabBarLabel: 'Réservation' }} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { session, user, currentBox, loading, boxSkipped } = useAuth();
  const { theme } = useTheme();
  const [splashDone, setSplashDone] = React.useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setSplashDone(true), 1500);
    return () => clearTimeout(t);
  }, []);

  if (loading || !splashDone) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0A0A0F', justifyContent: 'center', alignItems: 'center', gap: 32 }}>
        <Image
          source={require('../../assets/logo.png')}
          style={{ width: 180, height: 180, resizeMode: 'contain' }}
        />
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
