import type { StoredProductionProfile } from '../domain/beta';

export interface ProfileValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateCustomProfile(profile: any): ProfileValidationResult {
  const errors: string[] = [];

  if (!profile || typeof profile !== 'object') {
    return { valid: false, errors: ['O perfil fornecido é inválido.'] };
  }

  if (!profile.name || typeof profile.name !== 'string' || profile.name.trim().length === 0) {
    errors.push('O nome do perfil é obrigatório.');
  }

  const rules = profile.rules || {};

  if (rules.dimensions) {
    const { targetWidthMm, targetHeightMm } = rules.dimensions;
    if (typeof targetWidthMm === 'number' && targetWidthMm <= 0) {
      errors.push('A largura deve ser um número maior que zero.');
    }
    if (typeof targetHeightMm === 'number' && targetHeightMm <= 0) {
      errors.push('A altura deve ser um número maior que zero.');
    }
  }

  if (rules.dpi) {
    const { recommendedDpi, criticalDpi } = rules.dpi;
    if (typeof recommendedDpi === 'number' && recommendedDpi <= 0) {
      errors.push('O DPI recomendado deve ser maior que zero.');
    }
    if (typeof criticalDpi === 'number' && criticalDpi <= 0) {
      errors.push('O DPI crítico deve ser maior que zero.');
    }
    if (
      typeof recommendedDpi === 'number' &&
      typeof criticalDpi === 'number' &&
      criticalDpi > recommendedDpi
    ) {
      errors.push('O DPI crítico não pode ser maior que o DPI recomendado.');
    }
  }

  if (rules.bleed) {
    const { requiredBleedMm } = rules.bleed;
    if (typeof requiredBleedMm === 'number' && requiredBleedMm < 0) {
      errors.push('A sangria deve ser um valor igual ou maior que zero.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

const STORAGE_KEY = 'artecheck_custom_profiles_v1';

export function getLocalCustomProfiles(): StoredProductionProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalCustomProfile(profile: StoredProductionProfile): void {
  try {
    const current = getLocalCustomProfiles().filter((p) => p.id !== profile.id);
    current.push(profile);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {}
}

export function deleteLocalCustomProfile(id: string): void {
  try {
    const current = getLocalCustomProfiles().filter((p) => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {}
}
