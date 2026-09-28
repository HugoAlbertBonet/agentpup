export const petScaleMinimum = 0.35;
export const petScaleMaximum = 1;
export const statusScaleMinimum = 0.75;
export const statusScaleMaximum = 1.5;
export const statusFontSizeMinimum = 10;
export const statusFontSizeMaximum = 20;
export const statusLineGapMinimum = 2;
export const statusLineGapMaximum = 18;

export interface PetPreferences {
  readonly petEnabled: boolean;
  readonly petScale: number;
  readonly animationsEnabled: boolean;
  readonly statusScale: number;
  readonly statusFontSize: number;
  readonly statusLineGap: number;
}

export const defaultPetPreferences: PetPreferences = {
  petEnabled: true,
  petScale: 0.67,
  animationsEnabled: true,
  statusScale: 1,
  statusFontSize: 13,
  statusLineGap: 9
};

export type PetPreferencesPatch = Partial<PetPreferences>;

export function normalizePetPreferences(value: unknown): PetPreferences {
  const record = isRecord(value) ? value : {};
  return {
    petEnabled:
      typeof record.petEnabled === "boolean"
        ? record.petEnabled
        : defaultPetPreferences.petEnabled,
    petScale: isPetScale(record.petScale)
      ? record.petScale
      : defaultPetPreferences.petScale,
    animationsEnabled:
      typeof record.animationsEnabled === "boolean"
        ? record.animationsEnabled
        : defaultPetPreferences.animationsEnabled,
    statusScale: isStatusScale(record.statusScale)
      ? record.statusScale
      : defaultPetPreferences.statusScale,
    statusFontSize: isStatusFontSize(record.statusFontSize)
      ? record.statusFontSize
      : defaultPetPreferences.statusFontSize,
    statusLineGap: isStatusLineGap(record.statusLineGap)
      ? record.statusLineGap
      : defaultPetPreferences.statusLineGap
  };
}

export function validatePetPreferencesPatch(value: unknown): PetPreferencesPatch {
  if (!isRecord(value)) throw new Error("Pet preference update must be an object.");
  const allowed = new Set([
    "petEnabled",
    "petScale",
    "animationsEnabled",
    "statusScale",
    "statusFontSize",
    "statusLineGap"
  ]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`Unexpected pet preference: ${key}`);
  }
  const patch: {
    petEnabled?: boolean;
    petScale?: number;
    animationsEnabled?: boolean;
    statusScale?: number;
    statusFontSize?: number;
    statusLineGap?: number;
  } = {};
  if (Object.hasOwn(value, "petEnabled")) {
    if (typeof value.petEnabled !== "boolean") throw new Error("Pet enabled setting is invalid.");
    patch.petEnabled = value.petEnabled;
  }
  if (Object.hasOwn(value, "petScale")) {
    if (!isPetScale(value.petScale)) {
      throw new Error(`Pet scale must be between ${petScaleMinimum} and ${petScaleMaximum}.`);
    }
    patch.petScale = value.petScale;
  }
  if (Object.hasOwn(value, "animationsEnabled")) {
    if (typeof value.animationsEnabled !== "boolean") {
      throw new Error("Pet animations setting is invalid.");
    }
    patch.animationsEnabled = value.animationsEnabled;
  }
  if (Object.hasOwn(value, "statusScale")) {
    if (!isStatusScale(value.statusScale)) {
      throw new Error(
        `Status bar size must be between ${statusScaleMinimum} and ${statusScaleMaximum}.`
      );
    }
    patch.statusScale = value.statusScale;
  }
  if (Object.hasOwn(value, "statusFontSize")) {
    if (!isStatusFontSize(value.statusFontSize)) {
      throw new Error(
        `Status font size must be a whole number between ${statusFontSizeMinimum} and ${statusFontSizeMaximum}.`
      );
    }
    patch.statusFontSize = value.statusFontSize;
  }
  if (Object.hasOwn(value, "statusLineGap")) {
    if (!isStatusLineGap(value.statusLineGap)) {
      throw new Error(
        `Status line spacing must be a whole number between ${statusLineGapMinimum} and ${statusLineGapMaximum}.`
      );
    }
    patch.statusLineGap = value.statusLineGap;
  }
  return patch;
}

function isPetScale(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= petScaleMinimum &&
    value <= petScaleMaximum
  );
}

function isStatusScale(value: unknown): value is number {
  return isNumberInRange(value, statusScaleMinimum, statusScaleMaximum);
}

function isStatusFontSize(value: unknown): value is number {
  return (
    isNumberInRange(value, statusFontSizeMinimum, statusFontSizeMaximum) &&
    Number.isInteger(value)
  );
}

function isStatusLineGap(value: unknown): value is number {
  return (
    isNumberInRange(value, statusLineGapMinimum, statusLineGapMaximum) &&
    Number.isInteger(value)
  );
}

function isNumberInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
