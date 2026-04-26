# Navigation & Infinite Render Loop Fix

## Issue
Navigation in the side navbar would occasionally "stop working" or become flaky. This was caused by two main factors:
1. **Infinite Render Loop:** The `usePageSettings` hook in `LayoutContext` was triggering a state update (`setHeaderActions`) inside a `useEffect` that depended on `actions`. Since many pages defined `actions` as a new JSX object on every render, this created a loop where:
   - Page renders -> `usePageSettings` calls `setHeaderActions` -> `LayoutProvider` re-renders -> `AdminLayout` re-renders -> Page re-renders -> Loop.
2. **Mobile UX / Sidebar State:** On mobile, the sidebar (Sider) would not close automatically after navigation, sometimes covering the content and making it look like navigation didn't happen. Also, `collapsedWidth` was not being updated on window resize.

## Solution
1. **LayoutContext Optimization:**
   - Modified `usePageSettings` to only call `setTitle` and `setHeaderActions` if the value has actually changed.
   - For JSX `actions`, a reference check is performed. Pages are encouraged to use `useMemo` for their actions.
2. **AdminLayout Improvements:**
   - Added `isMobile` state tracked via window resize event to ensure `collapsedWidth` is correct (0 on mobile, 80 on desktop).
   - Created `handleNavigation` function that calls `navigate(key)` and then closes the sidebar if on mobile.
   - Cleaned up the `selectedKey` / `parentKey` logic for better readability and performance.

## Best Practices
- **Memoize Header Actions:** Always wrap `actions` in `useMemo` when passing them to `usePageSettings` to avoid triggering re-renders in the layout.
- **Stable References:** Be careful with hooks like `useMutation` or `useQuery` whose return values might change identity and trigger downstream effects if used as dependencies.
