/**
 * CLI commands for skill signing
 *
 * Commands:
 * - moltbot skills keygen    - Generate signing key pair
 * - moltbot skills sign      - Sign a skill
 * - moltbot skills verify    - Verify skill signature
 *
 * @see Phase 9 - Pentagon+++ Security
 */

import { intro, outro, text, select, confirm, spinner, note, password } from "@clack/prompts";
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import { generateKeyPair, SkillSigner, TrustLevel, type KeyPair } from "../skills/signing.js";
import { getDefaultTrustStore } from "../skills/trust-store.js";

// Color helpers (simple passthrough)
const bold = (s: string) => s;
const cyan = (s: string) => s;
const green = (s: string) => s;
const yellow = (s: string) => s;
const red = (s: string) => s;
const dim = (s: string) => s;

// ============================================================================
// Keygen Command
// ============================================================================

export async function keygenCommand(): Promise<void> {
  intro(bold(cyan("🔑 Generate Signing Key")));

  // Check if key already exists
  const keyPath = join(homedir(), ".moltbot", "signing");
  const privateKeyPath = join(keyPath, "private.pem");
  const publicKeyPath = join(keyPath, "public.pem");

  if (existsSync(privateKeyPath)) {
    const overwrite = (await confirm({
      message: "Signing key already exists. Overwrite?",
      initialValue: false,
    })) as boolean;

    if (!overwrite) {
      outro(dim("Cancelled"));
      return;
    }
  }

  // Get developer info
  const name = (await text({
    message: "Your name (developer)",
    placeholder: "John Doe",
    validate: (value) => {
      if (!value || value.trim().length === 0) {
        return "Name is required";
      }
    },
  })) as string;

  const email = (await text({
    message: "Your email",
    placeholder: "john@example.com",
    validate: (value) => {
      if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return "Must be a valid email";
      }
    },
  })) as string;

  // Generate key pair
  const s = spinner();
  s.start("Generating ED25519 key pair...");

  const keyPair: KeyPair = generateKeyPair();

  // Create directory
  await mkdir(keyPath, { recursive: true });

  // Save private key (secure permissions)
  await writeFile(privateKeyPath, keyPair.privateKey, "utf8");
  await chmod(privateKeyPath, 0o600); // Read/write by owner only

  // Save public key
  await writeFile(publicKeyPath, keyPair.publicKey, "utf8");

  // Save metadata
  const metadata = {
    name,
    email,
    fingerprint: keyPair.fingerprint,
    generated: new Date().toISOString(),
  };
  await writeFile(join(keyPath, "metadata.json"), JSON.stringify(metadata, null, 2), "utf8");

  s.stop("Key pair generated");

  // Display info
  console.log(`\n✅ Key pair saved:`);
  console.log(`  Private: ${privateKeyPath} ${red("(keep secret!)")}`);
  console.log(`  Public:  ${publicKeyPath}`);
  console.log(`\n🔑 Fingerprint: ${dim(keyPair.fingerprint.slice(0, 32))}...`);

  // Add to trust store?
  const addToTrust = (await confirm({
    message: "Add to trust store? (so you can verify your own skills)",
    initialValue: true,
  })) as boolean;

  if (addToTrust) {
    try {
      const store = await getDefaultTrustStore();
      await store.importDeveloper(keyPair.publicKey, name, TrustLevel.COMMUNITY, email);

      console.log(`\n✅ Added to trust store as ${cyan("Community")} developer`);
    } catch (err) {
      console.log(`\n⚠️  ${yellow(`Could not add to trust store: ${err}`)}`);
    }
  }

  outro(
    green(
      bold(
        "🎉 Key pair created!\n\n" +
          `${dim("Next steps:")}\n` +
          `1. Keep private.pem secure (never share!)\n` +
          `2. Share public.pem with users (for verification)\n` +
          `3. Sign your skills: ${cyan("moltbot skills sign ./my-skill")}`
      )
    )
  );
}

// ============================================================================
// Sign Command
// ============================================================================

export async function signCommand(skillPath?: string): Promise<void> {
  intro(bold(cyan("✍️  Sign Skill")));

  // Get skill path
  if (!skillPath) {
    skillPath = (await text({
      message: "Path to skill directory",
      placeholder: "./my-skill",
      validate: (value) => {
        if (!value) return "Path is required";
        if (!existsSync(value)) {
          return `Directory not found: ${value}`;
        }
      },
    })) as string;
  }

  // Check if already signed
  const signaturePath = join(skillPath, "SIGNATURE.json");
  if (existsSync(signaturePath)) {
    const overwrite = (await confirm({
      message: "Skill is already signed. Re-sign?",
      initialValue: false,
    })) as boolean;

    if (!overwrite) {
      outro(dim("Cancelled"));
      return;
    }
  }

  // Get private key
  const defaultKeyPath = join(homedir(), ".moltbot", "signing", "private.pem");
  let privateKeyPath: string;

  if (existsSync(defaultKeyPath)) {
    const useDefault = (await confirm({
      message: `Use default key (${defaultKeyPath})?`,
      initialValue: true,
    })) as boolean;

    if (useDefault) {
      privateKeyPath = defaultKeyPath;
    } else {
      privateKeyPath = (await text({
        message: "Path to private key",
        placeholder: "./private.pem",
        validate: (value) => {
          if (!value) return "Path is required";
          if (!existsSync(value)) {
            return `File not found: ${value}`;
          }
        },
      })) as string;
    }
  } else {
    note(
      yellow(
        `No default key found.\n` +
          `Run ${cyan("moltbot skills keygen")} to create one,\n` +
          `or provide path to existing private key.`
      ),
      "No Key"
    );

    privateKeyPath = (await text({
      message: "Path to private key",
      placeholder: "./private.pem",
      validate: (value) => {
        if (!value) return "Path is required";
        if (!existsSync(value)) {
          return `File not found: ${value}`;
        }
      },
    })) as string;
  }

  // Load private key
  const privateKey = await readFile(privateKeyPath, "utf8");

  // Sign skill
  const s = spinner();
  s.start("Signing skill...");

  try {
    const signer = new SkillSigner();
    const signature = await signer.sign(skillPath, privateKey);

    s.stop("Skill signed successfully");

    // Display info
    console.log(`\n✅ Signature created:`);
    console.log(`  Algorithm: ${signature.algorithm}`);
    console.log(`  Signed by: ${dim(signature.signedBy.slice(0, 32))}...`);
    console.log(`  Files: ${signature.files.length}`);
    console.log(`  Saved: ${join(skillPath, "SIGNATURE.json")}`);

    outro(
      green(
        bold(
          "🎉 Skill signed!\n\n" +
            `${dim("Next steps:")}\n` +
            `1. Publish skill with signature file\n` +
            `2. Users can verify: ${cyan("moltbot skills verify ./skill")}`
        )
      )
    );
  } catch (err) {
    s.stop("Failed");
    outro(red(`❌ Error: ${err instanceof Error ? err.message : String(err)}`));
  }
}

// ============================================================================
// Verify Command
// ============================================================================

export async function verifyCommand(skillPath?: string): Promise<void> {
  intro(bold(cyan("🔍 Verify Skill Signature")));

  // Get skill path
  if (!skillPath) {
    skillPath = (await text({
      message: "Path to skill directory",
      placeholder: "./skill",
      validate: (value) => {
        if (!value) return "Path is required";
        if (!existsSync(value)) {
          return `Directory not found: ${value}`;
        }
      },
    })) as string;
  }

  // Load trust store
  const s = spinner();
  s.start("Loading trust store...");

  const store = await getDefaultTrustStore();
  const publicKeys = store.getAllPublicKeys();

  s.stop(`Loaded ${publicKeys.length} trusted developer(s)`);

  // Verify signature
  s.start("Verifying signature...");

  try {
    const signer = new SkillSigner();
    const result = await signer.verify(skillPath, publicKeys);

    s.stop("Verification complete");

    // Display result
    console.log("\n📊 Verification Result:");

    if (result.valid) {
      console.log(`  Status: ${green("✅ VALID")}`);
      console.log(`  Trust Level: ${formatTrustLevel(result.trustLevel)}`);

      if (result.signedBy) {
        const dev = store.getDeveloper(result.signedBy);
        if (dev) {
          console.log(`  Signed by: ${cyan(dev.name)}`);
          if (dev.email) {
            console.log(`  Email: ${dim(dev.email)}`);
          }
        } else {
          console.log(`  Signed by: ${dim(result.signedBy.slice(0, 32))}...`);
        }
      }

      if (result.timestamp) {
        console.log(`  Signed at: ${new Date(result.timestamp).toLocaleString()}`);
      }

      outro(green("✅ Signature is valid and trusted"));
    } else {
      console.log(`  Status: ${red("❌ INVALID")}`);
      console.log(`  Trust Level: ${formatTrustLevel(result.trustLevel)}`);
      console.log(`  Reason: ${result.reason}`);

      if (result.trustLevel === TrustLevel.TAMPERED) {
        outro(
          red(
            bold(
              "🚨 SECURITY WARNING!\n" +
                "This skill has been tampered with!\n" +
                "DO NOT INSTALL OR USE THIS SKILL."
            )
          )
        );
      } else if (result.trustLevel === TrustLevel.UNSIGNED) {
        outro(
          yellow(
            "⚠️  This skill is unsigned.\n" +
              "Only install if you trust the source.\n" +
              `${dim("Install anyway with:")} ${cyan("moltbot skills install --trust-unsigned")}`
          )
        );
      } else {
        outro(red("❌ Verification failed"));
      }
    }
  } catch (err) {
    s.stop("Failed");
    outro(red(`❌ Error: ${err instanceof Error ? err.message : String(err)}`));
  }
}

// ============================================================================
// Helpers
// ============================================================================

function formatTrustLevel(level: TrustLevel): string {
  switch (level) {
    case TrustLevel.OFFICIAL:
      return green("🏅 Official");
    case TrustLevel.VERIFIED:
      return cyan("✅ Verified");
    case TrustLevel.COMMUNITY:
      return yellow("👥 Community");
    case TrustLevel.UNSIGNED:
      return red("❌ Unsigned");
    case TrustLevel.TAMPERED:
      return red("🚨 Tampered");
    default:
      return dim("Unknown");
  }
}
