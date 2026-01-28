import { describe, it, expect } from 'vitest';
import { calculateSecurityScore, getSecurityRating, addScoreToReport } from './audit.js';
import type { SecurityAuditReport } from './audit.js';

describe('Phase 1: Security Scoring', () => {
  it('calculates perfect score', () => {
    const report: SecurityAuditReport = {
      ts: Date.now(),
      summary: { critical: 0, warn: 0, info: 0 },
      findings: [],
    };
    
    expect(calculateSecurityScore(report)).toBe(100);
    expect(getSecurityRating(100)).toBe('EXCELLENT');
  });
  
  it('deducts 20 points per critical', () => {
    const report: SecurityAuditReport = {
      ts: Date.now(),
      summary: { critical: 2, warn: 0, info: 0 },
      findings: [],
    };
    
    expect(calculateSecurityScore(report)).toBe(60);
    expect(getSecurityRating(60)).toBe('NEEDS IMPROVEMENT');
  });
  
  it('deducts 5 points per warning', () => {
    const report: SecurityAuditReport = {
      ts: Date.now(),
      summary: { critical: 0, warn: 10, info: 0 },
      findings: [],
    };
    
    expect(calculateSecurityScore(report)).toBe(50);
    expect(getSecurityRating(50)).toBe('NEEDS IMPROVEMENT');
  });
  
  it('deducts 1 point per info', () => {
    const report: SecurityAuditReport = {
      ts: Date.now(),
      summary: { critical: 0, warn: 0, info: 10 },
      findings: [],
    };
    
    expect(calculateSecurityScore(report)).toBe(90);
    expect(getSecurityRating(90)).toBe('EXCELLENT');
  });
  
  it('deducts for all severities combined', () => {
    const report: SecurityAuditReport = {
      ts: Date.now(),
      summary: { critical: 1, warn: 3, info: 5 },
      findings: [],
    };
    
    const score = calculateSecurityScore(report);
    expect(score).toBe(60); // 100 - 20 - 15 - 5
  });
  
  it('never goes below zero', () => {
    const report: SecurityAuditReport = {
      ts: Date.now(),
      summary: { critical: 10, warn: 20, info: 50 },
      findings: [],
    };
    
    expect(calculateSecurityScore(report)).toBe(0);
  });
  
  it('rating thresholds correct', () => {
    expect(getSecurityRating(100)).toBe('EXCELLENT');
    expect(getSecurityRating(90)).toBe('EXCELLENT');
    expect(getSecurityRating(85)).toBe('GOOD');
    expect(getSecurityRating(80)).toBe('GOOD');
    expect(getSecurityRating(75)).toBe('ACCEPTABLE');
    expect(getSecurityRating(70)).toBe('ACCEPTABLE');
    expect(getSecurityRating(60)).toBe('NEEDS IMPROVEMENT');
    expect(getSecurityRating(50)).toBe('NEEDS IMPROVEMENT');
    expect(getSecurityRating(40)).toBe('CRITICAL');
    expect(getSecurityRating(0)).toBe('CRITICAL');
  });
  
  it('addScoreToReport augments report', () => {
    const report: SecurityAuditReport = {
      ts: Date.now(),
      summary: { critical: 1, warn: 2, info: 3 },
      findings: [],
    };
    
    const scored = addScoreToReport(report);
    expect(scored.score).toBe(67); // 100 - 20 - 10 - 3
    expect(scored.rating).toBe('ACCEPTABLE');
    expect(scored.ts).toBe(report.ts);
    expect(scored.findings).toBe(report.findings);
  });
});
