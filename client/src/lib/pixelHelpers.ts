/**
 * Shared helpers for building Pixel strings and normalizing related values.
 * Consolidated here to keep slices and thunks consistent.
 */

/**
 * Pixel string args are wrapped in single quotes; escape any single quotes
 * inside the value by swapping them for double quotes.
 */
export const sanitizePixelArg = (value: string) => value.replace(/'/g, '"');

/** Normalize a relative insight asset path: forward slashes, no leading slashes. */
export const sanitizeInsightFilePath = (value: string) =>
  value.replace(/\\/g, "/").replace(/^\/+/, "");

export const createSetRoomForInsightPixel = (roomId: string) =>
  `SetRoomForInsight(roomId='${roomId}');`;
