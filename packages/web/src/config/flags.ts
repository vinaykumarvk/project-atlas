/**
 * Feature flags for the Atlas frontend.
 *
 * Flags are read from Vite environment variables (prefixed with VITE_).
 * Set them in a .env file or pass them at build time.
 *
 * Example .env:
 *   VITE_DEMO_MODE=true
 */

/**
 * Returns true when the app is running in demo mode.
 * In demo mode the UI renders with hard-coded mock data so stakeholders
 * can preview the interface before the real API is wired up.
 *
 * Defaults to false when the variable is not set.
 */
export function isDemoMode(): boolean {
  return import.meta.env.VITE_DEMO_MODE === 'true';
}

/**
 * Returns true when verbose UI logging is enabled.
 * Useful during development / QA.
 */
export function isDebugMode(): boolean {
  return import.meta.env.VITE_DEBUG === 'true';
}

/**
 * Returns true when the experimental AI-assist panel should be shown.
 * Gated behind a flag so it can be toggled independently of releases.
 */
export function isAiAssistEnabled(): boolean {
  return import.meta.env.VITE_AI_ASSIST === 'true';
}
