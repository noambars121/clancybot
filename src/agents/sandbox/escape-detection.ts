export interface EscapeAttempt {
  pattern: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
}

const ESCAPE_PATTERNS: Array<{ regex: RegExp; desc: string; severity: EscapeAttempt['severity'] }> = [
  { regex: /\/proc\/sys\/kernel/, desc: 'Kernel parameter access', severity: 'high' },
  { regex: /\/sys\/fs\/cgroup/, desc: 'CGroup manipulation', severity: 'high' },
  { regex: /mount\s+-o\s+bind/, desc: 'Bind mount attempt', severity: 'high' },
  { regex: /\bunshare\b/, desc: 'Namespace unshare', severity: 'high' },
  { regex: /\bnsenter\b/, desc: 'Namespace enter', severity: 'high' },
  { regex: /\/dev\/sd[a-z]/, desc: 'Raw disk access', severity: 'high' },
  { regex: /docker\.sock/, desc: 'Docker socket access', severity: 'high' },
  { regex: /\bchroot\b/, desc: 'Chroot escape attempt', severity: 'medium' },
  { regex: /\/proc\/self\/exe/, desc: 'Process self-reference', severity: 'medium' },
  { regex: /\/proc\/\d+\/root/, desc: 'Process root access', severity: 'medium' },
  { regex: /\/proc\/\d+\/cwd/, desc: 'Process CWD access', severity: 'medium' },
  { regex: /ptrace/, desc: 'Process tracing', severity: 'high' },
  { regex: /\/dev\/mem/, desc: 'Physical memory access', severity: 'high' },
  { regex: /\/dev\/kmem/, desc: 'Kernel memory access', severity: 'high' },
];

export function detectEscapeAttempts(text: string): EscapeAttempt[] {
  const attempts: EscapeAttempt[] = [];
  
  for (const { regex, desc, severity } of ESCAPE_PATTERNS) {
    if (regex.test(text)) {
      attempts.push({
        pattern: regex.source,
        description: desc,
        severity,
      });
    }
  }
  
  return attempts;
}

export function hasEscapeAttempts(text: string): boolean {
  return ESCAPE_PATTERNS.some(({ regex }) => regex.test(text));
}

export function getEscapePatterns(): ReadonlyArray<{ pattern: string; description: string; severity: string }> {
  return ESCAPE_PATTERNS.map(({ regex, desc, severity }) => ({
    pattern: regex.source,
    description: desc,
    severity,
  }));
}
