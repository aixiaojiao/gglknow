/**
 * Author Attribution Configuration
 *
 * The values live in branding.json so there is exactly one source of truth:
 * the bundled TypeScript imports it directly, and the build emits a small
 * branding.js from the same file for the plain-JS pages (tweet browser) that
 * are copied into dist rather than bundled.
 *
 * Two rules this config exists to keep enforceable:
 *
 * 1. Nothing here is ever injected into x.com or twitter.com pages. The content
 *    script adds the collect button and nothing else. Injecting promotion into
 *    someone else's site is the one change that could plausibly draw a platform
 *    complaint, and it is also what users punish with uninstalls.
 * 2. If `handle` or `url` is empty, every attribution surface renders nothing.
 *    An unconfigured build is a clean build, not a broken one.
 */

import brandingData from './branding.json';

export interface BrandingLink {
  /** Text shown to the user */
  label: string;
  /** Destination URL */
  url: string;
}

export interface Branding {
  /** Handle shown in the one-line attribution, e.g. '@yourhandle' */
  handle: string;
  /** Where that attribution links to */
  url: string;
  /** Extra channels listed in the popup only — never in saved files */
  links: BrandingLink[];
}

export const BRANDING: Branding = {
  handle: brandingData.handle || '',
  url: brandingData.url || '',
  links: (brandingData.links as BrandingLink[]) || []
};

/** Whether enough is configured to render anything at all */
export function hasBranding(): boolean {
  return Boolean(BRANDING.handle && BRANDING.url);
}
