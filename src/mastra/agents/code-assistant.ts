import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { Workspace, LocalFilesystem, LocalSandbox } from '@mastra/core/workspace';
import { codeReviewAgent } from './code-review-agent';
import { codingAgent } from './coding-agent';
import { codeResearchAgent } from './code-research-agent';
import { codePlanningAgent } from './code-planning-agent';

const workspace = new Workspace({
  filesystem: new LocalFilesystem({ basePath: './workspace' }),
  sandbox: new LocalSandbox({ workingDirectory: './workspace' }),
});

export const codeAssistant = new Agent({
  id: 'code-assistant',
  name: 'CodeAssistant',
  model: 'openai/gpt-4o',
  instructions: `You are a code assistant that orchestrates a team of specialist agents to handle software engineering tasks.

Your team:
- **CodeResearchAgent**: Explores and analyzes codebases. Use this first to understand the project before making changes.
- **CodePlanningAgent**: Designs implementation plans. Use this after research to create a concrete approach.
- **CodingAgent**: Writes code. Use this to implement the plan.
- **CodeReviewAgent**: Reviews code for quality, type safety, and best practices. Use this after code is written.

For most tasks, follow this workflow:
1. Research — understand the codebase and requirements
2. Plan — design the approach
3. Code — implement the changes
4. Review — verify quality

For simple tasks you can skip steps. For pure questions, research alone may suffice. Use your judgment on which agents to involve and in what order.

You can also use workspace tools directly to read files or run commands when you need quick context without delegating to an agent.`,
  agents: { codeReviewAgent, codingAgent, codeResearchAgent, codePlanningAgent },
  memory: new Memory(),
  workspace,
});
