import { Memory } from '@mastra/memory';

export const codeMemory = new Memory({
  options: {
    observationalMemory: {
      model: 'openai/gpt-4o-mini',
      scope: 'resource',
      observation: {
        messageTokens: 500,
      },
    },
  },
});
