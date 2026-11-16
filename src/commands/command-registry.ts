// src/commands/command-registry.ts
import type { Octokit } from '@octokit/rest';

import { executeClone } from './clone-handler';
import { executeValidationCommand } from './validation-handler';

export type CommandContext = {
  author: string;
  commentBody: string;
  commentId: number;
  octokit: Octokit;
  owner: string;
  prNumber: number;
  repo: string;
};

export type CommandConfig = {
  execute: (ctx: CommandContext) => Promise<unknown>;
  name: string;
  pattern: RegExp;
  requiresTrust: boolean;
};

/** Scoped registry: /clone and validation slash commands (same patterns as kubevirt-plugin). */
export const COMMANDS: CommandConfig[] = [
  {
    execute: executeClone,
    name: 'clone',
    pattern: /^\/clone\s+/m,
    requiresTrust: false,
  },
  {
    execute: executeValidationCommand,
    name: 'validation',
    pattern: /(^|\s)\/(lgtm|approve|hold|recheck-jira|ai-approved|ci-approved|i18n-approved)(\s|$)/,
    requiresTrust: false,
  },
];