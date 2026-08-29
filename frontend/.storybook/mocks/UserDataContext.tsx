// Storybook stand-in for ../../src/context/UserDataContext.tsx (see
// JobsContext.tsx in this same directory for why these mocks exist).
export function useUserData() {
  return {
    data: null,
    refresh: () => {},
    isFavorite: () => false,
    toggleFavorite: async () => {},
    tagsFor: () => [] as string[],
    setTags: async () => {},
    noteFor: () => '',
    setNote: async () => {},
    snoozedUntil: () => null,
    snooze: async () => {},
    unsnooze: async () => {},
    allTags: [] as string[],
  }
}
