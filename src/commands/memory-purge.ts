/**
 * CLI commands for memory purge (Right to be Forgotten)
 *
 * Commands:
 * - moltbot memory purge <query>  - Purge content from all layers
 * - moltbot memory scan <query>   - Preview without deleting
 * - moltbot memory audit          - View purge history
 *
 * @see Phase 10 - Pentagon++++ Security
 */

import { intro, outro, text, select, confirm, spinner, note } from "@clack/prompts";
import { bold, cyan, green, red, dim, yellow } from "kleur/colors";
import { MemoryDoctor, type MemoryMatch, type PurgeOptions } from "../memory/memory-doctor.js";
import { getChildLogger } from "../logging.js";

const log = getChildLogger("memory-purge");

// ============================================================================
// Purge Command
// ============================================================================

export async function purgeCommand(query?: string, options: Partial<PurgeOptions> = {}): Promise<void> {
  intro(bold(cyan("🧠 Memory Purge - Right to be Forgotten")));

  // Get query if not provided
  if (!query) {
    query = (await text({
      message: "What to purge from memory?",
      placeholder: "e.g., my password, credit card, sensitive info",
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return "Please enter a search query";
        }
        if (value.trim().length < 3) {
          return "Query must be at least 3 characters";
        }
      },
    })) as string;
  }

  if (!query) {
    outro(dim("Cancelled"));
    return;
  }

  // Explain what will happen
  note(
    dim(
      `This will scan all memory layers:\n` +
        `  • Markdown files (MEMORY.md, USER.md)\n` +
        `  • Conversation logs (*.jsonl)\n` +
        `  • Session cache\n` +
        `  • Backup files\n` +
        (options.semantic ? `  • Vector embeddings (semantic search)\n` : "") +
        `\nMatching content will be permanently deleted.`
    ),
    "Memory Layers"
  );

  // Semantic search option
  if (!options.semantic) {
    const useSemantic = (await confirm({
      message: "Use semantic search? (finds related content, not just exact matches)",
      initialValue: false,
    })) as boolean;

    options.semantic = useSemantic;
  }

  // Scan for matches
  const s = spinner();
  s.start("Scanning memory layers...");

  const doctor = new MemoryDoctor();

  let matches: MemoryMatch[];
  try {
    matches = await doctor.scan(query, options);
    s.stop(`Found ${matches.length} match${matches.length !== 1 ? "es" : ""}`);
  } catch (err) {
    s.stop("Scan failed");
    outro(red(`❌ Error: ${err instanceof Error ? err.message : String(err)}`));
    return;
  }

  if (matches.length === 0) {
    outro(green("✅ No matches found. Memory is clean."));
    return;
  }

  // Display matches
  console.log(`\n📊 Found in:`);

  const byLayer = new Map<string, number>();
  for (const match of matches) {
    byLayer.set(match.layer, (byLayer.get(match.layer) || 0) + 1);
  }

  for (const [layer, count] of byLayer.entries()) {
    console.log(`  • ${layer}: ${count} match${count !== 1 ? "es" : ""}`);
  }

  // Preview mode
  if (options.preview !== false) {
    console.log(`\n📄 Preview (first 5):`);

    for (const match of matches.slice(0, 5)) {
      console.log(`\n  ${dim(match.file)}`);
      if (match.line) {
        console.log(`  ${dim(`Line ${match.line}:`)}`);
      }
      console.log(`  ${yellow(truncate(match.content, 80))}`);
    }

    if (matches.length > 5) {
      console.log(`\n  ${dim(`... and ${matches.length - 5} more`)}`);
    }
  }

  // Confirm deletion
  if (!options.force) {
    const proceed = (await confirm({
      message: red(
        bold(`⚠️  Delete all ${matches.length} match${matches.length !== 1 ? "es" : ""}?`)
      ),
      initialValue: false,
    })) as boolean;

    if (!proceed) {
      outro(dim("Cancelled"));
      return;
    }
  }

  // Purge
  s.start("Purging from all layers...");

  try {
    const result = await doctor.purge(query, { ...options, preview: false });

    s.stop("Purge complete");

    // Display results
    console.log(`\n✅ Results:`);
    console.log(`  Matches found: ${result.matchesFound}`);
    console.log(`  Matches deleted: ${result.matchesDeleted}`);
    console.log(`  Layers affected: ${result.layersAffected.join(", ")}`);

    if (result.verificationPassed) {
      console.log(`  ${green("✅ Verification: No matches remain")}`);
    } else {
      console.log(`  ${yellow("⚠️  Verification: Some matches may still exist")}`);
    }

    console.log(`\n📝 Audit log updated`);
    console.log(`  ${dim("Run")} ${cyan("moltbot memory audit")} ${dim("to view history")}`);

    outro(
      green(
        bold(
          `🎉 Memory purged!\n\n` +
            `✅ Deleted ${result.matchesDeleted} instance${result.matchesDeleted !== 1 ? "s" : ""}\n` +
            `✅ GDPR compliant (Right to be Forgotten)\n` +
            `✅ Audit trail recorded`
        )
      )
    );
  } catch (err) {
    s.stop("Purge failed");
    outro(red(`❌ Error: ${err instanceof Error ? err.message : String(err)}`));
  }
}

// ============================================================================
// Scan Command (Preview Only)
// ============================================================================

export async function scanCommand(query?: string, options: Partial<PurgeOptions> = {}): Promise<void> {
  intro(bold(cyan("🔍 Memory Scan")));

  // Get query
  if (!query) {
    query = (await text({
      message: "What to search for?",
      placeholder: "e.g., password, credit card",
    })) as string;
  }

  if (!query) {
    outro(dim("Cancelled"));
    return;
  }

  // Scan
  const s = spinner();
  s.start("Scanning...");

  const doctor = new MemoryDoctor();

  try {
    const matches = await doctor.scan(query, { ...options, dryRun: true });

    s.stop(`Found ${matches.length} match${matches.length !== 1 ? "es" : ""}`);

    if (matches.length === 0) {
      outro(green("✅ No matches found"));
      return;
    }

    // Display all matches
    console.log(`\n📊 Matches by layer:`);

    const byLayer = new Map<string, MemoryMatch[]>();
    for (const match of matches) {
      if (!byLayer.has(match.layer)) {
        byLayer.set(match.layer, []);
      }
      byLayer.get(match.layer)!.push(match);
    }

    for (const [layer, layerMatches] of byLayer.entries()) {
      console.log(`\n${bold(layer)} (${layerMatches.length}):`);

      for (const match of layerMatches.slice(0, 3)) {
        console.log(`  ${dim(match.file)}`);
        if (match.line) {
          console.log(`  ${dim(`Line ${match.line}:`)}`);
        }
        console.log(`  ${yellow(truncate(match.content, 80))}`);
        console.log();
      }

      if (layerMatches.length > 3) {
        console.log(`  ${dim(`... and ${layerMatches.length - 3} more`)}`);
      }
    }

    const purgeHint = `${cyan("moltbot memory purge")} ${dim(`"${query}"`)}`;
    outro(`${dim("To delete:")} ${purgeHint}`);
  } catch (err) {
    s.stop("Scan failed");
    outro(red(`❌ Error: ${err instanceof Error ? err.message : String(err)}`));
  }
}

// ============================================================================
// Audit Command
// ============================================================================

export async function auditCommand(limit = 20): Promise<void> {
  intro(bold(cyan("📜 Memory Purge Audit History")));

  const s = spinner();
  s.start("Loading audit history...");

  const doctor = new MemoryDoctor();

  try {
    const history = await doctor.getAuditHistory(limit);

    s.stop(`Loaded ${history.length} entries`);

    if (history.length === 0) {
      outro(dim("No purge history found"));
      return;
    }

    // Display history
    console.log(`\n📊 Recent purges (last ${limit}):\n`);

    for (const entry of history.reverse()) {
      const date = new Date(entry.timestamp);
      const status = entry.verificationPassed ? green("✅") : yellow("⚠️");

      console.log(`${status} ${bold(entry.query)}`);
      console.log(`   ${dim(date.toISOString())}`);
      console.log(
        `   Found: ${entry.matchesFound}, Deleted: ${entry.matchesDeleted}, Layers: ${entry.layersAffected.join(", ")}`
      );
      console.log();
    }

    outro(dim("End of history"));
  } catch (err) {
    s.stop("Failed to load history");
    outro(red(`❌ Error: ${err instanceof Error ? err.message : String(err)}`));
  }
}

// ============================================================================
// Helpers
// ============================================================================

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return text.slice(0, maxLength - 3) + "...";
}
