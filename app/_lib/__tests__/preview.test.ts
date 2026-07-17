import { describe, expect, it } from 'vitest';
import { isBlockedAddress } from '../preview';

describe('isBlockedAddress', () => {
  it('blocks RFC 1918 private IPv4 ranges', () => {
    expect(isBlockedAddress('10.0.0.5')).toBe(true);
    expect(isBlockedAddress('172.16.0.1')).toBe(true);
    expect(isBlockedAddress('172.31.255.255')).toBe(true);
    expect(isBlockedAddress('192.168.1.1')).toBe(true);
  });

  it('blocks loopback and link-local IPv4', () => {
    expect(isBlockedAddress('127.0.0.1')).toBe(true);
    expect(isBlockedAddress('169.254.1.1')).toBe(true);
    expect(isBlockedAddress('0.0.0.0')).toBe(true);
  });

  it('does not block a public IPv4 range that looks similar', () => {
    // 172.32.x.x is outside RFC 1918's 172.16.0.0/12 (16-31)
    expect(isBlockedAddress('172.32.0.1')).toBe(false);
    expect(isBlockedAddress('8.8.8.8')).toBe(false);
    expect(isBlockedAddress('93.184.216.34')).toBe(false);
  });

  it('blocks IPv6 loopback, link-local, and unique-local ranges', () => {
    expect(isBlockedAddress('::1')).toBe(true);
    expect(isBlockedAddress('fe80::1')).toBe(true);
    expect(isBlockedAddress('fc00::1')).toBe(true);
    expect(isBlockedAddress('fd12:3456:789a::1')).toBe(true);
  });

  it('does not block a public IPv6 address', () => {
    expect(isBlockedAddress('2001:4860:4860::8888')).toBe(false);
  });

  it('blocks IPv4-mapped IPv6 addresses that embed a private/loopback IPv4', () => {
    expect(isBlockedAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isBlockedAddress('::ffff:10.0.0.1')).toBe(true);
  });

  it('fails closed on an unrecognised address shape', () => {
    expect(isBlockedAddress('not-an-ip')).toBe(true);
  });
});
