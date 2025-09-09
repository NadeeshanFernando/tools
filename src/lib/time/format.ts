// Formats an ISO string for filenames (YYYY-MM-DD_HH-MM-SS).
export const stamp = (d = new Date()) =>
  d.toISOString().replace(/:/g, "-").split(".")[0];
