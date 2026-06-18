import React from 'react';
import { NavigationContainer, NavigatorScreenParams, DefaultTheme } from '@react-navigation/native';

// Dark navigation theme to avoid a white background flash between screens before
// each screen's content has mounted.
const NAV_DARK_THEME = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: '#0a0a0a',
    card: '#0a0a0a',
  },
};
import { navigationRef } from './navigationRef';
import { linking } from './linking';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Image, ActivityIndicator, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import OnboardingTutorialScreen, { ONBOARDING_KEY } from '../screens/onboarding/OnboardingTutorialScreen';
import { Dumbbell, Trophy, Layout, User, Building2, ClipboardList, Users, MessageCircle, Home, CalendarClock, Compass } from 'lucide-react-native';
import KettlebellIcon from '../components/KettlebellIcon';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as NavigationBar from 'expo-navigation-bar';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import GlassTabBarBackground from '../components/glass/GlassTabBarBackground';

function useAndroidNavBar(bgColor: string, mode: 'light' | 'dark') {
  React.useEffect(() => {
    if (Platform.OS !== 'android') return;
    try {
      NavigationBar.setBackgroundColorAsync(bgColor);
      NavigationBar.setButtonStyleAsync(mode === 'dark' ? 'light' : 'dark');
    } catch (_) {}
  }, [bgColor, mode]);
}

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
import PersonalWODFormScreen from '../screens/whiteboard/PersonalWODFormScreen';
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
import BOArticlesScreen from '../screens/backoffice/BOArticlesScreen';
import BOSettingsScreen from '../screens/backoffice/BOSettingsScreen';
import BOProgramsScreen from '../screens/backoffice/BOProgramsScreen';
import BOProgramEditorScreen from '../screens/backoffice/BOProgramEditorScreen';
import ArticlesScreen from '../screens/whiteboard/ArticlesScreen';
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
import BlockedUsersScreen from '../screens/profile/BlockedUsersScreen';
import ChangelogScreen from '../screens/home/ChangelogScreen';
import ExplorerScreen from '../screens/explorer/ExplorerScreen';
import ProgrammationScreen from '../screens/explorer/ProgrammationScreen';
import BoxDirectoryScreen from '../screens/explorer/BoxDirectoryScreen';
import BoxDirectoryMapScreen from '../screens/explorer/BoxDirectoryMapScreen';
import BoxDirectoryDetailScreen from '../screens/explorer/BoxDirectoryDetailScreen';
import PartnersScreen from '../screens/explorer/PartnersScreen';
import PartnerDetailScreen from '../screens/explorer/PartnerDetailScreen';
import BoxProgramsScreen from '../screens/explorer/BoxProgramsScreen';
import BoxInfoScreen from '../screens/home/BoxInfoScreen';
import BOBoxInfoScreen from '../screens/backoffice/BOBoxInfoScreen';
import BOSubscriptionScreen from '../screens/backoffice/BOSubscriptionScreen';
import BOPaywallScreen from '../screens/backoffice/BOPaywallScreen';

export type RootStackParamList = {
  Auth: undefined;
  Onboarding: undefined;
  Main: undefined;
  BoxOwner: undefined;
  Coach: undefined;
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

export type CoachTabParamList = {
  CoachWODs: undefined;
  CoachSchedule: undefined;
  CoachWhiteboard: undefined;
  CoachMessages: undefined;
  CoachProfile: undefined;
};

export type BOProfileStackParamList = {
  ProfileMain: undefined;
  EloHistory: undefined;
  BlockedUsers: undefined;
  WODDetail: { wodId: string; scrollToLeaderboard?: boolean };
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
  BOArticles: undefined;
  BOSettings: undefined;
  BOBoxInfo: undefined;
  BOSubscription: undefined;
  BOPrograms: undefined;
  BOProgramEditor: { programId: string; programTitle: string; durationWeeks?: number; daysPerWeek?: number; progType: string };
};

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  Legal: undefined;
};

export type MainTabParamList = {
  Home: NavigatorScreenParams<HomeStackParamList>;
  Competitions: NavigatorScreenParams<CompetitionStackParamList>;
  Explorer: NavigatorScreenParams<ExplorerStackParamList>;
  Whiteboard: NavigatorScreenParams<WhiteboardStackParamList>;
  Reservation: NavigatorScreenParams<ReservationStackParamList>;
};

export type ExplorerStackParamList = {
  ExplorerMain: undefined;
  Programmation: undefined;
  BoxDirectory: undefined;
  BoxDirectoryMap: { boxes: any[] };
  BoxDirectoryDetail: { boxId: string };
  Partners: undefined;
  PartnerDetail: { partnerId: string };
  BoxPrograms: undefined;
};

export type TimerType = 'for-time' | 'amrap' | 'emom' | 'tabata' | 'ywyr' | 'splits' | 'libre';
export type BlockType = Exclude<TimerType, 'libre' | 'splits'>;
export type SeqBlock = {
  id: string;
  type: BlockType;
  durationMin: number;  // amrap/for-time duration (0=unlimited for ft)
  emomInterval: number; // 1-5 min, ou 0 = mode PERSO (utilise emomCustomSec)
  emomRounds: number;
  emomCustomSec?: number; // intervalle perso en secondes (mode PERSO)
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
  BoxInfo: undefined;
  Changelog: undefined;
  WODGenerator: undefined;
  WodHistory: undefined;
  NotificationSettings: undefined;
  BlockedUsers: undefined;
  DailyTournaments: undefined;
  DailyTournamentDetail: { tournamentId: string };
  OneRMCalculator: undefined;
  Timer: undefined;
  Leaderboard: undefined;
  Profile: undefined;
  EloHistory: undefined;
  WODDetail: { wodId: string; scrollToLeaderboard?: boolean };
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
    competitionLogoUrl?: string; // physical competition logo overlay (top-left)
  };
};

export type WODStackParamList = {
  WODList: undefined;
  WODGenerator: undefined;
  WodHistory: undefined;
};

export type CompetitionStackParamList = {
  CompetitionList: { initialTab?: number } | undefined;
  PhysicalCompetition: { mode: 'qualification' | 'info' };
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
    competitionLogoUrl?: string; // physical competition logo overlay (top-left)
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
  Articles: undefined;
  PersonalWODForm: { wodId?: string; date?: string } | undefined;
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
    competitionLogoUrl?: string;
    countdownDuration?: number;
    overlaysBurned?: boolean;
  };
  VideoPlayback: {
    videoUri: string;
    durationMs: number;
    timerType?: string;
    countdownDuration?: number;
    overlaysBurned?: boolean;
  };
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
const ExplStack         = createNativeStackNavigator<ExplorerStackParamList>();
const BOProfileStack    = createNativeStackNavigator<BOProfileStackParamList>();
const CoachTab          = createBottomTabNavigator<CoachTabParamList>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0a0a0a' } }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <AuthStack.Screen name="Legal" component={LegalScreen} />
    </AuthStack.Navigator>
  );
}

function OnboardingNavigator() {
  return (
    <OnbStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0a0a0a' } }}>
      <OnbStack.Screen name="Waiting"   component={WaitingScreen} />
      <OnbStack.Screen name="JoinBox"   component={JoinBoxScreen} />
      <OnbStack.Screen name="CreateBox" component={CreateBoxScreen} />
    </OnbStack.Navigator>
  );
}

function HomeNavigator() {
  const { user } = useAuth();
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0a0a0a' } }}>
      <HomeStack.Screen name="HomeList" component={HomeScreen} />
      <HomeStack.Screen name="BoxInfo" component={BoxInfoScreen} />
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
      <HomeStack.Screen name="BlockedUsers" component={BlockedUsersScreen} />
      <HomeStack.Screen name="DailyTournaments" component={DailyTournamentsScreen} />
      <HomeStack.Screen name="DailyTournamentDetail" component={DailyTournamentDetailScreen} />
      <HomeStack.Screen name="Profile" component={user?.role === 'admin' || user?.role === 'super_admin' ? AdminScreen : ProfileScreen} />
      <HomeStack.Screen name="CompetitionDetail" component={CompetitionDetailScreen} />
      <HomeStack.Screen name="PublicProfile" component={PublicProfileScreen} />
      <HomeStack.Screen name="EloHistory" component={EloHistoryScreen} />
      <HomeStack.Screen name="WODDetail" component={WODDetailScreen} />
      <HomeStack.Screen name="Legal" component={LegalScreen} />
    </HomeStack.Navigator>
  );
}

function WODNavigator() {
  return (
    <WODStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0a0a0a' } }}>
      <WODStack.Screen name="WODList" component={WODScreen} />
      <WODStack.Screen name="WODGenerator" component={WODGeneratorScreen} />
      <WODStack.Screen name="WodHistory"   component={WodHistoryScreen} />
    </WODStack.Navigator>
  );
}

function WhiteboardNavigator() {
  return (
    <WhiteboardStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0a0a0a' } }}>
      <WhiteboardStack.Screen name="WhiteboardMain" component={WhiteboardScreen} />
      <WhiteboardStack.Screen name="WODDetail"      component={WODDetailScreen} />
      <WhiteboardStack.Screen name="PublicProfile"  component={PublicProfileScreen} />
      <WhiteboardStack.Screen name="Messages"       component={MessagesScreen} />
      <WhiteboardStack.Screen name="Documents"      component={DocumentsScreen} />
      <WhiteboardStack.Screen name="Articles"        component={ArticlesScreen} />
      <WhiteboardStack.Screen name="PersonalWODForm" component={PersonalWODFormScreen} />
      <WhiteboardStack.Screen name="TimerRun"        component={TimerRunScreen} />
      <WhiteboardStack.Screen name="VideoPlayback"  component={VideoPlaybackScreen} />
    </WhiteboardStack.Navigator>
  );
}

function CommunityNavigator() {
  return (
    <CommunityStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0a0a0a' } }}>
      <CommunityStack.Screen name="CommunityMain" component={CommunityScreen} />
      <CommunityStack.Screen name="PublicProfile" component={PublicProfileScreen} />
    </CommunityStack.Navigator>
  );
}

function ReservationNavigator() {
  return (
    <ResStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0a0a0a' } }}>
      <ResStack.Screen name="ReservationMain" component={ReservationScreen} />
      <ResStack.Screen name="MyReservations" component={MyReservationsScreen} />
    </ResStack.Navigator>
  );
}

function ExplorerNavigator() {
  return (
    <ExplStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0a0a0a' } }}>
      <ExplStack.Screen name="ExplorerMain" component={ExplorerScreen} />
      <ExplStack.Screen name="Programmation" component={ProgrammationScreen} />
      <ExplStack.Screen name="BoxDirectory" component={BoxDirectoryScreen} />
      <ExplStack.Screen name="BoxDirectoryMap" component={BoxDirectoryMapScreen} />
      <ExplStack.Screen name="BoxDirectoryDetail" component={BoxDirectoryDetailScreen} />
      <ExplStack.Screen name="Partners" component={PartnersScreen} />
      <ExplStack.Screen name="PartnerDetail" component={PartnerDetailScreen} />
      <ExplStack.Screen name="BoxPrograms" component={BoxProgramsScreen} />
    </ExplStack.Navigator>
  );
}

function CompetitionNavigator() {
  return (
    <CompStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0a0a0a' } }}>
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
    <BODashStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0a0a0a' } }}>
      <BODashStack.Screen name="Dashboard"    component={BODashboardScreen} />
      <BODashStack.Screen name="WODs"          component={BOWODsScreen} />
      <BODashStack.Screen name="Members"       component={BOMembersScreen} />
      <BODashStack.Screen name="BOTournament"  component={BOTournamentScreen} />
      <BODashStack.Screen name="BOStats"        component={BOStatsScreen} />
      <BODashStack.Screen name="BOReport"       component={BOReportScreen} />
      <BODashStack.Screen name="BONotifications" component={BONotificationsScreen} />
      <BODashStack.Screen name="BOGamification" component={BOGamificationScreen} />
      <BODashStack.Screen name="BOArticles" component={BOArticlesScreen} />
      <BODashStack.Screen name="BOSettings" component={BOSettingsScreen} />
      <BODashStack.Screen name="BOBoxInfo" component={BOBoxInfoScreen} />
      <BODashStack.Screen name="BOSubscription" component={BOSubscriptionScreen} />
      <BODashStack.Screen name="BOPrograms" component={BOProgramsScreen} />
      <BODashStack.Screen name="BOProgramEditor" component={BOProgramEditorScreen} />
    </BODashStack.Navigator>
  );
}

function BoxOwnerTabs() {
  const { theme, mode } = useTheme();
  const insets = useSafeAreaInsets();
  useAndroidNavBar(theme.tabBar, mode);
  const tabStyle = {
    position: 'absolute' as const,
    backgroundColor: 'transparent',
    borderTopColor: 'transparent',
    borderTopWidth: 0,
    height: 60 + insets.bottom,
    paddingBottom: 10 + insets.bottom,
    paddingTop: 8,
    elevation: 0,
    shadowOpacity: 0,
  };
  return (
    <BOTab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: tabStyle,
        tabBarBackground: () => <GlassTabBarBackground />,
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
    <BOProfileStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0a0a0a' } }}>
      <BOProfileStack.Screen name="ProfileMain" component={user?.role === 'admin' || user?.role === 'super_admin' ? AdminScreen : ProfileScreen} />
      <BOProfileStack.Screen name="EloHistory" component={EloHistoryScreen} />
      <BOProfileStack.Screen name="WODDetail" component={WODDetailScreen} />
      <BOProfileStack.Screen name="Legal" component={LegalScreen} />
      <BOProfileStack.Screen name="PublicProfile" component={PublicProfileScreen} />
      <BOProfileStack.Screen name="NotificationSettings" component={NotificationSettingsScreen} />
      <BOProfileStack.Screen name="BlockedUsers" component={BlockedUsersScreen} />
    </BOProfileStack.Navigator>
  );
}

function CoachTabs() {
  const { theme, mode } = useTheme();
  const insets = useSafeAreaInsets();
  useAndroidNavBar(theme.tabBar, mode);
  const tabStyle = {
    position: 'absolute' as const,
    backgroundColor: 'transparent',
    borderTopColor: 'transparent',
    borderTopWidth: 0,
    height: 60 + insets.bottom,
    paddingBottom: 10 + insets.bottom,
    paddingTop: 8,
    elevation: 0,
    shadowOpacity: 0,
  };
  return (
    <CoachTab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: tabStyle,
        tabBarBackground: () => <GlassTabBarBackground />,
        tabBarActiveTintColor: theme.tabBarActive,
        tabBarInactiveTintColor: theme.tabBarInactive,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, React.ReactNode> = {
            CoachWODs:       <ClipboardList color={color} size={size} />,
            CoachSchedule:   <CalendarClock color={color} size={size} />,
            CoachWhiteboard: <Layout color={color} size={size} />,
            CoachMessages:   <MessageCircle color={color} size={size} />,
            CoachProfile:    <User color={color} size={size} />,
          };
          return icons[route.name] ?? null;
        },
      })}
    >
      <CoachTab.Screen name="CoachWODs"       component={BOWODsScreen}       options={{ tabBarLabel: 'WODs' }} />
      <CoachTab.Screen name="CoachSchedule"   component={BOScheduleScreen}   options={{ tabBarLabel: 'Horaires' }} />
      <CoachTab.Screen name="CoachWhiteboard" component={WhiteboardNavigator} options={{ tabBarLabel: 'Whiteboard' }} />
      <CoachTab.Screen name="CoachMessages"   component={MessagesScreen}     options={{ tabBarLabel: 'Messages' }} />
      <CoachTab.Screen name="CoachProfile"    component={BOProfileNavigator} options={{ tabBarLabel: 'Profil' }} />
    </CoachTab.Navigator>
  );
}

function MainTabs() {
  const { theme, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'android' ? insets.bottom : 0;
  useAndroidNavBar(theme.tabBar, mode);
  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: 'transparent',
          borderTopColor: 'transparent',
          borderTopWidth: 0,
          height: Platform.OS === 'ios' ? 84 : 60 + bottomInset,
          paddingBottom: Platform.OS === 'ios' ? 24 : 10 + bottomInset,
          paddingTop: 8,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarBackground: () => <GlassTabBarBackground />,
        tabBarActiveTintColor: theme.tabBarActive,
        tabBarInactiveTintColor: theme.tabBarInactive,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.2 },
        tabBarIcon: ({ color, size, focused }) => {
          const iconSize = 22;
          const icons: Record<string, React.ReactNode> = {
            Competitions: <Trophy color={color} size={iconSize} />,
            Home:         <Home color={color} size={iconSize} />,
            Explorer:     <Compass color={color} size={iconSize} />,
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
      <Tab.Screen name="Competitions" component={CompetitionNavigator} options={{ tabBarLabel: 'Compete' }}
        listeners={({ navigation }) => ({ tabPress: () => navigation.navigate('Competitions', { screen: 'CompetitionList' }) })} />
      <Tab.Screen name="Explorer"     component={ExplorerNavigator}     options={{ tabBarLabel: 'Explorer' }}
        listeners={({ navigation }) => ({ tabPress: () => navigation.navigate('Explorer', { screen: 'ExplorerMain' }) })} />
      <Tab.Screen name="Home"         component={HomeNavigator}         options={{ tabBarLabel: 'Accueil' }}
        listeners={({ navigation }) => ({ tabPress: () => navigation.navigate('Home', { screen: 'HomeList' }) })} />
      <Tab.Screen name="Whiteboard"   component={WhiteboardNavigator}   options={{ tabBarLabel: 'Ma Box' }}
        listeners={({ navigation }) => ({ tabPress: () => navigation.navigate('Whiteboard', { screen: 'WhiteboardMain' }) })} />
      <Tab.Screen name="Reservation"  component={ReservationNavigator}  options={{ tabBarLabel: 'Résa' }}
        listeners={({ navigation }) => ({ tabPress: () => navigation.navigate('Reservation', { screen: 'ReservationMain' }) })} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { session, user, currentBox, boxRole, loading, boxSkipped, isBoxActive, boxSubscription } = useAuth();
  const { theme } = useTheme();
  const [splashDone, setSplashDone] = React.useState(false);
  const [onboardingDone, setOnboardingDone] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setSplashDone(true), 1500);
    return () => clearTimeout(t);
  }, []);

  React.useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then(v => setOnboardingDone(v === 'true'));
    // Re-read whenever the authenticated user changes so a freshly registered account sees the tutorial
  }, [user?.id]);

  if (loading || !splashDone || onboardingDone === null) {
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

  // Show tutorial on first launch (before anything else)
  if (!onboardingDone) {
    return <OnboardingTutorialScreen onDone={() => setOnboardingDone(true)} />;
  }

  const isAuthenticated = !!session && !!user;
  const isSuperAdmin    = user?.role === 'super_admin' || user?.role === 'admin';
  const isBoxOwner      = user?.role === 'box_owner' || boxRole === 'owner';
  const isCoach         = boxRole === 'coach';
  const isB2BUser       = user?.role === 'member' || user?.role === 'box_owner';
  // Legacy 'athlete' users bypass onboarding — only new B2B roles require a box
  // boxSkipped = user explicitly chose to continue without a box
  const needsOnboarding = isAuthenticated && isB2BUser && !currentBox && !boxSkipped;

  return (
    <NavigationContainer ref={navigationRef} linking={linking} theme={NAV_DARK_THEME}>
      <RootStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0a0a0a' } }}>
        {!isAuthenticated ? (
          // ── Not logged in ──────────────────────────────
          <RootStack.Screen name="Auth" component={AuthNavigator} />
        ) : needsOnboarding ? (
          // ── Logged in but no box yet ───────────────────
          <RootStack.Screen name="Onboarding" component={OnboardingNavigator} />
        ) : isBoxOwner && !isBoxActive ? (
          // ── Box owner with expired subscription ────────
          <RootStack.Screen name="BoxOwner" component={BOPaywallScreen} />
        ) : isBoxOwner ? (
          // ── Box owner with their box ───────────────────
          <RootStack.Screen name="BoxOwner" component={BoxOwnerTabs} />
        ) : isCoach && currentBox ? (
          // ── Coach with their box ────────────────────────
          <RootStack.Screen name="Coach" component={CoachTabs} />
        ) : (
          // ── Member / athlete / super_admin ─────────────
          <RootStack.Screen name="Main" component={MainTabs} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
