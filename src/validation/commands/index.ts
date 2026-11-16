import { type Octokit } from '@octokit/rest';

import { deleteCommentByMarker, findCommentByMarker, upsertComment } from '../../github-comments';
import { createOctokit, createStatusOctokit } from '../../github-repo';
import type { GitHubConfig } from '../../types/index';
import { COMMAND_FAILURE_SUMMARY_MARKER, VALIDATION_COMMENT_MARKER } from '../../types/index';
import { requireEnv, resolveLabelWriteToken, safeErrorMessage } from '../../utils';
import { executeJiraValidation } from '../jira-validation/execute';
import { HandledValidationError } from '../pr-path-validation/errors';
import { parseCommand } from './parse-command';
import type { CommandHandlers, CommandOutcome } from './process';
import { processCommands, reportCommandFailure } from './process';

export const main = async (): Promise<void> => {
  const commands = parseCommand(requireEnv('COMMENT_BODY')).filter(
    (command) => command === 'recheck-jira',
  );
  if (commands.length === 0) {
    console.log('No validation commands in comment — exiting successfully.');
    return;
  }

  const config: GitHubConfig = {
    owner: requireEnv('REPO_OWNER'),
    repo: requireEnv('REPO_NAME'),
    statusToken: process.env.STATUS_GITHUB_TOKEN,
    token: resolveLabelWriteToken(),
  };

  const prNumber = parseInt(requireEnv('PR_NUMBER'), 10);
  const prTitle = requireEnv('PR_TITLE');
  const baseBranch = requireEnv('BASE_BRANCH');
  const headSha = process.env.PR_HEAD_SHA;
  const octokit = createOctokit(config);

  const recheckJira = async (): Promise<void> => {
    await executeJiraValidation({ baseBranch, config, headSha, prNumber, prTitle });
  };

  const handlers: CommandHandlers = {
    ['recheck-jira']: recheckJira,
  };

  const outcomes = await processCommands(commands, handlers);

  await handleCommandOutcomes(octokit, config.owner, config.repo, prNumber, outcomes);
};

export const handleCommandOutcomes = async (
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  outcomes: CommandOutcome[],
): Promise<void> => {
  const failures = outcomes.filter(
    (outcome): outcome is Required<CommandOutcome> => outcome.error !== undefined,
  );

  for (const failure of failures) {
    reportCommandFailure(failure);
  }

  if (failures.length === 0) {
    try {
      await deleteCommentByMarker(octokit, owner, repo, prNumber, COMMAND_FAILURE_SUMMARY_MARKER);
    } catch (err) {
      console.warn(`Failed to clean up failure summary comment: ${safeErrorMessage(err)}`);
    }
    return;
  }

  const message = `${failures.length} command(s) failed`;
  const allHandled = failures.every((failure) => failure.error instanceof HandledValidationError);

  if (allHandled) {
    const table = await findCommentByMarker(
      octokit,
      owner,
      repo,
      prNumber,
      VALIDATION_COMMENT_MARKER,
    );
    const reference = table
      ? ` See the [validation results](${table.html_url}) above for details.`
      : '';
    await upsertComment(
      octokit,
      owner,
      repo,
      prNumber,
      COMMAND_FAILURE_SUMMARY_MARKER,
      `:warning: **${message}.**${reference}`,
    );
    throw new HandledValidationError(message);
  }

  throw new Error(message);
};

if (require.main === module) {
  void main().catch((err) => {
    console.error(safeErrorMessage(err));

    for (const command of parseCommand(process.env.COMMENT_BODY ?? '')) {
      reportCommandFailure({ command, error: err });
    }

    process.exit(1);
  });
}