import type { AiMode } from './types';

const BASE: Record<AiMode, string> = {
  polish:
    'Redraw this rough storyboard sketch as a clean, confident hand-drawn storyboard panel. Keep exactly the same composition, framing, poses, and object placement. Do not add new elements, text, or borders. Plain white background.',
  'to-doodle':
    'Convert this image into a loose hand-drawn storyboard sketch: simple confident pen lines, minimal shading, no photo texture. Keep the same composition and framing. Do not add text or borders. Plain white background.',
};

/** Assembles the prompt sent to providers from the mode, the project style prompt and the user's instruction. */
export function buildPrompt(mode: AiMode, stylePrompt: string, instruction: string, hasReferences: boolean): string {
  const parts = [BASE[mode]];
  if (stylePrompt.trim()) parts.push(`Style of this storyboard: ${stylePrompt.trim()}.`);
  if (hasReferences) parts.push('Match the line quality, shading, and colour treatment of the attached reference panels.');
  if (instruction.trim()) parts.push(instruction.trim());
  return parts.join(' ');
}

export const DEFAULT_STYLE_PROMPT = 'black ink marker sketch, loose confident lines, light grey shading, no colour';
