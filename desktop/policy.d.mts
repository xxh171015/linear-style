export const APP_ORIGIN: string;
export function trustedRenderer(value: string, developmentURL?: string): boolean;
export function localAsset(root: string, value: string): string | null;
export function externalLink(value: string): string | null;
export function deepLinkRoute(value: string): string | null;
