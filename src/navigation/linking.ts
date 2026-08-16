import { LinkingOptions } from '@react-navigation/native';
import * as Linking from 'expo-linking';
import { RootStackParamList } from './index';

const prefix = Linking.createURL('/');

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [prefix, 'athlex://', 'https://athlexapp.eu'],

  config: {
    screens: {
      Main: {
        screens: {
          Whiteboard: {
            screens: {
              WODDetail: 'wod/:wodId',
              PublicProfile: 'profile/:userId',
            },
          },
          Competitions: {
            screens: {
              Tournament: 'tournament/:tournamentId',
              InterCompetitionDetail: 'inter/:competitionId',
            },
          },
          Home: {
            screens: {
              DailyTournamentDetail: 'daily/:tournamentId',
              PublicProfile: 'user/:userId',
            },
          },
        },
      },
    },
  },
};
