import { Request } from 'express';

/**
 * Safely extracts the client's IP address from an Express request object.
 * Handles the 'x-forwarded-for' header and various TypeScript type possibilities.
 */
export const getIp = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  let ip: string;
  if (Array.isArray(forwarded)) ip = forwarded[0];
  else if (typeof forwarded === 'string') ip = forwarded.split(',')[0].trim();
  else ip = req.socket.remoteAddress || 'System';
  // Node often reports IPv4 clients as ::ffff:192.168.x.x
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  if (ip === '::1') ip = '127.0.0.1';
  return ip;
};

/** True for loopback and RFC1918 private IPv4 addresses. */
export const isPrivateIp = (ip: string): boolean => {
  const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  return (
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === 'localhost' ||
    /^192\.168\./.test(normalized) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(normalized) ||
    /^10\./.test(normalized)
  );
};
