// Storybook stand-in for ../../src/context/ConfirmContext.tsx (see
// JobsContext.tsx in this same directory for why these mocks exist).
// Always resolves "confirmed" so a story's destructive-looking actions
// don't hang waiting for a real dialog that isn't rendered.
export function useConfirm() {
  return async () => ({ ok: true, checked: [] as boolean[] })
}
