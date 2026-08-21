import { PDFDocument, PDFName, PDFDict, PDFArray, PDFNumber, PDFStream, PDFRawStream } from 'pdf-lib';
import * as pako from 'pako';
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

function decodeStream(stream: any): Uint8Array | null {
  if (stream instanceof PDFRawStream) {
    const dict = stream.dict;
    const filter = dict.get(PDFName.of('Filter'));
    const filterStr = filter?.toString() || '';
    const rawBytes = stream.contents;
    if (!rawBytes || rawBytes.length === 0) return null;
    if (filterStr.includes('FlateDecode') || filterStr === '/FlateDecode') {
      try { return pako.inflate(rawBytes); } catch { return null; }
    }
    return rawBytes;
  }
  if (stream instanceof PDFStream) {
    const filter = stream.dict.get(PDFName.of('Filter'));
    const filterStr = filter?.toString() || '';
    const rawBytes = stream.getContents();
    if (!rawBytes || rawBytes.length === 0) return null;
    if (filterStr.includes('FlateDecode') || filterStr === '/FlateDecode') {
      try { return pako.inflate(rawBytes); } catch { return null; }
    }
    return rawBytes;
  }
  return null;
}

interface ImagePlacement {
  name: string;
  xPt: number;
  yPt: number;
  appliedWidthPt: number;
  appliedHeightPt: number;
  ctm: number[];
}

function parseImagePlacements(contentBytes: Uint8Array): Map<string, ImagePlacement> {
  const placements = new Map<string, ImagePlacement>();
  const text = Buffer.from(contentBytes).toString('latin1');
  const tokens: string[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '/' || ch === '(') {
      if (ch === '/') {
        let name = '/';
        i++;
        while (i < text.length && /[A-Za-z0-9_+\-.]/.test(text[i])) { name += text[i]; i++; }
        tokens.push(name);
      } else {
        let str = '(';
        i++;
        let depth = 1;
        while (i < text.length && depth > 0) {
          if (text[i] === '\\') { str += text[i] + (text[i+1] || ''); i += 2; }
          else { if (text[i] === '(') depth++; if (text[i] === ')') depth--; str += text[i]; i++; }
        }
        tokens.push(str);
      }
    } else if (ch === '[') {
      let arr = '[';
      i++;
      while (i < text.length && text[i] !== ']') { arr += text[i]; i++; }
      arr += ']';
      tokens.push(arr); i++;
    } else if (/\s/.test(ch)) {
      i++;
    } else if (/[\d.\-+]/.test(ch)) {
      let num = '';
      while (i < text.length && /[\d.\-+eE]/.test(text[i])) { num += text[i]; i++; }
      if (num && !/[a-zA-Z]/.test(num)) tokens.push(num);
    } else if (/[A-Za-z'"<>{}]/.test(ch)) {
      let op = '';
      while (i < text.length && /[A-Za-z'"<>{}]/.test(text[i])) { op += text[i]; i++; }
      tokens.push(op);
    } else {
      i++;
    }
  }

  let stack: number[] = [];
  let pendingMatrix: number[] | null = null;
  let matrixStack: number[][] = [];
  const identity = [1, 0, 0, 1, 0, 0];
  let currentMatrix = [...identity];

  function multiply(a: number[], b: number[]): number[] {
    return [
      a[0]*b[0] + a[1]*b[2],
      a[0]*b[1] + a[1]*b[3],
      a[2]*b[0] + a[3]*b[2],
      a[2]*b[1] + a[3]*b[3],
      a[4]*b[0] + a[5]*b[2] + b[4],
      a[4]*b[1] + a[5]*b[3] + b[5],
    ];
  }

  for (let t = 0; t < tokens.length; t++) {
    const tok = tokens[t];
    if (/^-?\d+(\.\d+)?$/.test(tok)) {
      stack.push(parseFloat(tok));
      continue;
    }
    if (tok === 'cm') {
      if (stack.length >= 6) {
        const m = stack.splice(-6);
        currentMatrix = multiply(currentMatrix, m);
      }
      continue;
    }
    if (tok === 'q') { matrixStack.push([...currentMatrix]); continue; }
    if (tok === 'Q') { currentMatrix = matrixStack.pop() || [...identity]; continue; }
    if (tok === 'Do') {
      if (stack.length === 0 && t > 0) {
        const prev = tokens[t - 1];
        if (prev && prev.startsWith('/')) {
          const name = prev.slice(1);
          const m = currentMatrix;
          if (!placements.has(name)) {
            placements.set(name, {
              name,
              xPt: m[4],
              yPt: m[5],
              appliedWidthPt: Math.abs(m[0]),
              appliedHeightPt: Math.abs(m[3]),
              ctm: [...m],
            });
          }
        }
      }
      stack = [];
      continue;
    }
    if (tok.length > 0 && /[A-Za-z]/.test(tok[0]) && tok !== 'cm' && tok !== 'q' && tok !== 'Q' && tok !== 'Do') {
      stack = [];
    }
  }

  return placements;
}

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

    // Parse content stream for image placement coordinates
    let imagePlacements = new Map<string, ImagePlacement>();
    try {
      const contentStreamRefs = page.node.Contents();
      if (contentStreamRefs) {
        let contentBytes: Uint8Array | null = null;
        if (contentStreamRefs instanceof PDFArray) {
          const parts: Uint8Array[] = [];
          for (let c = 0; c < contentStreamRefs.size(); c++) {
            const streamRef = contentStreamRefs.get(c);
            const stream = pdfDoc.context.lookup(streamRef);
            const decoded = decodeStream(stream);
            if (decoded) parts.push(decoded);
          }
          if (parts.length > 0) {
            const total = parts.reduce((s, p) => s + p.length, 0);
            const combined = new Uint8Array(total);
            let off = 0;
            for (const p of parts) { combined.set(p, off); off += p.length; }
            contentBytes = combined;
          }
        } else {
          const stream = pdfDoc.context.lookup(contentStreamRefs);
          contentBytes = decodeStream(stream);
        }
        if (contentBytes) {
          imagePlacements = parseImagePlacements(contentBytes);
        }
      }
    } catch {
      // Content stream parsing is best-effort; if it fails we just don't have coordinates
    }

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

              const rawName = typeof nameKey.asString === 'function' ? nameKey.asString() : (nameKey.value || String(nameKey));
              const imgName = typeof rawName === 'string' ? rawName : String(rawName);

              // Look up placement from content stream
              const placement = imagePlacements.get(imgName);
              const appliedWidthPt = placement?.appliedWidthPt;
              const appliedHeightPt = placement?.appliedHeightPt;

              // Calculate display size and DPI
              // Use applied dimensions from content stream if available, otherwise fall back to page size
              const dispWidthPt = appliedWidthPt && appliedWidthPt > 0 ? appliedWidthPt : widthPt;
              const dispHeightPt = appliedHeightPt && appliedHeightPt > 0 ? appliedHeightPt : heightPt;
              const displayWidthMm = Number((dispWidthPt * PT_TO_MM).toFixed(2));
              const displayHeightMm = Number((dispHeightPt * PT_TO_MM).toFixed(2));
              const effectiveDpiX = Number(((widthPx / (dispWidthPt / 72.0))).toFixed(1));
              const effectiveDpiY = Number(((heightPx / (dispHeightPt / 72.0))).toFixed(1));

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
                appliedWidthPt,
                appliedHeightPt,
                xPt: placement?.xPt,
                yPt: placement?.yPt,
                ctm: placement?.ctm,
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
