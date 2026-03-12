// ============================================
// slashCommands.ts
// Slash command parser for the Everest chat interface.
// Detects /dump /feature /schedule /erins prefixes,
// strips them from the message content, and returns
// the matching category + per-category context string
// to inject into the system prompt.
// ============================================

export type SlashCategory = 'general' | 'dump' | 'feature' | 'schedule' | 'erins';

export interface ParsedMessage {
  category: SlashCategory;
  cleanContent: string;
  hasSlashCommand: boolean;
}

const SLASH_MAP: Record<string, SlashCategory> = {
  '/dump':     'dump',
  '/feature':  'feature',
  '/schedule': 'schedule',
  '/erins':    'erins',
};

export function parseSlashCommand(input: string): ParsedMessage {
  const trimmed = input.trim();
  for (const [command, category] of Object.entries(SLASH_MAP)) {
    if (trimmed.toLowerCase().startsWith(command)) {
      const cleanContent = trimmed.slice(command.length).trim();
      return {
        category,
        cleanContent: cleanContent || trimmed,
        hasSlashCommand: true,
      };
    }
  }
  return { category: 'general', cleanContent: trimmed, hasSlashCommand: false };
}

export const CATEGORY_CONTEXT: Record<SlashCategory, string> = {
  general: '',
  dump:
    'The user is doing a brain dump. Acknowledge it, ask clarifying questions if needed, and confirm it has been captured for the Analyst to process.',
  feature:
    'The user is logging a feature request. Acknowledge the request, restate it clearly, and confirm it will be added to the development pipeline.',
  schedule:
    'The user wants to schedule something. Use your calendar tools to create the event immediately. Confirm what was created.',
  erins:
    'This is an urgent item flagged for Erin. Acknowledge it clearly and flag it as high priority.',
};
