import { spawn } from "node:child_process";
import { installSkill } from "../agents/skills-install.js";
import { buildWorkspaceSkillStatus } from "../agents/skills-status.js";
import { formatCliCommand } from "../cli/command-format.js";
import type { MoltbotConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { detectBinary, resolveNodeManagerOptions } from "./onboard-helpers.js";
import { runCommandWithTimeout } from "../process/exec.js";

function summarizeInstallFailure(message: string): string | undefined {
  const cleaned = message.replace(/^Install failed(?:\s*\([^)]*\))?\s*:?\s*/i, "").trim();
  if (!cleaned) return undefined;
  const maxLen = 140;
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen - 1)}…` : cleaned;
}

function formatSkillHint(skill: {
  description?: string;
  install: Array<{ label: string }>;
}): string {
  const desc = skill.description?.trim();
  const installLabel = skill.install[0]?.label?.trim();
  const combined = desc && installLabel ? `${desc} — ${installLabel}` : desc || installLabel;
  if (!combined) return "install";
  const maxLen = 90;
  return combined.length > maxLen ? `${combined.slice(0, maxLen - 1)}…` : combined;
}

function upsertSkillEntry(
  cfg: MoltbotConfig,
  skillKey: string,
  patch: { apiKey?: string },
): MoltbotConfig {
  const entries = { ...cfg.skills?.entries };
  const existing = (entries[skillKey] as { apiKey?: string } | undefined) ?? {};
  entries[skillKey] = { ...existing, ...patch };
  return {
    ...cfg,
    skills: {
      ...cfg.skills,
      entries,
    },
  };
}

export async function setupSkills(
  cfg: MoltbotConfig,
  workspaceDir: string,
  runtime: RuntimeEnv,
  prompter: WizardPrompter,
): Promise<MoltbotConfig> {
  const report = buildWorkspaceSkillStatus(workspaceDir, { config: cfg });
  const eligible = report.skills.filter((s) => s.eligible);
  const missing = report.skills.filter((s) => !s.eligible && !s.disabled && !s.blockedByAllowlist);
  const blocked = report.skills.filter((s) => s.blockedByAllowlist);

  const needsBrewPrompt =
    process.platform !== "win32" &&
    report.skills.some((skill) => skill.install.some((option) => option.kind === "brew")) &&
    !(await detectBinary("brew"));

  await prompter.note(
    [
      `Eligible: ${eligible.length}`,
      `Missing requirements: ${missing.length}`,
      `Blocked by allowlist: ${blocked.length}`,
    ].join("\n"),
    "Skills status",
  );

  const shouldConfigure = await prompter.confirm({
    message: "Configure skills now? (recommended)",
    initialValue: true,
  });
  if (!shouldConfigure) return cfg;

  if (needsBrewPrompt) {
    await prompter.note(
      [
        "Many skill dependencies require Homebrew (package manager).",
        "Without brew, skills cannot be installed automatically.",
      ].join("\n"),
      "Homebrew required",
    );
    const installBrew = await prompter.confirm({
      message: "Install Homebrew now? (recommended)",
      initialValue: true,
    });
    if (installBrew) {
      const spin = prompter.progress("Installing Homebrew (this may take 10+ minutes)...");
      try {
        // Check if curl is available
        if (!(await detectBinary("curl"))) {
          spin.stop("❌ curl is not installed");
          await prompter.note(
            [
              "curl is required to install Homebrew.",
              "",
              "On Ubuntu/Debian, install with:",
              "  sudo apt-get update && sudo apt-get install -y curl build-essential",
              "",
              "On RHEL/CentOS, install with:",
              "  sudo yum install -y curl gcc make",
            ].join("\n"),
            "curl required",
          );
          return cfg;
        }
        
        // Install Homebrew using spawn (interactive)
        const installCmd = '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"';
        await new Promise<void>((resolve, reject) => {
          const child = spawn("bash", ["-c", installCmd], {
            stdio: "inherit", // Pass through stdin/stdout/stderr
            shell: true,
          });
          
          child.on("exit", (code) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`Homebrew installation failed with exit code ${code}`));
            }
          });
          
          child.on("error", (err) => {
            reject(err);
          });
        });
        
        spin.stop("✅ Homebrew installed!");
        
        // Add Homebrew to PATH for current session
        const brewPath = "/home/linuxbrew/.linuxbrew/bin/brew";
        const homebrewBinDir = "/home/linuxbrew/.linuxbrew/bin";
        
        // Add to PATH if not already there
        if (!process.env.PATH?.includes(homebrewBinDir)) {
          process.env.PATH = `${homebrewBinDir}:${process.env.PATH}`;
        }
        
        // Set Homebrew environment variables
        if (await detectBinary(brewPath)) {
          try {
            const { stdout } = await runCommandWithTimeout([brewPath, "shellenv"], {
              timeoutMs: 5000,
            });
            const envVars = stdout.split("\n").filter((line: string) => line.startsWith("export "));
            for (const line of envVars) {
              const match = line.match(/export\s+(\w+)="([^"]*)"/);
              if (match) {
                process.env[match[1]] = match[2];
              }
            }
          } catch (err) {
            runtime.error(`Failed to get brew shellenv: ${String(err)}`);
          }
        }
        
        // Verify brew is now available
        if (!(await detectBinary("brew"))) {
          throw new Error("brew command not found in PATH after installation");
        }
        
        // Install uv (Python package manager) automatically
        await prompter.note("Installing uv (Python package manager)...", "Additional setup");
        const uvSpin = prompter.progress("Installing uv...");
        try {
          await new Promise<void>((resolve, reject) => {
            const child = spawn("brew", ["install", "uv"], {
              stdio: "inherit",
            });
            
            child.on("exit", (code) => {
              if (code === 0) {
                resolve();
              } else {
                reject(new Error(`uv installation failed with exit code ${code}`));
              }
            });
            
            child.on("error", (err) => {
              reject(err);
            });
          });
          uvSpin.stop("✅ uv installed successfully!");
        } catch (err) {
          uvSpin.stop(`⚠️ uv installation failed: ${err instanceof Error ? err.message : String(err)}`);
        }
        
        await prompter.note(
          [
            "✅ Homebrew is now ready!",
            "Note: Add Homebrew to your shell permanently by running:",
            'echo \'eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"\' >> ~/.bashrc',
          ].join("\n"),
          "Setup complete",
        );
      } catch (err) {
        spin.stop("❌ Homebrew installation failed");
        runtime.error(`Failed to install Homebrew: ${String(err)}`);
        await prompter.note(
          [
            "Manual installation required:",
            '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
            "",
            "After installation, add to PATH:",
            'eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"',
          ].join("\n"),
          "Homebrew installation",
        );
      }
    } else {
      await prompter.note(
        [
          "Skipping Homebrew installation.",
          "Skills requiring brew will not be installed.",
          "",
          "To install later, run:",
          '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
        ].join("\n"),
        "Homebrew skipped",
      );
    }
  }

  const nodeManager = (await prompter.select({
    message: "Preferred node manager for skill installs",
    options: resolveNodeManagerOptions(),
  })) as "npm" | "pnpm" | "bun";

  let next: MoltbotConfig = {
    ...cfg,
    skills: {
      ...cfg.skills,
      install: {
        ...cfg.skills?.install,
        nodeManager,
      },
    },
  };

  const installable = missing.filter(
    (skill) => skill.install.length > 0 && skill.missing.bins.length > 0,
  );
  if (installable.length > 0) {
    const toInstall = await prompter.multiselect({
      message: "Install missing skill dependencies",
      options: [
        {
          value: "__skip__",
          label: "Skip for now",
          hint: "Continue without installing dependencies",
        },
        ...installable.map((skill) => ({
          value: skill.name,
          label: `${skill.emoji ?? "🧩"} ${skill.name}`,
          hint: formatSkillHint(skill),
        })),
      ],
    });

    const selected = (toInstall as string[]).filter((name) => name !== "__skip__");
    for (const name of selected) {
      const target = installable.find((s) => s.name === name);
      if (!target || target.install.length === 0) continue;
      const installId = target.install[0]?.id;
      if (!installId) continue;
      const spin = prompter.progress(`Installing ${name}…`);
      const result = await installSkill({
        workspaceDir,
        skillName: target.name,
        installId,
        config: next,
      });
      if (result.ok) {
        spin.stop(`Installed ${name}`);
      } else {
        const code = result.code == null ? "" : ` (exit ${result.code})`;
        const detail = summarizeInstallFailure(result.message);
        spin.stop(`Install failed: ${name}${code}${detail ? ` — ${detail}` : ""}`);
        if (result.stderr) runtime.log(result.stderr.trim());
        else if (result.stdout) runtime.log(result.stdout.trim());
        runtime.log(
          `Tip: run \`${formatCliCommand("moltbot doctor")}\` to review skills + requirements.`,
        );
        runtime.log("Docs: https://docs.molt.bot/skills");
      }
    }
  }

  for (const skill of missing) {
    if (!skill.primaryEnv || skill.missing.env.length === 0) continue;
    const wantsKey = await prompter.confirm({
      message: `Set ${skill.primaryEnv} for ${skill.name}?`,
      initialValue: false,
    });
    if (!wantsKey) continue;
    const apiKey = String(
      await prompter.text({
        message: `Enter ${skill.primaryEnv}`,
        validate: (value) => (value?.trim() ? undefined : "Required"),
      }),
    );
    next = upsertSkillEntry(next, skill.skillKey, { apiKey: apiKey.trim() });
  }

  return next;
}
