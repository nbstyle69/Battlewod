import { routeNotification } from '../services/notificationRouter';
import { navigationRef } from '../navigation/navigationRef';
import { CommonActions } from '@react-navigation/native';

// ── Mocks ─────────────────────────────────────────────────────────────
jest.mock('@react-navigation/native', () => ({
  CommonActions: {
    navigate: jest.fn((args: any) => ({ type: 'NAVIGATE', payload: args })),
  },
}));

jest.mock('../navigation/navigationRef', () => ({
  navigationRef: {
    isReady: jest.fn(),
    dispatch: jest.fn(),
  },
}));

const mockIsReady = navigationRef.isReady as jest.Mock;
const mockDispatch = navigationRef.dispatch as jest.Mock;
const mockNavigate = CommonActions.navigate as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockIsReady.mockReturnValue(true);
  mockNavigate.mockImplementation((args: any) => ({ type: 'NAVIGATE', payload: args }));
});

// ── Tests ─────────────────────────────────────────────────────────────
describe('routeNotification', () => {
  describe('guard clauses', () => {
    it('does nothing when data is undefined', () => {
      routeNotification(undefined);
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it('does nothing when data has no type', () => {
      routeNotification({});
      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it('does nothing when navigator is not ready', () => {
      mockIsReady.mockReturnValue(false);
      routeNotification({ type: 'wod_published' });
      expect(mockDispatch).not.toHaveBeenCalled();
    });
  });

  describe('WOD / score notifications → Whiteboard tab', () => {
    it.each(['wod_published', 'score_reminder', 'score_overtaken'])(
      'routes "%s" to Whiteboard > WhiteboardMain',
      (type) => {
        routeNotification({ type });
        expect(mockNavigate).toHaveBeenCalledWith({
          name: 'Whiteboard',
          params: { screen: 'WhiteboardMain', params: undefined },
        });
        expect(mockDispatch).toHaveBeenCalledTimes(1);
      },
    );
  });

  describe('friend notifications → Home tab', () => {
    it.each(['friend_request', 'friend_accepted'])(
      'routes "%s" to Home > Friends',
      (type) => {
        routeNotification({ type });
        expect(mockNavigate).toHaveBeenCalledWith({
          name: 'Home',
          params: { screen: 'Friends', params: undefined },
        });
      },
    );
  });

  describe('tournament notifications → Competitions tab', () => {
    it.each(['tournament_closed', 'tournament_reminder'])(
      'routes "%s" with tournamentId to DailyTournamentDetail',
      (type) => {
        routeNotification({ type, tournamentId: 'abc-123' });
        expect(mockNavigate).toHaveBeenCalledWith({
          name: 'Competitions',
          params: {
            screen: 'DailyTournamentDetail',
            params: { tournamentId: 'abc-123' },
          },
        });
      },
    );

    it.each(['tournament_closed', 'tournament_reminder'])(
      'routes "%s" without tournamentId to DailyTournaments list',
      (type) => {
        routeNotification({ type });
        expect(mockNavigate).toHaveBeenCalledWith({
          name: 'Competitions',
          params: { screen: 'DailyTournaments', params: undefined },
        });
      },
    );
  });

  describe('message notifications → Whiteboard tab', () => {
    it('routes "new_message" to Whiteboard > Messages', () => {
      routeNotification({ type: 'new_message' });
      expect(mockNavigate).toHaveBeenCalledWith({
        name: 'Whiteboard',
        params: { screen: 'Messages', params: undefined },
      });
    });
  });

  describe('unknown type', () => {
    it('does not navigate for unknown notification types', () => {
      routeNotification({ type: 'some_unknown_type' });
      expect(mockDispatch).not.toHaveBeenCalled();
    });
  });
});
