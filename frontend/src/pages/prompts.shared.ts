export interface ActivePrompt {
  id: number;
  promptType: string;
  version: number;
  prompt: string;
  encoding: string;
  active: boolean;
  createdBy: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface PromptDef {
  type: string;
  label: string;
}

export const PROMPTS: PromptDef[] = [
  { type: 'ai-invoke', label: 'Registration' },
  { type: 'business-classification', label: 'Business Classification' },
];

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}
