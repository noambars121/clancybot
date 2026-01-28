import { describe, it, expect } from 'vitest';
import { detectEscapeAttempts, hasEscapeAttempts, getEscapePatterns } from './escape-detection.js';

describe('Phase 1: Sandbox Escape Detection', () => {
  it('detects kernel parameter access', () => {
    const attempts = detectEscapeAttempts('cat /proc/sys/kernel/core_pattern');
    expect(attempts.length).toBeGreaterThan(0);
    expect(attempts[0].severity).toBe('high');
    expect(attempts[0].description).toContain('Kernel');
  });
  
  it('detects cgroup manipulation', () => {
    const attempts = detectEscapeAttempts('echo 0 > /sys/fs/cgroup/memory/limit');
    expect(attempts.length).toBeGreaterThan(0);
    expect(attempts[0].severity).toBe('high');
  });
  
  it('detects namespace operations', () => {
    expect(hasEscapeAttempts('unshare -r /bin/sh')).toBe(true);
    expect(hasEscapeAttempts('nsenter -t 1 -m -u -i -n -p')).toBe(true);
  });
  
  it('detects Docker socket access', () => {
    const attempts = detectEscapeAttempts('curl --unix-socket /var/run/docker.sock');
    expect(attempts.length).toBeGreaterThan(0);
    expect(attempts[0].description).toContain('Docker socket');
  });
  
  it('detects raw disk access', () => {
    expect(hasEscapeAttempts('dd if=/dev/sda of=/tmp/disk.img')).toBe(true);
  });
  
  it('detects chroot', () => {
    const attempts = detectEscapeAttempts('chroot /tmp/escape /bin/bash');
    expect(attempts.length).toBeGreaterThan(0);
    expect(attempts[0].severity).toBe('medium');
  });
  
  it('allows safe commands', () => {
    expect(hasEscapeAttempts('ls -la')).toBe(false);
    expect(hasEscapeAttempts('cat file.txt')).toBe(false);
    expect(hasEscapeAttempts('python script.py')).toBe(false);
    expect(hasEscapeAttempts('npm install')).toBe(false);
  });
  
  it('getEscapePatterns returns all patterns', () => {
    const patterns = getEscapePatterns();
    expect(patterns.length).toBeGreaterThan(10);
    expect(patterns[0]).toHaveProperty('pattern');
    expect(patterns[0]).toHaveProperty('description');
    expect(patterns[0]).toHaveProperty('severity');
  });
  
  it('detects multiple patterns in one command', () => {
    const attempts = detectEscapeAttempts('unshare -r mount -o bind /proc /tmp/proc');
    expect(attempts.length).toBeGreaterThan(1);
  });
});
