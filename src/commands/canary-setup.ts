/**
 * CLI commands for canary token management
 *
 * Commands:
 * - moltbot canary setup   - Interactive setup
 * - moltbot canary status  - View canary status
 * - moltbot canary inject  - Inject into memory file
 *
 * @see Phase 9 - Pentagon+++ Security
 */

import { intro, outro, text, select, confirm, spinner, note } from "@clack/prompts";
import { bold, cyan, green, red, dim, yellow } from "kleur/colors";
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  CanaryTokenManager,
  DEFAULT_CANARY_CONFIG,
  type CanaryConfig,
  type CanaryToken,
} from "../security/canary-tokens.js";
import { startCanaryService } from "../security/canary-service.js";
import { loadConfig, writeConfigFile } from "../config/config.js";

// ============================================================================
// Setup Command
// ============================================================================

export async function setupCommand(): Promise<void> {
  intro(bold(cyan("🍯 Canary Token Setup")));

  // Explain concept
  note(
    dim(
      "Canary tokens are 'honey' planted in your memory files.\n" +
        "If an attacker steals your data and tries to use it,\n" +
        "you'll get an immediate alert!\n\n" +
        "How it works:\n" +
        "1. We inject fake API keys/URLs into memory\n" +
        "2. If someone uses them externally, we detect it\n" +
        "3. You get notified of the breach in real-time"
    ),
    "What are Canary Tokens?"
  );

  // Check if already enabled
  const config = loadConfig();
  const canaryConfig = (config as any).security?.canary as CanaryConfig | undefined;

  if (canaryConfig?.enabled) {
    const continueSetup = await confirm({
      message: "Canary tokens are already enabled. Continue anyway?",
      initialValue: false,
    });

    if (!continueSetup) {
      outro(dim("Setup cancelled"));
      return;
    }
  }

  // Ask for configuration
  const serviceUrl = (await text({
    message: "Canary service URL",
    placeholder: "http://localhost:19999",
    initialValue: canaryConfig?.serviceUrl || "http://localhost:19999",
    validate: (value) => {
      if (!value) return "Service URL is required";
      if (!value.startsWith("http://") && !value.startsWith("https://")) {
        return "Must be a valid HTTP(S) URL";
      }
    },
  })) as string;

  const checkInterval = (await select({
    message: "Check interval (how often to check for triggers)",
    options: [
      { value: 60000, label: "1 minute (fastest)", hint: "High monitoring" },
      { value: 300000, label: "5 minutes (recommended)", hint: "Balanced" },
      { value: 900000, label: "15 minutes", hint: "Lower overhead" },
      { value: 3600000, label: "1 hour", hint: "Minimal monitoring" },
    ],
    initialValue: canaryConfig?.checkIntervalMs || 300000,
  })) as number;

  const autoInject = (await confirm({
    message: "Auto-inject canaries into memory files?",
    initialValue: canaryConfig?.autoInject ?? true,
  })) as boolean;

  // Optional: Email alerts
  const wantsEmail = (await confirm({
    message: "Configure email alerts? (optional)",
    initialValue: false,
  })) as boolean;

  let alertEmail: string | undefined;
  if (wantsEmail) {
    alertEmail = (await text({
      message: "Email for alerts",
      placeholder: "your@email.com",
      validate: (value) => {
        if (!value) return;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          return "Must be a valid email";
        }
      },
    })) as string;
  }

  // Save configuration
  const s = spinner();
  s.start("Saving canary configuration...");

  const newCanaryConfig: CanaryConfig = {
    enabled: true,
    serviceUrl,
    checkIntervalMs: checkInterval,
    autoInject,
    alertEmail,
  };

  // Update config with canary settings
  (config as any).security = {
    ...(config as any).security,
    canary: newCanaryConfig,
  };
  await writeConfigFile(config);

  s.stop("Configuration saved");

  // Start canary service
  const startService = (await confirm({
    message: "Start canary monitoring service now?",
    initialValue: true,
  })) as boolean;

  if (startService) {
    s.start("Starting canary service...");

    try {
      const service = await startCanaryService({
        port: new URL(serviceUrl).port ? parseInt(new URL(serviceUrl).port) : 19999,
        host: "127.0.0.1",
        enabled: true,
      });

      s.stop(`Canary service running on ${serviceUrl}`);

      // Inject canaries
      if (autoInject) {
        await injectCanariesCommand();
      }

      outro(
        green(
          bold(
            "🎉 Canary tokens configured!\n\n" +
              `✅ Service running on ${serviceUrl}\n` +
              `✅ Checking every ${checkInterval / 60000} minute(s)\n` +
              (autoInject ? `✅ Auto-injection enabled\n` : "") +
              (alertEmail ? `✅ Alerts sent to ${alertEmail}\n` : "") +
              `\n${dim("Run")} ${cyan("moltbot canary status")} ${dim("to view status")}`
          )
        )
      );
    } catch (err) {
      s.stop("Failed to start service");
      outro(
        red(
          `❌ Error: ${err instanceof Error ? err.message : String(err)}\n\n` +
            dim("Note: Service will auto-start with gateway next time")
        )
      );
    }
  } else {
    outro(
      green(
        bold(
          "✅ Configuration saved!\n\n" +
            dim("The canary service will auto-start with the gateway.\n") +
            dim(`Run ${cyan("moltbot canary status")} to check status.`)
        )
      )
    );
  }
}

// ============================================================================
// Status Command
// ============================================================================

export async function statusCommand(): Promise<void> {
  intro(bold(cyan("🍯 Canary Token Status")));

  const config = loadConfig();
  const canaryConfig = (config as any).security?.canary as CanaryConfig | undefined;

  if (!canaryConfig?.enabled) {
    note(
      yellow(
        "Canary tokens are not enabled.\n\n" +
          `Run ${cyan("moltbot canary setup")} to configure.`
      ),
      "Not Configured"
    );
    outro(dim("Done"));
    return;
  }

  // Load canary manager
  const manager = new CanaryTokenManager(canaryConfig);
  const canariesPath = join(homedir(), ".moltbot", "security", "canaries.json");

  if (existsSync(canariesPath)) {
    await manager.load(canariesPath);
  }

  // Check for triggers
  const s = spinner();
  s.start("Checking for canary triggers...");

  const alerts = await manager.checkCanaries();

  s.stop("Check complete");

  // Display status
  const tokens = manager.getTokens();

  console.log("\n📊 Canary Status:");
  console.log(`  Enabled: ${green("Yes")}`);
  console.log(`  Service: ${canaryConfig.serviceUrl}`);
  console.log(`  Check Interval: ${canaryConfig.checkIntervalMs / 60000} minute(s)`);
  console.log(`  Auto-Inject: ${canaryConfig.autoInject ? green("Yes") : dim("No")}`);
  if (canaryConfig.alertEmail) {
    console.log(`  Alerts: ${canaryConfig.alertEmail}`);
  }

  console.log(`\n🍯 Active Canaries: ${tokens.length}`);

  if (tokens.length > 0) {
    for (const token of tokens) {
      const triggered = token.accessed.length > 0;
      const status = triggered ? red("🚨 TRIGGERED") : green("✅ Safe");
      console.log(`\n  ${token.type} (${token.id.slice(0, 8)}...)`);
      console.log(`    Status: ${status}`);
      console.log(`    Description: ${dim(token.description)}`);
      if (triggered) {
        console.log(`    Accesses: ${token.accessed.length}`);
        const latest = token.accessed[token.accessed.length - 1];
        console.log(`    Latest: ${new Date(latest.timestamp).toISOString()}`);
        console.log(`    From: ${latest.ip}`);
      }
    }
  }

  // Display alerts
  if (alerts.length > 0) {
    console.log(`\n${red(bold("🚨 ALERTS:"))}`);
    for (const alert of alerts) {
      console.log(`\n${alert.message}`);
      console.log(`\n${yellow(alert.recommendation)}`);
    }

    outro(red(bold("⚠️  SECURITY BREACH DETECTED! Take action immediately.")));
  } else {
    outro(green("✅ All canaries are safe (no triggers detected)"));
  }
}

// ============================================================================
// Inject Command
// ============================================================================

export async function injectCommand(): Promise<void> {
  intro(bold(cyan("🍯 Inject Canary Tokens")));

  // Get memory file path
  const memoryPath = (await text({
    message: "Path to memory file",
    placeholder: "~/.moltbot/memory/MEMORY.md",
    validate: (value) => {
      if (!value) return "Path is required";
      const expanded = value.replace(/^~/, homedir());
      if (!existsSync(expanded)) {
        return `File not found: ${expanded}`;
      }
    },
  })) as string;

  const expanded = memoryPath.replace(/^~/, homedir());

  // Confirm
  const proceed = (await confirm({
    message: `Inject canaries into ${expanded}?`,
    initialValue: true,
  })) as boolean;

  if (!proceed) {
    outro(dim("Cancelled"));
    return;
  }

  // Inject
  const s = spinner();
  s.start("Injecting canary tokens...");

  try {
    const config = loadConfig();
    const canaryConfig = ((config as any).security?.canary as CanaryConfig) || DEFAULT_CANARY_CONFIG;
    const manager = new CanaryTokenManager(canaryConfig);

    await manager.injectIntoFile(expanded);

    // Save canaries
    const canariesPath = join(homedir(), ".moltbot", "security", "canaries.json");
    await manager.save(canariesPath);

    s.stop("Injection complete");

    const tokens = manager.getTokens();
    console.log(`\n✅ Injected ${tokens.length} canary tokens:`);
    for (const token of tokens) {
      console.log(`  • ${token.type}: ${dim(token.description)}`);
    }

    outro(
      green(
        bold(
          "🎉 Canaries planted!\n\n" +
            `If anyone steals and uses this data, you'll be alerted.\n` +
            `${dim("Run")} ${cyan("moltbot canary status")} ${dim("to monitor")}`
        )
      )
    );
  } catch (err) {
    s.stop("Failed");
    outro(red(`❌ Error: ${err instanceof Error ? err.message : String(err)}`));
  }
}

// ============================================================================
// Helper: Auto-inject (called from setup)
// ============================================================================

async function injectCanariesCommand(): Promise<void> {
  const s = spinner();
  s.start("Injecting canaries into memory files...");

  try {
    const config = loadConfig();
    const canaryConfig = ((config as any).security?.canary as CanaryConfig) || DEFAULT_CANARY_CONFIG;
    const manager = new CanaryTokenManager(canaryConfig);

    // Find memory files
    const memoryDir = join(homedir(), ".moltbot", "memory");
    const memoryFile = join(memoryDir, "MEMORY.md");

    if (existsSync(memoryFile)) {
      await manager.injectIntoFile(memoryFile);

      // Save canaries
      const canariesPath = join(homedir(), ".moltbot", "security", "canaries.json");
      await manager.save(canariesPath);

      s.stop(`Injected into ${memoryFile}`);
    } else {
      s.stop("No memory files found (will inject on first use)");
    }
  } catch (err) {
    s.stop("Failed to inject");
    console.error(dim(`Error: ${err instanceof Error ? err.message : String(err)}`));
  }
}
