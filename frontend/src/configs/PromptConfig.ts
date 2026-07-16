export interface IPromptTypeConfig {
  promptType: string; // API path segment, e.g. 'ai-invoke'
  label: string;      // Tab label, e.g. 'AI Invoke'
}

export const PROMPT_TYPES: IPromptTypeConfig[] = [
  { promptType: 'ai-invoke', label: 'AI Invoke' },
  { promptType: 'business-classification', label: 'AI Bussiness Classification' },
];
