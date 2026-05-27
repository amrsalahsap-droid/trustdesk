// Polyfill DOMMatrix for PDF parsing in Node.js environment - MUST be before any imports
if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = class DOMMatrix {
    constructor() {
      this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
    }
    static fromMatrix() {
      return new DOMMatrix();
    }
    static fromFloat32Array() {
      return new DOMMatrix();
    }
    static fromFloat64Array() {
      return new DOMMatrix();
    }
  };
}

// Also polyfill for global object
if (typeof global.DOMMatrix === 'undefined') {
  global.DOMMatrix = globalThis.DOMMatrix;
}

if (typeof window !== 'undefined' && typeof window.DOMMatrix === 'undefined') {
  window.DOMMatrix = globalThis.DOMMatrix;
}

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

// pdfjs-dist (used by pdf-parse) attempts to dynamically import `pdf.worker.mjs`
// relative to its own chunk, which fails under Next.js Turbopack bundling.
// Resolve the worker via the user's CWD so Turbopack cannot rewrite the path.
let workerConfigured = false;
function ensurePdfWorker() {
  if (workerConfigured) return;
  try {
    const require = createRequire(`${process.cwd()}/package.json`);
    const workerPath = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
    PDFParse.setWorker(pathToFileURL(workerPath).href);
    workerConfigured = true;
  } catch {
    // If resolution fails we leave the default and surface the pdf-parse error.
  }
}

export interface ExtractionResult {
  fullText: string;
  pageCount?: number;
  pages?: Record<number, string>;
  metadata?: any;
}

export interface Extractor {
  extract: (buffer: Buffer) => Promise<ExtractionResult>;
}

const EXTRACT_TIMEOUT_MS = 30_000; // 30 seconds

/**
 * Wraps a promise with a timeout.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Timed out after ${ms}ms: ${label}`)), ms)
  );
  return Promise.race([promise, timeout]);
}

/**
 * Custom error for empty extractions.
 */
export class EmptyExtractionError extends Error {
  constructor(message: string = "Document contains no readable text") {
    super(message);
    this.name = "EmptyExtractionError";
  }
}

/**
 * Custom error for malformed or non-Word documents.
 */
export class MalformedDocumentError extends Error {
  constructor(message: string = "Document is malformed or not a valid Word file") {
    super(message);
    this.name = "MalformedDocumentError";
  }
}

/**
 * PDF Extractor using the modern PDFParse class (v2.4.5+)
 */
export const PdfExtractor: Extractor = {
  extract: async (buffer) => {
    ensurePdfWorker();
    // 1. Initialize the parser with raw buffer data
    const parser = new PDFParse({ data: buffer });

    try {
      // 2. Extract structured text and page content with timeout
      const textResult = await withTimeout(
        parser.getText(),
        EXTRACT_TIMEOUT_MS,
        "pdf-parse:getText"
      );
      
      if (!textResult.text || textResult.text.trim().length === 0) {
        throw new EmptyExtractionError();
      }

      // 3. Extract document-level metadata
      const infoResult = await parser.getInfo();

      // 4. Map to standardized page Record (1-indexed)
      const pages: Record<number, string> = {};
      textResult.pages.forEach((page) => {
        pages[page.num] = page.text;
      });

      return {
        fullText: textResult.text,
        pageCount: textResult.total,
        pages,
        metadata: infoResult.info,
      };
    } catch (err) {
      if (err instanceof EmptyExtractionError) throw err;
      
      throw new MalformedDocumentError(
        err instanceof Error ? err.message : "Failed to extract PDF content"
      );
    } finally {
      // 5. Cleanup memory
      await parser.destroy();
    }
  },
};

/**
 * DOCX Extractor using mammoth.
 */
export const DocxExtractor: Extractor = {
  extract: async (buffer) => {
    try {
      const result = await mammoth.extractRawText({ buffer });
      
      if (!result.value || result.value.trim().length === 0) {
        throw new EmptyExtractionError();
      }

      return {
        fullText: result.value,
      };
    } catch (err) {
        if (err instanceof EmptyExtractionError) throw err;
        
        throw new MalformedDocumentError(
            err instanceof Error ? err.message : "Failed to extract DOCX content"
        );
    }
  },
};

/**
 * Plain Text Extractor with multi-encoding support.
 */
export const TxtExtractor: Extractor = {
  extract: async (buffer: Buffer) => {
    let text = "";

    // Simple BOM detection for UTF-16
    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
      text = buffer.toString("utf16le");
    } else if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
      text = buffer.toString("utf16le"); 
    } else {
      text = buffer.toString("utf-8");
    }
    
    if (text.trim().length === 0) {
      throw new EmptyExtractionError();
    }

    // Strip BOM if present after conversion
    if (text.startsWith("\ufeff")) {
      text = text.slice(1);
    }

    const lineCount = text.split(/\r\n|\r|\n/).length;

    return {
      fullText: text,
      metadata: { lineCount },
    };
  },
};

/**
 * Registry to route MIME types to the correct extractor.
 */
export const ExtractorRegistry = {
  getExtractor: (mimeType: string): Extractor | null => {
    const type = mimeType.toLowerCase();
    
    if (type === "application/pdf") return PdfExtractor;
    
    if (
      type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      type === "application/msword"
    ) {
      return DocxExtractor;
    }
    
    if (type === "text/plain") return TxtExtractor;
    
    return null;
  },
};
