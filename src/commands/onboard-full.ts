/**
 * Full Onboarding Wizard
 * 
 * Comprehensive interactive wizard that guides users through complete Moltbot setup:
 * - AI Model selection (Claude/GPT-4/Gemini) + API key configuration
 * - Messaging channels (WhatsApp/Discord/Telegram/Slack)
 * - Skills setup (browser, python, shell, canvas)
 * - Security profile (Maximum/Balanced/Development)
 * - DM Pairing with secure code
 * - Gateway configuration (port, bind, auth)
 * 
 * Usage: clancybot onboard --full
 * 
 * @module commands/onboard-full
 */

import { intro, outro, select, text, confirm, spinner, note, isCancel, cancel } from "@clack/prompts";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { MoltbotConfig } from "../config/types.js";
import { loadConfig, writeConfigFile, CONFIG_PATH } from "../config/config.js";
import { getChildLogger } from "../logging.js";
import {
  type SecurityProfile,
  getAllProfiles,
  applyProfile,
  getRecommendedProfile,
} from "../config/security-profiles.js";

const log = getChildLogger({ module: "onboard-full" });

// ============================================================================
// Types
// ============================================================================

type AIProvider = "anthropic" | "openai" | "gemini" | "openrouter";
type MessagingChannel = "whatsapp" | "discord" | "telegram" | "slack";

interface OnboardingChoices {
  aiProvider: AIProvider;
  apiKey: string;
  channels: MessagingChannel[];
  enableBrowser: boolean;
  enablePython: boolean;
  enableShell: boolean;
  securityProfile: SecurityProfile;
  enablePairing: boolean;
  pairingCode?: string;
  gatewayPort: number;
  gatewayBind: "loopback" | "all";
  enableAuth: boolean;
  authToken?: string;
}

// ============================================================================
// Helpers
// ============================================================================

function generateSecureToken(): string {
  return randomBytes(32).toString("base64url");
}

function generatePairingCode(): string {
  // 6-digit code
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function getDefaultApiKeyEnvVar(provider: AIProvider): string {
  const envVars: Record<AIProvider, string> = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    gemini: "GEMINI_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
  };
  return envVars[provider];
}

// ============================================================================
// Wizard Steps
// ============================================================================

async function selectAIProvider(): Promise<AIProvider | symbol> {
  return await select({
    message: "🤖 Select your primary AI provider:",
    options: [
      { value: "anthropic", label: "Claude (Anthropic) - Recommended", hint: "Best overall, supports artifacts" },
      { value: "openai", label: "GPT-4 (OpenAI)", hint: "Great for general tasks" },
      { value: "gemini", label: "Gemini (Google)", hint: "Fast and cost-effective" },
      { value: "openrouter", label: "OpenRouter", hint: "Access multiple models" },
    ],
  });
}

async function getAPIKey(provider: AIProvider): Promise<string | symbol> {
  const envVar = getDefaultApiKeyEnvVar(provider);
  const existingKey = process.env[envVar];

  if (existingKey) {
    const useExisting = await confirm({
      message: `Found ${envVar} in environment. Use it?`,
      initialValue: true,
    });
    if (isCancel(useExisting)) return useExisting;
    if (useExisting) return existingKey;
  }

  return await text({
    message: `Enter your ${provider.toUpperCase()} API key:`,
    placeholder: `sk-...`,
    validate: (value) => {
      if (!value || value.trim().length === 0) {
        return "API key is required";
      }
      if (value.trim().length < 20) {
        return "API key seems too short";
      }
    },
  });
}

async function selectChannels(): Promise<MessagingChannel[] | symbol> {
  const channelsResult = await select({
    message: "📱 Which messaging channels do you want to enable?",
    options: [
      { value: "none", label: "None (CLI/API only)", hint: "Just use the CLI interface" },
      { value: "whatsapp", label: "WhatsApp", hint: "Personal messaging" },
      { value: "discord", label: "Discord", hint: "Team collaboration" },
      { value: "telegram", label: "Telegram", hint: "Fast and lightweight" },
      { value: "slack", label: "Slack", hint: "Business communication" },
      { value: "all", label: "All channels", hint: "Enable everything" },
    ],
  });

  if (isCancel(channelsResult)) return channelsResult;

  if (channelsResult === "none") return [];
  if (channelsResult === "all") return ["whatsapp", "discord", "telegram", "slack"];
  return [channelsResult as MessagingChannel];
}

async function selectSkills(): Promise<{ browser: boolean; python: boolean; shell: boolean } | symbol> {
  const enableBrowser = await confirm({
    message: "🌐 Enable browser automation (Playwright)?",
    initialValue: true,
  });
  if (isCancel(enableBrowser)) return enableBrowser;

  const enablePython = await confirm({
    message: "🐍 Enable Python execution?",
    initialValue: true,
  });
  if (isCancel(enablePython)) return enablePython;

  const enableShell = await confirm({
    message: "🔧 Enable shell command execution?",
    initialValue: false,
  });
  if (isCancel(enableShell)) return enableShell;

  return { browser: enableBrowser, python: enablePython, shell: enableShell };
}

async function selectSecurityProfile(): Promise<SecurityProfile | symbol> {
  const recommended = getRecommendedProfile();
  
  return await select({
    message: "🔒 Select security profile:",
    options: [
      { 
        value: "maximum", 
        label: "Maximum (Pentagon++++)", 
        hint: recommended === "maximum" ? "Recommended - All security features" : "All security features"
      },
      { 
        value: "balanced", 
        label: "Balanced (Pentagon+++)", 
        hint: recommended === "balanced" ? "Recommended - Good balance" : "Good balance"
      },
      { 
        value: "development", 
        label: "Development (Pentagon)", 
        hint: recommended === "development" ? "Recommended - Dev-friendly" : "Dev-friendly"
      },
    ],
    initialValue: recommended,
  });
}

async function setupDMPairing(): Promise<{ enabled: boolean; code?: string } | symbol> {
  const enablePairing = await confirm({
    message: "🔐 Enable DM pairing for security?",
    initialValue: true,
  });
  if (isCancel(enablePairing)) return enablePairing;

  if (!enablePairing) {
    return { enabled: false };
  }

  const code = generatePairingCode();
  
  note(
    `Your DM pairing code: ${code}\n\n` +
    `Share this code only with trusted users.\n` +
    `Users will need this code to DM your bot.`,
    "🔐 DM Pairing Code"
  );

  return { enabled: true, code };
}

async function setupGateway(): Promise<{ port: number; bind: string; auth: boolean; token?: string } | symbol> {
  const portResult = await text({
    message: "🌐 Gateway port:",
    placeholder: "18789",
    initialValue: "18789",
    validate: (value) => {
      const port = parseInt(value);
      if (isNaN(port) || port < 1024 || port > 65535) {
        return "Port must be between 1024 and 65535";
      }
    },
  });
  if (isCancel(portResult)) return portResult;

  const bindResult = await select({
    message: "🔗 Gateway bind address:",
    options: [
      { value: "loopback", label: "Loopback (127.0.0.1)", hint: "Local only - more secure" },
      { value: "all", label: "All interfaces (0.0.0.0)", hint: "Remote access - requires auth" },
    ],
    initialValue: "loopback",
  });
  if (isCancel(bindResult)) return bindResult;

  let authEnabled = false;
  let authToken: string | undefined;

  if (bindResult === "all") {
    const enableAuth = await confirm({
      message: "🔑 Enable gateway authentication? (Highly recommended for remote access)",
      initialValue: true,
    });
    if (isCancel(enableAuth)) return enableAuth;
    
    authEnabled = enableAuth;
    if (authEnabled) {
      authToken = generateSecureToken();
      note(
        `Gateway authentication token: ${authToken}\n\n` +
        `Keep this token secure!\n` +
        `You'll need it to connect remote clients.`,
        "🔑 Gateway Auth Token"
      );
    }
  }

  return {
    port: parseInt(portResult as string),
    bind: bindResult as string,
    auth: authEnabled,
    token: authToken,
  };
}

// ============================================================================
// Config Builder
// ============================================================================

function buildConfig(choices: OnboardingChoices): Partial<MoltbotConfig> {
  const config: Partial<MoltbotConfig> = {};

  // AI Provider
  const envVar = getDefaultApiKeyEnvVar(choices.aiProvider);
  (config as any).providers = {
    [choices.aiProvider]: {
      apiKey: `\${${envVar}}`,
    },
  };

  (config as any).model = {
    defaultProvider: choices.aiProvider,
  };

  // Channels
  if (choices.channels.length > 0) {
    (config as any).channels = {};
    for (const channel of choices.channels) {
      (config as any).channels[channel] = {
        enabled: true,
        dm: {
          policy: choices.enablePairing ? "pairing" : "allowlist",
          ...(choices.pairingCode && { pairingCode: choices.pairingCode }),
        },
      };
    }
  }

  // Skills
  if (choices.enableBrowser || choices.enablePython || choices.enableShell) {
    (config as any).skills = {};
    if (choices.enableBrowser) {
      (config as any).skills.browser = { enabled: true };
    }
    if (choices.enablePython) {
      (config as any).skills.python = { enabled: true };
    }
    if (choices.enableShell) {
      (config as any).skills.shell = { enabled: true, requireApproval: true };
    }
  }

  // Gateway
  (config as any).gateway = {
    mode: "local",
    port: choices.gatewayPort,
    bind: choices.gatewayBind === "all" ? "0.0.0.0" : "127.0.0.1",
    ...(choices.enableAuth && {
      auth: {
        mode: "token",
        token: choices.authToken,
      },
    }),
  };

  return config;
}

// ============================================================================
// Main Wizard
// ============================================================================

export async function runFullOnboarding(): Promise<void> {
  intro("🚀 Moltbot Full Setup Wizard");

  const configExists = existsSync(CONFIG_PATH);
  if (configExists) {
    const overwrite = await confirm({
      message: "Config file already exists. Overwrite it?",
      initialValue: false,
    });
    if (isCancel(overwrite)) {
      cancel("Setup cancelled");
      return;
    }
    if (!overwrite) {
      cancel("Setup cancelled - keeping existing config");
      return;
    }
  }

  // Step 1: AI Provider
  const aiProvider = await selectAIProvider();
  if (isCancel(aiProvider)) {
    cancel("Setup cancelled");
    return;
  }

  // Step 2: API Key
  const apiKey = await getAPIKey(aiProvider as AIProvider);
  if (isCancel(apiKey)) {
    cancel("Setup cancelled");
    return;
  }

  // Step 3: Channels
  const channels = await selectChannels();
  if (isCancel(channels)) {
    cancel("Setup cancelled");
    return;
  }

  // Step 4: Skills
  const skills = await selectSkills();
  if (isCancel(skills)) {
    cancel("Setup cancelled");
    return;
  }

  // Step 5: Security Profile
  const securityProfile = await selectSecurityProfile();
  if (isCancel(securityProfile)) {
    cancel("Setup cancelled");
    return;
  }

  // Step 6: DM Pairing
  const pairing = await setupDMPairing();
  if (isCancel(pairing)) {
    cancel("Setup cancelled");
    return;
  }

  // Step 7: Gateway
  const gateway = await setupGateway();
  if (isCancel(gateway)) {
    cancel("Setup cancelled");
    return;
  }

  // Build choices
  const choices: OnboardingChoices = {
    aiProvider: aiProvider as AIProvider,
    apiKey: apiKey as string,
    channels: channels as MessagingChannel[],
    enableBrowser: (skills as any).browser,
    enablePython: (skills as any).python,
    enableShell: (skills as any).shell,
    securityProfile: securityProfile as SecurityProfile,
    enablePairing: (pairing as any).enabled,
    pairingCode: (pairing as any).code,
    gatewayPort: (gateway as any).port,
    gatewayBind: (gateway as any).bind,
    enableAuth: (gateway as any).auth,
    authToken: (gateway as any).token,
  };

  // Generate config
  const s = spinner();
  s.start("Generating configuration...");

  try {
    // Load existing config or create new one
    let config: MoltbotConfig;
    try {
      config = loadConfig();
    } catch {
      config = {} as MoltbotConfig;
    }

    // Apply base config
    const baseConfig = buildConfig(choices);
    Object.assign(config, baseConfig);

    // Apply security profile
    config = applyProfile(choices.securityProfile, config);

    // Write config
    await writeConfigFile(config);

    // Set environment variable
    const envVar = getDefaultApiKeyEnvVar(choices.aiProvider);
    const envFile = path.join(homedir(), ".profile");
    const envLine = `export ${envVar}="${choices.apiKey}"`;
    
    s.stop("✅ Configuration saved!");

    // Summary
    note(
      `AI Provider: ${choices.aiProvider}\n` +
      `Channels: ${choices.channels.length > 0 ? choices.channels.join(", ") : "None"}\n` +
      `Skills: Browser=${choices.enableBrowser}, Python=${choices.enablePython}, Shell=${choices.enableShell}\n` +
      `Security: ${choices.securityProfile}\n` +
      `DM Pairing: ${choices.enablePairing ? "✅ Enabled" : "❌ Disabled"}\n` +
      `Gateway: ${choices.gatewayBind}:${choices.gatewayPort}\n` +
      `Gateway Auth: ${choices.enableAuth ? "✅ Enabled" : "❌ Disabled"}\n\n` +
      `⚠️  Don't forget to add to ${envFile}:\n${envLine}`,
      "📋 Setup Summary"
    );

    outro("🎉 Setup complete! Run 'clancybot gateway run' to start.");

  } catch (error) {
    s.stop("❌ Setup failed");
    log.error("Setup failed:", error);
    throw error;
  }
}
