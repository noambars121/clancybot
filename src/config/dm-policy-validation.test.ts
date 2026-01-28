import { describe, it, expect } from 'vitest';
import { validateDmPolicy, validateChannelConfig, ConfigValidationError } from './validation.js';

describe('Phase 1: DM Policy Validation', () => {
  it('rejects dmPolicy="open"', () => {
    expect(() => {
      validateDmPolicy('open', 'channels.telegram.dm.policy');
    }).toThrow(ConfigValidationError);
    
    expect(() => {
      validateDmPolicy('open', 'channels.telegram.dm.policy');
    }).toThrow('no longer supported');
  });
  
  it('error message includes migration guide', () => {
    try {
      validateDmPolicy('open', 'test.path');
      expect.fail('Should have thrown');
    } catch (error) {
      const err = error as ConfigValidationError;
      expect(err.message).toContain('breaking-changes-phase1.md');
      expect(err.path).toBe('test.path');
    }
  });
  
  it('allows valid policies', () => {
    expect(() => validateDmPolicy('pairing', 'test.path')).not.toThrow();
    expect(() => validateDmPolicy('allowlist', 'test.path')).not.toThrow();
    expect(() => validateDmPolicy('disabled', 'test.path')).not.toThrow();
  });
  
  it('validates full channel config', () => {
    const configWithOpen = {
      channels: {
        telegram: {
          dm: {
            policy: 'open',
          },
        },
      },
    };
    
    expect(() => validateChannelConfig(configWithOpen as any)).toThrow(ConfigValidationError);
  });
  
  it('validates defaults dmPolicy', () => {
    const config = {
      channels: {
        defaults: {
          dmPolicy: 'open',
        },
      },
    };
    
    expect(() => validateChannelConfig(config as any)).toThrow();
  });
  
  it('passes valid config', () => {
    const config = {
      channels: {
        telegram: {
          dm: {
            policy: 'pairing',
          },
        },
        discord: {
          dm: {
            policy: 'allowlist',
          },
        },
      },
    };
    
    expect(() => validateChannelConfig(config as any)).not.toThrow();
  });
});
