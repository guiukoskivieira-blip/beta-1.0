export interface ProductionProfile {
  id: string;
  name: string;
  category: 'commercial_print' | 'large_format' | 'packaging' | 'digital' | 'custom' | 'reference';
  description: string;
  expectedWidthMm?: number;
  expectedHeightMm?: number;
  expectedBleedMm?: number;
  minEffectiveDpi: number;
  warningDpiThreshold: number;
  rgbPolicy: 'error' | 'warning' | 'allowed';
  recommendsPdfX?: boolean;
}

export const COMMERCIAL_PRINT_300DPI_PROFILE: ProductionProfile = {
  id: 'commercial_print_300dpi',
  name: 'Impressão Comercial Offset / Digital (300 DPI)',
  category: 'commercial_print',
  description: 'Padrão industrial para folhetos, catálogos, revistas e cartões com alta exigência de nitidez.',
  minEffectiveDpi: 300,
  warningDpiThreshold: 200,
  expectedBleedMm: 3.0,
  rgbPolicy: 'error',
  recommendsPdfX: true,
};

export const A4_COMMERCIAL_FLYER_PROFILE: ProductionProfile = {
  id: 'commercial_flyer_a4',
  name: 'Folheto Comercial A4 (210 × 297 mm)',
  category: 'commercial_print',
  description: 'Folhetos e lâminas comerciais padrão A4 com corte e sangria de 3 mm.',
  expectedWidthMm: 210,
  expectedHeightMm: 297,
  expectedBleedMm: 3.0,
  minEffectiveDpi: 300,
  warningDpiThreshold: 200,
  rgbPolicy: 'error',
  recommendsPdfX: true,
};

export const LARGE_FORMAT_BANNER_PROFILE: ProductionProfile = {
  id: 'large_format_banner',
  name: 'Comunicação Visual — Lona / Banner (100 DPI)',
  category: 'large_format',
  description: 'Impressão de grande formato para visualização a média/longa distância.',
  minEffectiveDpi: 100,
  warningDpiThreshold: 72,
  expectedBleedMm: 0,
  rgbPolicy: 'warning',
  recommendsPdfX: false,
};

export const STANDARD_PROFILES: ProductionProfile[] = [
  COMMERCIAL_PRINT_300DPI_PROFILE,
  A4_COMMERCIAL_FLYER_PROFILE,
  LARGE_FORMAT_BANNER_PROFILE,
];
