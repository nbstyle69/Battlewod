import { CommonActions } from '@react-navigation/native';
import { navigationRef } from '../navigation/navigationRef';

/**
 * Maps a push notification data payload to a navigation action.
 * Called when the user taps a notification (foreground or background).
 */
export function routeNotification(data: Record<string, any> | undefined) {
  if (!data?.type || !navigationRef.isReady()) return;

  const type = data.type as string;

  switch (type) {
    // ── WOD published / score reminder / score overtaken → Whiteboard tab ──
    case 'wod_published':
    case 'score_reminder':
    case 'score_overtaken':
      navigateToTab('Whiteboard', 'WhiteboardMain');
      break;

    // ── Friend request / accepted → Friends screen ──
    case 'friend_request':
    case 'friend_accepted':
      navigateToTab('Home', 'Friends');
      break;

    // ── Tournament closed / reminder → Tournament detail ──
    case 'tournament_closed':
    case 'tournament_reminder':
      if (data.tournamentId) {
        navigateToTab('Competitions', 'DailyTournamentDetail', {
          tournamentId: data.tournamentId,
        });
      } else {
        navigateToTab('Competitions', 'DailyTournaments');
      }
      break;

    // ── New message → Messages screen (inside Whiteboard tab) ──
    case 'new_message':
      navigateToTab('Whiteboard', 'Messages');
      break;

    default:
      break;
  }
}

/**
 * Navigate to a specific screen inside a tab.
 * Uses CommonActions.reset to switch tab, then navigates to the target screen.
 */
function navigateToTab(
  tabName: string,
  screenName: string,
  params?: Record<string, any>,
) {
  // First navigate to the correct tab
  navigationRef.dispatch(
    CommonActions.navigate({
      name: tabName,
      params: {
        screen: screenName,
        params,
      },
    }),
  );
}
