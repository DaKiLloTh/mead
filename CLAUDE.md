We use PREACT, not react. we prefer signals and the respective ecosystem aroudn them, no legacy react states.

## Frontend state

- `useSignal` for component state.
- `useSignalRef` from `@preact/signals/utils` for DOM elements: `const inputEl = useSignalRef<HTMLInputElement | null>(null)`, then `ref={inputEl}`. Read it with `.peek()` inside effects unless the element appearing should trigger the effect.
- `useComputed` for anything derived from other state.
- `useSignalEffect` for side effects (listeners, timers, DOM work, fetches). Read the signals that should trigger it, and run the rest in `untracked()` so reads and writes inside don't re-trigger it.
- Shared or app-wide state lives in module-level signal stores in `frontend/src/context/` (`*Signal.ts`, JobsContext, UserDataContext, ConfirmContext). Expose a `use*()` reader if components want one.
- To refetch on "something changed", call `bump()` and use `useRefreshEffect` (both in `RefreshSignal.ts`).
- `useComputed` and `useSignalEffect` only re-run when a signal they read changes. They don't react to props, so key the component on a prop that should reset it.
- ESLint bans `useState`, `useReducer`, `useEffect`, `useLayoutEffect`, `useMemo`, `useCallback`, `useContext`, `useRef` and `createContext`.
