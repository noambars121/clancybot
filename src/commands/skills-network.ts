/**
 * CLI commands for skill network policies
 *
 * Commands:
 * - moltbot skills network <skill> --show
 * - moltbot skills network <skill> --mode allowlist
 * - moltbot skills network <skill> --allow "api.weather.com"
 * - moltbot skills network <skill> --block "192.168.*.*"
 * - moltbot skills network <skill> --test "https://api.example.com"
 *
 * @see Phase 10 - Pentagon++++ Security
 */

import { intro, outro, text, select, confirm, spinner, note } from "@clack/prompts";
import { bold, cyan, green, red, dim, yellow } from "kleur/colors";
import {
  NetworkPolicyManager,
  POLICY_PRESETS,
  type NetworkPolicy,
  type PolicyMode,
} from "../skills/network-policy.js";
import { NetworkEnforcer } from "../skills/network-enforcer.js";

// ============================================================================
// Show Policy Command
// ============================================================================

export async function showPolicyCommand(skillId: string): Promise<void> {
  intro(bold(cyan(`🌐 Network Policy: ${skillId}`)));

  const manager = new NetworkPolicyManager();
  await manager.load();

  const policy = manager.getPolicy(skillId);

  if (!policy) {
    note(yellow(`No network policy configured for skill: ${skillId}`), "Not Configured");
    outro(
      dim(`Run ${cyan(`moltbot skills network ${skillId} --mode allowlist`)} to create one`)
    );
    return;
  }

  // Display policy
  console.log(`\n📋 Policy Details:`);
  console.log(`  Mode: ${bold(policy.mode)}`);
  console.log(`  Status: ${policy.enabled ? green("Enabled") : red("Disabled")}`);

  if (policy.preset) {
    console.log(`  Preset: ${bold(policy.preset)}`);
  }

  if (policy.extends) {
    console.log(`  Extends: ${policy.extends}`);
  }

  console.log(`\n✅ Allowed:`);
  if (policy.allow.length === 0) {
    console.log(`  ${dim("(none)")}`);
  } else {
    for (const pattern of policy.allow) {
      console.log(`  • ${green(pattern)}`);
    }
  }

  console.log(`\n❌ Blocked:`);
  if (policy.block.length === 0) {
    console.log(`  ${dim("(none)")}`);
  } else {
    for (const pattern of policy.block) {
      console.log(`  • ${red(pattern)}`);
    }
  }

  if (policy.ports) {
    console.log(`\n🔌 Ports:`);
    if (policy.ports.allow) {
      console.log(`  Allow: ${green(policy.ports.allow.join(", "))}`);
    }
    if (policy.ports.block) {
      console.log(`  Block: ${red(policy.ports.block.join(", "))}`);
    }
  }

  if (policy.protocols) {
    console.log(`\n🔒 Protocols:`);
    if (policy.protocols.allow) {
      console.log(`  Allow: ${green(policy.protocols.allow.join(", "))}`);
    }
    if (policy.protocols.block) {
      console.log(`  Block: ${red(policy.protocols.block.join(", "))}`);
    }
  }

  outro(dim("Done"));
}

// ============================================================================
// Set Mode Command
// ============================================================================

export async function setModeCommand(skillId: string, mode: PolicyMode): Promise<void> {
  intro(bold(cyan(`🌐 Set Network Policy Mode: ${skillId}`)));

  const manager = new NetworkPolicyManager();
  await manager.load();

  const existing = manager.getPolicy(skillId);

  const policy: NetworkPolicy = {
    skillId,
    mode,
    allow: existing?.allow || [],
    block: existing?.block || [],
    enabled: true,
  };

  await manager.setPolicy(policy);

  outro(
    green(
      bold(
        `✅ Set mode to ${mode}\n\n` +
          (mode === "allowlist"
            ? dim("Add allowed domains with: ") +
              cyan(`moltbot skills network ${skillId} --allow "api.example.com"`)
            : dim("Add blocked domains with: ") +
              cyan(`moltbot skills network ${skillId} --block "192.168.*.*"`))
      )
    )
  );
}

// ============================================================================
// Allow/Block Commands
// ============================================================================

export async function allowCommand(skillId: string, pattern: string): Promise<void> {
  const manager = new NetworkPolicyManager();
  await manager.load();

  const existing = manager.getPolicy(skillId) || {
    skillId,
    mode: "allowlist" as PolicyMode,
    allow: [],
    block: [],
    enabled: true,
  };

  // Add to allow list
  if (!existing.allow.includes(pattern)) {
    existing.allow.push(pattern);
  }

  await manager.setPolicy(existing);

  console.log(green(`✅ Added to allowlist: ${pattern}`));
}

export async function blockCommand(skillId: string, pattern: string): Promise<void> {
  const manager = new NetworkPolicyManager();
  await manager.load();

  const existing = manager.getPolicy(skillId) || {
    skillId,
    mode: "blocklist" as PolicyMode,
    allow: [],
    block: [],
    enabled: true,
  };

  // Add to block list
  if (!existing.block.includes(pattern)) {
    existing.block.push(pattern);
  }

  await manager.setPolicy(existing);

  console.log(green(`✅ Added to blocklist: ${pattern}`));
}

// ============================================================================
// Test Command
// ============================================================================

export async function testPolicyCommand(skillId: string, url: string): Promise<void> {
  intro(bold(cyan(`🧪 Test Network Policy: ${skillId}`)));

  const s = spinner();
  s.start("Testing URL...");

  const manager = new NetworkPolicyManager();
  await manager.load();

  const result = await manager.check(skillId, url);

  s.stop("Test complete");

  console.log(`\n📊 Result:`);
  console.log(`  URL: ${url}`);
  console.log(`  Status: ${result.allowed ? green("✅ Allowed") : red("❌ Blocked")}`);

  if (result.reason) {
    console.log(`  Reason: ${result.reason}`);
  }

  if (result.matchedRule) {
    console.log(`  Matched Rule: ${dim(result.matchedRule)}`);
  }

  outro(dim("Done"));
}

// ============================================================================
// Preset Command
// ============================================================================

export async function presetCommand(skillId: string, presetName: string): Promise<void> {
  intro(bold(cyan(`🎨 Apply Preset: ${presetName}`)));

  const preset = POLICY_PRESETS[presetName];

  if (!preset) {
    outro(
      red(`❌ Unknown preset: ${presetName}\n\n`) +
        dim("Available presets:\n") +
        Object.keys(POLICY_PRESETS)
          .map((name) => `  • ${cyan(name)} - ${POLICY_PRESETS[name].description}`)
          .join("\n")
    );
    return;
  }

  // Display preset details
  note(
    dim(
      `${preset.description}\n\n` +
        `Mode: ${preset.policy.mode}\n` +
        `Allow: ${preset.policy.allow.join(", ") || "(none)"}\n` +
        `Block: ${preset.policy.block.join(", ") || "(none)"}`
    ),
    preset.name
  );

  const proceed = (await confirm({
    message: `Apply preset "${presetName}" to skill "${skillId}"?`,
    initialValue: true,
  })) as boolean;

  if (!proceed) {
    outro(dim("Cancelled"));
    return;
  }

  const manager = new NetworkPolicyManager();
  await manager.load();

  const policy: NetworkPolicy = {
    skillId,
    preset: presetName,
    enabled: true,
    ...preset.policy,
  };

  await manager.setPolicy(policy);

  outro(green(bold(`✅ Applied preset: ${presetName}`)));
}

// ============================================================================
// Audit Command
// ============================================================================

export async function auditCommand(skillId?: string, limit = 20): Promise<void> {
  intro(bold(cyan("📜 Network Audit Log")));

  const s = spinner();
  s.start("Loading audit log...");

  const manager = new NetworkPolicyManager();
  await manager.load();

  const enforcer = new NetworkEnforcer(manager);
  const requests = await enforcer.getRecentRequests(limit);

  s.stop(`Loaded ${requests.length} requests`);

  if (requests.length === 0) {
    outro(dim("No network requests logged"));
    return;
  }

  // Filter by skill if specified
  let filtered = requests;
  if (skillId) {
    filtered = requests.filter((r) => r.skillId === skillId);
  }

  // Display requests
  console.log(`\n📊 Recent requests (last ${limit}):\n`);

  for (const req of filtered.reverse()) {
    const status = req.allowed ? green("✅") : red("❌");
    const date = new Date(req.timestamp).toLocaleString();

    console.log(`${status} ${bold(req.skillId)}`);
    console.log(`   ${req.url}`);
    console.log(`   ${dim(date)}`);

    if (!req.allowed) {
      console.log(`   ${yellow(`Reason: ${req.reason}`)}`);
    }

    if (req.resolvedIP) {
      console.log(`   ${dim(`IP: ${req.resolvedIP}`)}`);
    }

    console.log();
  }

  // Show stats
  const stats = await enforcer.getStats();

  console.log(`\n📈 Statistics:`);
  console.log(`  Total: ${stats.total}`);
  console.log(`  Allowed: ${green(stats.allowed.toString())}`);
  console.log(`  Blocked: ${red(stats.blocked.toString())}`);

  outro(dim("End of log"));
}

// ============================================================================
// List Presets Command
// ============================================================================

export async function listPresetsCommand(): Promise<void> {
  intro(bold(cyan("🎨 Available Policy Presets")));

  console.log();

  for (const [name, preset] of Object.entries(POLICY_PRESETS)) {
    console.log(`${bold(cyan(name))}`);
    console.log(`  ${preset.description}`);
    console.log(`  Mode: ${preset.policy.mode}`);
    console.log();
  }

  outro(
    dim(
      `Apply with: ${cyan("moltbot skills network <skill> --preset <name>")}`
    )
  );
}
