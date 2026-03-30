/**
 * Unit tests for useFocusQuery hook logic.
 *
 * Since the hook combines useQuery + useFocusEffect, we test:
 * 1. It calls useQuery with correct params
 * 2. It sets up a focus effect that refetches when stale
 * 3. It returns the query result
 *
 * We mock the dependencies and verify integration behavior.
 */

// ── Capture callbacks ──
let focusCallback: (() => void) | null = null;
const mockRefetch = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn((cb: () => void) => {
    focusCallback = cb;
  }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
}));

import { useFocusEffect } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useFocusQuery } from '../hooks/useFocusQuery';

// Mock useCallback to just return the function (no React needed)
jest.mock('react', () => ({
  useCallback: jest.fn((fn: any) => fn),
}));

const mockUseQuery = useQuery as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  focusCallback = null;
  mockRefetch.mockClear();
});

describe('useFocusQuery', () => {
  it('passes queryKey, queryFn, and options to useQuery', () => {
    const queryFn = jest.fn();
    const queryKey = ['test', 'key'];
    const options = { staleTime: 5000 };

    mockUseQuery.mockReturnValue({
      isStale: false,
      refetch: mockRefetch,
      data: null,
    });

    useFocusQuery(queryKey, queryFn, options);

    expect(mockUseQuery).toHaveBeenCalledWith({
      queryKey,
      queryFn,
      staleTime: 5000,
    });
  });

  it('registers a useFocusEffect callback', () => {
    mockUseQuery.mockReturnValue({
      isStale: false,
      refetch: mockRefetch,
      data: 'cached',
    });

    useFocusQuery(['key'], jest.fn());

    expect(useFocusEffect).toHaveBeenCalled();
    expect(focusCallback).toBeInstanceOf(Function);
  });

  it('refetches on focus when query is stale', () => {
    mockUseQuery.mockReturnValue({
      isStale: true,
      refetch: mockRefetch,
      data: 'old-data',
    });

    useFocusQuery(['key'], jest.fn());

    // Simulate screen gaining focus
    expect(focusCallback).not.toBeNull();
    focusCallback!();
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('does NOT refetch on focus when query is fresh', () => {
    mockUseQuery.mockReturnValue({
      isStale: false,
      refetch: mockRefetch,
      data: 'fresh-data',
    });

    useFocusQuery(['key'], jest.fn());

    focusCallback!();
    expect(mockRefetch).not.toHaveBeenCalled();
  });

  it('returns the query result object', () => {
    const queryResult = {
      isStale: false,
      refetch: mockRefetch,
      data: { items: [1, 2, 3] },
      isLoading: false,
      error: null,
    };
    mockUseQuery.mockReturnValue(queryResult);

    const result = useFocusQuery(['key'], jest.fn());

    expect(result).toBe(queryResult);
    expect(result.data).toEqual({ items: [1, 2, 3] });
  });

  it('works without optional options parameter', () => {
    mockUseQuery.mockReturnValue({
      isStale: true,
      refetch: mockRefetch,
      data: null,
    });

    useFocusQuery(['no-opts'], jest.fn());

    expect(mockUseQuery).toHaveBeenCalledWith({
      queryKey: ['no-opts'],
      queryFn: expect.any(Function),
    });
  });
});
