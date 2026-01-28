/**
 * Prompt Injection Protection (Phase 2 Critical Fix)
 * 
 * Protects against malicious instructions injected via:
 * - Channel topics/purposes (Slack, Discord)
 * - Group names (WhatsApp, Telegram)
 * - Display names (all channels)
 * - File names (file attachments)
 * - URLs (link metadata)
 */

export interface SanitizeOptions {
  maxLength?: number;
  allowHtml?: boolean;
  stripTags?: boolean;
  context?: 'channel-topic' | 'group-name' | 'display-name' | 'filename' | 'url' | 'generic';
}

/**
 * Known prompt injection patterns to block/neutralize
 */
const INJECTION_PATTERNS = [
  // Instruction override attempts
  /\b(ignore|forget|disregard|override|cancel|bypass)\s+(previous|all|above|prior|earlier)\s+(instructions?|rules?|guidelines?|directives?|commands?)\b/gi,
  
  // Role manipulation
  /\b(now\s+you\s+(are|should|must|will)|you(?:'re|\s+are)\s+now)\s+(a|an|the)?\s*(admin|root|system|developer|engineer|god|master)/gi,
  /\byour\s+(new|real|true|actual)\s+(role|purpose|task|job|function)\s+(?:is|are)\b/gi,
  
  // System/developer impersonation
  /\b(system|developer|admin|root|master)\s*:\s*/gi,
  /\b\[(?:system|admin|developer|root)\]/gi,
  
  // Jailbreak attempts
  /\b(DAN|developer mode|god mode|admin mode|unrestricted mode)\b/gi,
  /\bpretend\s+(?:you|to)\s+(?:are|be)\b/gi,
  
  // Boundary breaking
  /\b(end\s+of|finish|complete)\s+(instructions?|prompt|context)\b/gi,
  /---+\s*(new|reset|override|system)/gi,
  
  // Code execution attempts in context
  /<\/?(?:thinking|system|execute|tool|function|code|script)[^>]*>/gi,
];

/**
 * Characters that can be used for string boundary escape
 */
const BOUNDARY_CHARS = /["'`\\]/g;

/**
 * Control characters that shouldn't appear in metadata
 */
const CONTROL_CHARS = /[\x00-\x1F\x7F]/g;

/**
 * Suspicious Unicode that might render as invisible or confusable
 */
const SUSPICIOUS_UNICODE = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;

/**
 * Sanitize text to prevent prompt injection attacks
 */
export function sanitizeForPrompt(
  text: string,
  options: SanitizeOptions = {},
): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  const {
    maxLength = 1000,
    allowHtml = false,
    stripTags = true,
    context = 'generic',
  } = options;

  let clean = text;

  // 1. Remove control characters (including null bytes, newlines in metadata)
  clean = clean.replace(CONTROL_CHARS, '');

  // 2. Remove suspicious Unicode (zero-width, RTL overrides, etc.)
  clean = clean.replace(SUSPICIOUS_UNICODE, '');

  // 3. Strip dangerous XML/HTML tags
  if (stripTags) {
    clean = clean.replace(/<\/?(?:thinking|system|execute|tool|function|code|script)[^>]*>/gi, '');
  }

  // 4. Remove all HTML if not allowed
  if (!allowHtml) {
    clean = clean.replace(/<[^>]+>/g, '');
  }

  // 5. Neutralize injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    clean = clean.replace(pattern, '[filtered]');
  }

  // 6. Escape string boundaries (prevent breaking out of quotes)
  clean = clean.replace(BOUNDARY_CHARS, '\\$&');

  // 7. Apply context-specific length limits
  const contextMaxLength = getContextMaxLength(context, maxLength);
  if (clean.length > contextMaxLength) {
    clean = clean.slice(0, contextMaxLength) + '... [truncated]';
  }

  // 8. Trim whitespace
  clean = clean.trim();

  return clean;
}

/**
 * Get max length based on context
 */
function getContextMaxLength(context: SanitizeOptions['context'], defaultMax: number): number {
  switch (context) {
    case 'channel-topic':
      return Math.min(defaultMax, 500);
    case 'group-name':
      return Math.min(defaultMax, 100);
    case 'display-name':
      return Math.min(defaultMax, 50);
    case 'filename':
      return Math.min(defaultMax, 255);
    case 'url':
      return Math.min(defaultMax, 2000);
    default:
      return defaultMax;
  }
}

/**
 * Sanitize channel topic/purpose
 */
export function sanitizeChannelTopic(topic: string | undefined): string {
  if (!topic) return '';
  return sanitizeForPrompt(topic, { 
    maxLength: 500, 
    context: 'channel-topic',
    stripTags: true,
  });
}

/**
 * Sanitize group/chat name
 */
export function sanitizeGroupName(name: string | undefined): string {
  if (!name) return '';
  return sanitizeForPrompt(name, { 
    maxLength: 100, 
    context: 'group-name',
    stripTags: true,
  });
}

/**
 * Sanitize user display name
 */
export function sanitizeDisplayName(name: string | undefined): string {
  if (!name) return '';
  return sanitizeForPrompt(name, { 
    maxLength: 50, 
    context: 'display-name',
    stripTags: true,
  });
}

/**
 * Sanitize filename before including in prompt
 */
export function sanitizeFileName(filename: string | undefined): string {
  if (!filename) return '';
  return sanitizeForPrompt(filename, { 
    maxLength: 255, 
    context: 'filename',
    stripTags: false, // Allow dots, extensions
  });
}

/**
 * Sanitize URL before including in prompt
 */
export function sanitizeUrl(url: string | undefined): string {
  if (!url) return '';
  
  // Basic URL validation
  try {
    const parsed = new URL(url);
    // Only allow http/https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return '[invalid-protocol]';
    }
  } catch {
    return '[invalid-url]';
  }
  
  return sanitizeForPrompt(url, { 
    maxLength: 2000, 
    context: 'url',
    stripTags: true,
  });
}

/**
 * Detect if text contains likely prompt injection attempts
 * @returns Array of detected patterns (empty if clean)
 */
export function detectPromptInjection(text: string): string[] {
  const detected: string[] = [];
  
  for (const pattern of INJECTION_PATTERNS) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      detected.push(...matches.map(m => m.trim()));
    }
  }
  
  return detected;
}

/**
 * Create structural delimiter to separate system/user content
 */
export function createPromptDelimiter(label: string): string {
  return `\n===== ${label.toUpperCase()} =====\n`;
}

/**
 * Wrap user content with clear delimiters
 */
export function wrapUserContent(content: string, metadata?: {
  channelName?: string;
  groupName?: string;
  displayName?: string;
}): string {
  const parts: string[] = [];
  
  parts.push(createPromptDelimiter('USER CONTEXT START'));
  
  if (metadata?.channelName) {
    parts.push(`Channel: ${sanitizeChannelTopic(metadata.channelName)}`);
  }
  
  if (metadata?.groupName) {
    parts.push(`Group: ${sanitizeGroupName(metadata.groupName)}`);
  }
  
  if (metadata?.displayName) {
    parts.push(`From: ${sanitizeDisplayName(metadata.displayName)}`);
  }
  
  parts.push(createPromptDelimiter('USER MESSAGE START'));
  parts.push(content);
  parts.push(createPromptDelimiter('USER CONTEXT END'));
  
  return parts.join('\n');
}
