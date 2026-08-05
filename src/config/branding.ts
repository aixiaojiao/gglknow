/**
 * Author Attribution Configuration
 *
 * The single place where the author's own channels are defined. Everything the
 * extension renders as attribution reads from here.
 *
 * Two rules this config exists to keep enforceable:
 *
 * 1. Nothing here is ever injected into x.com or twitter.com pages. The content
 *    script adds the collect button and nothing else. Injecting promotion into
 *    someone else's site is the one change that could plausibly draw a platform
 *    complaint, and it is also what users punish with uninstalls.
 * 2. If `handle` or `url` is left empty, every attribution surface renders
 *    nothing at all. Shipping with the placeholders still in place produces a
 *    clean build, not a broken or embarrassing one.
 */

export interface BrandingLink {
  /** Text shown to the user */
  label: string;
  /** Destination URL */
  url: string;
}

export const BRANDING = {
  /**
   * Handle shown in the one-line attribution, e.g. '@yourhandle'.
   * Leave empty to disable every attribution surface.
   */
  handle: '',

  /**
   * Where that one-line attribution links to.
   * Leave empty to disable every attribution surface.
   */
  url: '',

  /**
   * Extra channels listed in the popup and the tweet browser only — never in
   * saved files, which stay to a single minimal line.
   */
  links: [] as BrandingLink[]
} as const;

/** Whether enough is configured to render anything at all */
export function hasBranding(): boolean {
  return Boolean(BRANDING.handle && BRANDING.url);
}

/**
 * The one-line attribution used in saved files: "由 GglKnow 保存 · @handle".
 * Returns an empty string when unconfigured.
 */
export function attributionText(): string {
  return hasBranding() ? BRANDING.handle : '';
}
