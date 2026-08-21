import assert from 'node:assert/strict';
import { runDeterministicRuleEngine } from '../src/utils/ruleEngine';
import { COMMERCIAL_PRINT_300DPI_PROFILE, LARGE_FORMAT_BANNER_PROFILE } from '../src/utils/productionProfiles';
import type { PdfDocumentStructure } from '../src/types';

console.log('ARTECHECK AI — SUÍTE DE TESTES: PREFLIGHT DETERMINÍSTICO');

const sampleDoc: PdfDocumentStructure = {
  pageCount: 1,
  pages: [
    {
      page: 1,
      widthPt: 595.28,
      heightPt: 841.89,
      widthMm: 210,
      heightMm: 297,
      visualWidthMm: 210,
      visualHeightMm: 297,
      orientation: 'portrait',
      rotation: 0,
      mediaBox: {
        status: 'explicit',
        xPt: 0,
        yPt: 0,
        widthPt: 612.28,
        heightPt: 858.89,
        xMm: 0,
        yMm: 0,
        widthMm: 216,
        heightMm: 303,
      },
      trimBox: {
        status: 'explicit',
        xPt: 8.5,
        yPt: 8.5,
        widthPt: 595.28,
        heightPt: 841.89,
        xMm: 3.0,
        yMm: 3.0,
        widthMm: 210,
        heightMm: 297,
      },
      bleedBox: {
        status: 'explicit',
        xPt: 0,
        yPt: 0,
        widthPt: 612.28,
        heightPt: 858.89,
        xMm: 0,
        yMm: 0,
        widthMm: 216,
        heightMm: 303,
      },
      hasTransparency: false,
      imageOccurrences: [
        {
          id: 'img1',
          page: 1,
          widthPx: 2480,
          heightPx: 3508,
          displayWidthMm: 210,
          displayHeightMm: 297,
          effectiveDpiX: 300,
          effectiveDpiY: 300,
          colorSpace: 'DeviceCMYK',
        },
      ],
      colorOccurrences: [
        { page: 1, family: 'DeviceCMYK', count: 1 },
      ],
    },
  ],
  fonts: [
    {
      id: 'Helvetica-Bold',
      baseFont: 'Helvetica-Bold',
      cleanFontName: 'Helvetica-Bold',
      subtype: 'Type1',
      isEmbedded: 'yes',
      isUsedInContent: true,
      usedPages: [1],
    },
  ],
  colorSummary: {
    hasRgb: false,
    hasCmyk: true,
    hasSpotColors: false,
    familiesDetected: ['DeviceCMYK'],
  },
  pdfxInfo: {
    isDeclaredPdfX: true,
    declaredVersion: 'PDF/X-1a:2001',
    recognizedStandard: 'PDF/X-1a:2001',
  },
};

const result = runDeterministicRuleEngine(sampleDoc, COMMERCIAL_PRINT_300DPI_PROFILE);
assert.equal(result.totalRules, 9);
assert.equal(result.errorCount, 0);
assert.equal(result.scoreSummary.classification, 'approved');
console.log('✓ TEST 1: Pré-impressão comercial CMYK aprovada');

const bannerDoc: PdfDocumentStructure = {
  ...sampleDoc,
  pages: [
    {
      ...sampleDoc.pages[0],
      imageOccurrences: [
        {
          id: 'img_low',
          page: 1,
          widthPx: 50,
          heightPx: 50,
          displayWidthMm: 1000,
          displayHeightMm: 1000,
          effectiveDpiX: 3.63,
          effectiveDpiY: 3.63,
        },
      ],
    },
  ],
};

const bannerResult = runDeterministicRuleEngine(bannerDoc, LARGE_FORMAT_BANNER_PROFILE);
const dpiRule = bannerResult.profileRules.find((r) => r.ruleId === 'RULE-PROF-DPI-001');
assert.equal(dpiRule?.status, 'error');
console.log('✓ TEST 2: Detecção de imagem em baixa resolução (< 72 DPI) no banner');
console.log('Pré-impressão: Testes concluídos com sucesso!');
