import { PDFDocument, PDFName, PDFDict, PDFArray, PDFNumber, PDFStream, PDFRawStream } from 'pdf-lib';
import pako from 'pako';
import type {
  PdfDocumentStructure,
  PdfPageStructure,
  PdfFontItem,
  PdfImageOccurrence,
  PdfColorOccurrence,
  PdfBoxInfo,
} from '../src/types';

export class DiagnosticTracker {
  private stages: Record<string, { start: number; end?: number; durationMs: number; metadata?: any }> = {};
  public label: string;

  constructor(label = 'Tracker') {
    this.label = label;
  }

  startStage(name: string, metadata?: any): number {
    const now = performance.now();
    this.stages[name] = { start: now, durationMs: 0, metadata };
    return now;
  }

  endStage(name: string, metadata?: any) {
    if (this.stages[name]) {
      this.stages[name].end = performance.now();
      this.stages[name].durationMs = Number(
        (this.stages[name].end! - this.stages[name].start).toFixed(2)
      );
      if (metadata) {
        this.stages[name].metadata = { ...(this.stages[name].metadata || {}), ...metadata };
      }
    }
  }

  markInstant(name: string, metadata?: any) {
    this.stages[name] = { start: performance.now(), durationMs: 0, metadata };
  }

  getStagesSummary() {
    const summary: Record<string, any> = {};
    for (const [key, val] of Object.entries(this.stages)) {
      summary[key] = { durationMs: val.durationMs, ...val.metadata };
    }
    return summary;
  }

  getMetrics() {
    return this.stages;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

export function inspectPayload(obj: any): {
  totalSizeBytes: number;
  formattedSize: string;
  largeFields: Array<{ path: string; length: number }>;
  hasRawBuffers: boolean;
} {
  try {
    const json = JSON.stringify(obj);
    const totalSizeBytes = Buffer.byteLength(json, 'utf8');
    const largeFields: Array<{ path: string; length: number }> = [];

    const checkLarge = (val: any, currentPath = '') => {
      if (!val) return;
      if (typeof val === 'string' && val.length > 10000) {
        largeFields.push({ path: currentPath, length: val.length });
      } else if (typeof val === 'object' && !Array.isArray(val)) {
        for (const [k, v] of Object.entries(val)) {
          checkLarge(v, currentPath ? `${currentPath}.${k}` : k);
        }
      }
    };

    checkLarge(obj);

    return {
      totalSizeBytes,
      formattedSize: formatBytes(totalSizeBytes),
      largeFields,
      hasRawBuffers: false,
    };
  } catch {
    return {
      totalSizeBytes: 0,
      formattedSize: '0 B',
      largeFields: [],
      hasRawBuffers: false,
    };
  }
}

const PT_TO_MM = 25.4 / 72.0;

function parseBox(boxArray: any): PdfBoxInfo | undefined {
  if (!boxArray || !Array.isArray(boxArray) || boxArray.length < 4) return undefined;
  const x1 = typeof boxArray[0] === 'number' ? boxArray[0] : 0;
  const y1 = typeof boxArray[1] === 'number' ? boxArray[1] : 0;
  const x2 = typeof boxArray[2] === 'number' ? boxArray[2] : 0;
  const y2 = typeof boxArray[3] === 'number' ? boxArray[3] : 0;

  const xPt = Math.min(x1, x2);
  const yPt = Math.min(y1, y2);
  const widthPt = Math.abs(x2 - x1);
  const heightPt = Math.abs(y2 - y1);

  return {
    status: 'explicit',
    xPt,
    yPt,
    widthPt,
    heightPt,
    xMm: Number((xPt * PT_TO_MM).toFixed(2)),
    yMm: Number((yPt * PT_TO_MM).toFixed(2)),
    widthMm: Number((widthPt * PT_TO_MM).toFixed(2)),
    heightMm: Number((heightPt * PT_TO_MM).toFixed(2)),
  };
}

export async function extractPdfStructure(pdfBuffer: Buffer): Promise<PdfDocumentStructure> {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true, updateMetadata: false });
  const pageCount = pdfDoc.getPageCount();
  const pages: PdfPageStructure[] = [];
  const fontsMap = new Map<string, PdfFontItem>();
  const detectedFamilies = new Set<string>();

  let hasGlobalRgb = false;
  let hasGlobalCmyk = false;
  let hasGlobalSpot = false;

  for (let i = 0; i < pageCount; i++) {
    const pageNum = i + 1;
    const page = pdfDoc.getPage(i);
    const { width: widthPt, height: heightPt } = page.getSize();
    const rotation = page.getRotation().angle || 0;

    const widthMm = Number((widthPt * PT_TO_MM).toFixed(2));
    const heightMm = Number((heightPt * PT_TO_MM).toFixed(2));

    const isLandscape = (rotation === 90 || rotation === 270) ? heightMm > widthMm : widthMm > heightMm;
    const isSquare = Math.abs(widthMm - heightMm) < 1.0;
    const orientation = isSquare ? 'square' : isLandscape ? 'landscape' : 'portrait';

    const visualWidthMm = (rotation === 90 || rotation === 270) ? heightMm : widthMm;
    const visualHeightMm = (rotation === 90 || rotation === 270) ? widthMm : heightMm;

    const mediaBoxRaw = page.node.MediaBox()?.asArray()?.map((v: any) => (v instanceof PDFNumber ? v.asNumber() : Number(v)));
    const trimBoxRaw = page.node.TrimBox()?.asArray()?.map((v: any) => (v instanceof PDFNumber ? v.asNumber() : Number(v)));
    const bleedBoxRaw = page.node.BleedBox()?.asArray()?.map((v: any) => (v instanceof PDFNumber ? v.asNumber() : Number(v)));
    const cropBoxRaw = page.node.CropBox()?.asArray()?.map((v: any) => (v instanceof PDFNumber ? v.asNumber() : Number(v)));

    const mediaBox: PdfBoxInfo = parseBox(mediaBoxRaw) || {
      status: 'fallback',
      xPt: 0,
      yPt: 0,
      widthPt,
      heightPt,
      xMm: 0,
      yMm: 0,
      widthMm,
      heightMm,
    };

    const trimBox: PdfBoxInfo | undefined = trimBoxRaw ? parseBox(trimBoxRaw) : undefined;
    const bleedBox: PdfBoxInfo | undefined = bleedBoxRaw ? parseBox(bleedBoxRaw) : undefined;
    const cropBox: PdfBoxInfo | undefined = cropBoxRaw ? parseBox(cropBoxRaw) : undefined;

    const imageOccurrences: PdfImageOccurrence[] = [];
    const colorOccurrences: PdfColorOccurrence[] = [];

    // Extract resources
    const resources = page.node.Resources();
    let hasTransparency = false;

    if (resources instanceof PDFDict) {
      // Check XObjects (Images)
      const xObjects = resources.get(PDFName.of('XObject'));
      if (xObjects instanceof PDFDict) {
        const entries = xObjects.entries();
        for (const [nameKey, ref] of entries) {
          const xobj = pdfDoc.context.lookup(ref);
          if (xobj instanceof PDFStream || xobj instanceof PDFRawStream || (xobj as any)?.dict) {
            const dict = (xobj as any).dict || xobj;
            const subtype = dict.get(PDFName.of('Subtype'));
            if (subtype?.toString() === '/Image') {
              const widthPx = dict.get(PDFName.of('Width'))?.asNumber?.() || 100;
              const heightPx = dict.get(PDFName.of('Height'))?.asNumber?.() || 100;
              const colorSpace = dict.get(PDFName.of('ColorSpace'))?.toString() || 'DeviceRGB';

              if (colorSpace.includes('RGB')) {
                hasGlobalRgb = true;
                detectedFamilies.add('DeviceRGB');
              } else if (colorSpace.includes('CMYK')) {
                hasGlobalCmyk = true;
                detectedFamilies.add('DeviceCMYK');
              }

              // Calculate display size and DPI
              const displayWidthMm = widthMm;
              const displayHeightMm = heightMm;
              const effectiveDpiX = Number(((widthPx / (widthPt / 72.0))).toFixed(1));
              const effectiveDpiY = Number(((heightPx / (heightPt / 72.0))).toFixed(1));

              const rawName = typeof nameKey.asString === 'function' ? nameKey.asString() : (nameKey.value || String(nameKey));
              const imgName = typeof rawName === 'string' ? rawName : String(rawName);

              imageOccurrences.push({
                id: imgName || `img_${pageNum}_${imageOccurrences.length + 1}`,
                page: pageNum,
                name: imgName,
                widthPx,
                heightPx,
                displayWidthMm,
                displayHeightMm,
                effectiveDpiX: effectiveDpiX > 0 ? effectiveDpiX : 300,
                effectiveDpiY: effectiveDpiY > 0 ? effectiveDpiY : 300,
                colorSpace,
              });
            }
          }
        }
      }

      // Check ExtGState for Transparency
      const extGState = resources.get(PDFName.of('ExtGState'));
      if (extGState instanceof PDFDict) {
        const gsEntries = extGState.entries();
        for (const [, gsRef] of gsEntries) {
          const gs = pdfDoc.context.lookup(gsRef);
          if (gs instanceof PDFDict) {
            const caObj = gs.get(PDFName.of('ca'));
            const CAObj = gs.get(PDFName.of('CA'));
            const ca = caObj instanceof PDFNumber ? caObj.asNumber() : undefined;
            const CA = CAObj instanceof PDFNumber ? CAObj.asNumber() : undefined;
            const bm = gs.get(PDFName.of('BM'))?.toString();
            if ((ca !== undefined && ca < 1) || (CA !== undefined && CA < 1) || (bm && bm !== '/Normal' && bm !== '/Compatible')) {
              hasTransparency = true;
            }
          }
        }
      }

      // Check Fonts
      const fontsDict = resources.get(PDFName.of('Font'));
      if (fontsDict instanceof PDFDict) {
        const fEntries = fontsDict.entries();
        for (const [fName, fRef] of fEntries) {
          const fontObj = pdfDoc.context.lookup(fRef);
          if (fontObj instanceof PDFDict) {
            const rawFName = typeof fName.asString === 'function' ? fName.asString() : (fName.value || String(fName));
            const fontBaseVal = fontObj.get(PDFName.of('BaseFont'));
            const baseFontStr = (fontBaseVal ? String(fontBaseVal) : String(rawFName)).replace(/^\//, '');
            const baseFont: string = baseFontStr;
            const subtype = fontObj.get(PDFName.of('Subtype'))?.toString()?.replace(/^\//, '') || 'Type1';
            const fontDescriptor = fontObj.get(PDFName.of('FontDescriptor'));
            let isEmbedded: 'yes' | 'no' | 'subset' | 'undetermined' = 'no';

            if (fontDescriptor) {
              const fd = pdfDoc.context.lookup(fontDescriptor);
              if (fd instanceof PDFDict) {
                const hasFontFile = fd.get(PDFName.of('FontFile')) || fd.get(PDFName.of('FontFile2')) || fd.get(PDFName.of('FontFile3'));
                if (hasFontFile) {
                  isEmbedded = baseFont.includes('+') ? 'subset' : 'yes';
                }
              }
            } else if (subtype === 'Type3') {
              isEmbedded = 'yes';
            }

            if (!fontsMap.has(baseFont)) {
              fontsMap.set(baseFont, {
                id: baseFont,
                baseFont,
                cleanFontName: baseFont.replace(/^[A-Z]{6}\+/, ''),
                subtype,
                isEmbedded,
                isUsedInContent: true,
                usedPages: [pageNum],
              });
            } else {
              const existing = fontsMap.get(baseFont)!;
              if (!existing.usedPages?.includes(pageNum)) {
                existing.usedPages?.push(pageNum);
              }
            }
          }
        }
      }
    }

    // Default color occurrence
    if (imageOccurrences.some(i => i.colorSpace?.includes('RGB'))) {
      colorOccurrences.push({ page: pageNum, family: 'DeviceRGB', count: 1 });
    } else {
      colorOccurrences.push({ page: pageNum, family: 'DeviceCMYK', count: 1 });
      hasGlobalCmyk = true;
      detectedFamilies.add('DeviceCMYK');
    }

    pages.push({
      page: pageNum,
      widthPt,
      heightPt,
      widthMm,
      heightMm,
      visualWidthMm,
      visualHeightMm,
      orientation,
      rotation,
      mediaBox,
      trimBox,
      bleedBox,
      cropBox,
      hasTransparency,
      imageOccurrences,
      colorOccurrences,
    });
  }

  // Parse Metadata & PDF/X
  const title = pdfDoc.getTitle();
  const author = pdfDoc.getAuthor();
  const creator = pdfDoc.getCreator();
  const producer = pdfDoc.getProducer();
  const creationDate = pdfDoc.getCreationDate()?.toISOString();
  const modDate = pdfDoc.getModificationDate()?.toISOString();

  // Check PDF/X in root catalog / info dict
  let isDeclaredPdfX = false;
  let declaredVersion: string | undefined;

  const catalog = pdfDoc.catalog;
  const infoDict = pdfDoc.context.lookup(pdfDoc.context.trailerInfo.Info);
  if (infoDict instanceof PDFDict) {
    const gtsVersion = infoDict.get(PDFName.of('GTS_PDFXVersion'))?.toString();
    const gtsConformance = infoDict.get(PDFName.of('GTS_PDFXConformance'))?.toString();
    if (gtsVersion || gtsConformance) {
      isDeclaredPdfX = true;
      declaredVersion = (gtsVersion || gtsConformance || '').replace(/[\/()]/g, '');
    }
  }

  return {
    pageCount,
    pages,
    fonts: Array.from(fontsMap.values()),
    colorSummary: {
      hasRgb: hasGlobalRgb,
      hasCmyk: hasGlobalCmyk || !hasGlobalRgb,
      hasSpotColors: hasGlobalSpot,
      familiesDetected: Array.from(detectedFamilies),
    },
    pdfxInfo: {
      isDeclaredPdfX,
      declaredVersion,
      recognizedStandard: declaredVersion || (isDeclaredPdfX ? 'PDF/X' : undefined),
    },
    metadata: {
      title,
      author,
      creator,
      producer,
      creationDate,
      modDate,
    },
  };
}
