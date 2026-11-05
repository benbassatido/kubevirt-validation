import { buildConfigFromEnv } from './build-config';
import { executeJiraValidation } from './validation/jira-validation/execute';
import { requireEnv, safeErrorMessage } from './utils';
import { HandledValidationError } from './validation/pr-path-validation/errors';

const main = async (): Promise<void> => {
  const config = buildConfigFromEnv();
  const prNumber = parseInt(requireEnv('PR_NUMBER'), 10);
  const prTitle = requireEnv('PR_TITLE');
  const baseBranch = requireEnv('BASE_BRANCH');
  const headSha = process.env.PR_HEAD_SHA;

  await executeJiraValidation({
    baseBranch,
    config,
    headSha,
    prNumber,
    prTitle,
  });
};

void main().catch((err) => {
  if (err instanceof HandledValidationError) {
    console.error(safeErrorMessage(err));
    process.exit(0);
  }
  console.error(safeErrorMessage(err));
  process.exit(1);
});