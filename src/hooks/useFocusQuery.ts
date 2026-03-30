import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useQuery, UseQueryOptions, QueryKey } from '@tanstack/react-query';

/**
 * Combines React Query's useQuery with React Navigation's useFocusEffect.
 * - Returns cached data instantly (stale-while-revalidate)
 * - Refetches in background when screen gains focus
 * - Deduplicates concurrent requests
 */
export function useFocusQuery<T>(
  queryKey: QueryKey,
  queryFn: () => Promise<T>,
  options?: Omit<UseQueryOptions<T, Error, T, QueryKey>, 'queryKey' | 'queryFn'>,
) {
  const query = useQuery<T, Error, T, QueryKey>({
    queryKey,
    queryFn,
    ...options,
  });

  useFocusEffect(
    useCallback(() => {
      if (query.isStale) {
        query.refetch();
      }
    }, [query.isStale, query.refetch])
  );

  return query;
}
