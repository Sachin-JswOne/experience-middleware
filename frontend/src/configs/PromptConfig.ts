export interface IPromptTypeConfig {
  promptType: string; // API path segment, e.g. 'ai-invoke'
  label: string; // Tab label, e.g. 'AI Invoke'
  feature: string; // Feature group, e.g. 'Industry Segmentation'
}

export const PROMPT_TYPES: IPromptTypeConfig[] = [
  { promptType: 'ai-invoke', label: 'Registration', feature: 'Industry Segmentation' },
  { promptType: 'business-classification', label: 'Business Classification', feature: 'Industry Segmentation' },
];
