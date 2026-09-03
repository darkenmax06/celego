/**
 * SDD contrato-tarjetas-pistoleo (design D5).
 *
 * Pure trailing-tag peeler for image filenames used both by the digital
 * delivery batch upload (`app/api/status-digitales/route.ts`) and the
 * pending-contract wizard upload. Iteratively strips one trailing tag at a
 * time — `(zr)` (remote), `(C)` (contract image), `(adicional N)` (additional
 * ordinal), or a digit-only `(N)` copy suffix — in ANY order, recording flags
 * as it goes, until no more trailing tags match. `(C)` is non-numeric so it
 * never collides with the digit-only copy suffix.
 */

export type FileTags = {
  base: string;
  isRemote: boolean;
  additionalIndex: number;
  isContract: boolean;
};

export const CONTRACT_TAG_REGEX = /\(\s*c\s*\)\s*$/i;

const REMOTE_TAG_REGEX = /\(\s*zr\s*\)\s*$/i;
const ADDITIONAL_TAG_REGEX = /\(\s*adicional(?:\s+(\d+))?\s*\)\s*$/i;
const COPY_SUFFIX_REGEX = /\(\s*(\d+)\s*\)\s*$/;

function stripExtension(value: string) {
  return value.replace(/\.[^/.]+$/, "").trim();
}

export function peelFileTags(rawFileName: string): FileTags {
  let base = stripExtension(rawFileName);
  let isRemote = false;
  let additionalIndex = 0;
  let isContract = false;

  let changed = true;
  while (changed) {
    changed = false;
    const trimmed = base.trim();

    if (CONTRACT_TAG_REGEX.test(trimmed)) {
      isContract = true;
      base = trimmed.replace(CONTRACT_TAG_REGEX, "").trim();
      changed = true;
      continue;
    }

    if (REMOTE_TAG_REGEX.test(trimmed)) {
      isRemote = true;
      base = trimmed.replace(REMOTE_TAG_REGEX, "").trim();
      changed = true;
      continue;
    }

    const additionalMatch = trimmed.match(ADDITIONAL_TAG_REGEX);
    if (additionalMatch) {
      const parsed = additionalMatch[1] ? Number(additionalMatch[1]) : 1;
      additionalIndex = Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : 1;
      base = trimmed.replace(ADDITIONAL_TAG_REGEX, "").trim();
      changed = true;
      continue;
    }

    const copyMatch = trimmed.match(COPY_SUFFIX_REGEX);
    if (copyMatch) {
      base = trimmed.replace(COPY_SUFFIX_REGEX, "").trim();
      changed = true;
      continue;
    }

    base = trimmed;
  }

  return { base, isRemote, additionalIndex, isContract };
}
