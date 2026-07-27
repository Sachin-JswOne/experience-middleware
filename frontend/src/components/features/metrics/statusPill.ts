import { tokens } from '@/styles/theme';

/**
 * Bordered lozenge status pill per DESIGN.md (bg-subtler + border + bolder
 * text). Shared by the samples drawer and the SLO card so the two never drift.
 */
export type PillTone = 'success' | 'danger' | 'warning' | 'neutral';

export const PILL_STYLES: Record<PillTone, { bg: string; border: string; text: string }> = {
  success: {
    bg: tokens.pillSuccessBg,
    border: tokens.pillSuccessBorder,
    text: tokens.pillSuccessText,
  },
  danger: { bg: tokens.pillDangerBg, border: tokens.pillDangerBorder, text: tokens.pillDangerText },
  warning: {
    bg: tokens.pillWarningBg,
    border: tokens.pillWarningBorder,
    text: tokens.pillWarningText,
  },
  neutral: {
    bg: tokens.pillNeutralBg,
    border: tokens.pillNeutralBorder,
    text: tokens.pillNeutralText,
  },
};

export const pillSx = (tone: PillTone, height = 20) => ({
  height,
  fontSize: 12,
  fontWeight: tokens.weightBold,
  color: PILL_STYLES[tone].text,
  bgcolor: PILL_STYLES[tone].bg,
  border: `1px solid ${PILL_STYLES[tone].border}`,
});

/** HTTP status code → pill tone, the rule every status chip uses. */
export const toneForStatus = (statusCode: number): PillTone =>
  statusCode >= 500 ? 'danger' : statusCode >= 400 ? 'warning' : 'success';
