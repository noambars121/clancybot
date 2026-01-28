import chalk from "chalk";
import { confirm } from "@clack/prompts";

export interface PairingContext {
  channelId: string;
  userId: string;
  username?: string;
  pairingCode: string;
}

export async function requirePairingAcknowledgment(
  context: PairingContext
): Promise<boolean> {
  console.log('');
  console.log(chalk.yellow('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(chalk.yellow('⚠️  SECURITY WARNING: Pairing Request'));
  console.log(chalk.yellow('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log('');
  console.log('You are about to approve a new user to access your bot.');
  console.log('');
  console.log(chalk.bold('Channel:'), context.channelId);
  console.log(chalk.bold('User ID:'), context.userId);
  if (context.username) {
    console.log(chalk.bold('Username:'), context.username);
  }
  console.log(chalk.bold('Pairing Code:'), context.pairingCode);
  console.log('');
  console.log(chalk.red('⚠️  This user will be able to:'));
  console.log('  • Execute commands on your system');
  console.log('  • Access files in agent workspace');
  console.log('  • View bot responses and data');
  console.log('  • Invoke tools and integrations');
  console.log('');
  console.log(chalk.yellow('Only approve users you trust completely.'));
  console.log('');

  const confirmed = await confirm({
    message: 'Do you trust this user and want to grant access?',
    initialValue: false,
  });

  if (confirmed) {
    console.log('');
    console.log(chalk.green('✓ User approved and added to allowlist'));
    console.log('');
    console.log(chalk.dim('Tip: Review approved users with:'));
    console.log(chalk.dim('  moltbot pairing list'));
    console.log('');
  } else {
    console.log('');
    console.log(chalk.red('✗ Pairing request rejected'));
    console.log('');
  }

  return confirmed === true;
}

export async function requirePairingAcknowledgmentSimple(
  channelId: string,
  userId: string
): Promise<boolean> {
  return requirePairingAcknowledgment({
    channelId,
    userId,
    pairingCode: 'N/A',
  });
}
