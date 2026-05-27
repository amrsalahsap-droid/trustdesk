import { describe, it, expect, vi } from "vitest";
import { ExtractorRegistry, TxtExtractor, PdfExtractor, DocxExtractor, EmptyExtractionError, MalformedDocumentError } from "../extractors";

// Mock mammoth
vi.mock("mammoth", () => {
    return {
        default: {
            extractRawText: vi.fn().mockImplementation(({ buffer }) => {
                if (buffer.toString() === "MALFORMED") {
                    return Promise.reject(new Error("Zip error"));
                }
                return Promise.resolve({ value: "Docx Content" });
            })
        }
    }
});

// Mock pdf-parse (v2+ exposes PDFParse class used by PdfExtractor)
vi.mock("pdf-parse", () => {
  class PDFParse {
    constructor(private opts: { data: Buffer }) {}
    async getText() {
      if (this.opts.data.toString() === "EMPTY") {
        return { text: "", total: 0, pages: [] as { num: number; text: string }[] };
      }
      return {
        text: "Page 1",
        total: 1,
        pages: [{ num: 1, text: "Page 1" }],
      };
    }
    async getInfo() {
      return { info: { Title: "Test PDF" } };
    }
    async destroy() {}
  }
  return { PDFParse };
});

describe("Enhanced Document Extractors", () => {
  describe("TxtExtractor", () => {
    it("extracts UTF-8 text and returns lineCount", async () => {
      const buffer = Buffer.from("Hello\nWorld", "utf-8");
      const result = await TxtExtractor.extract(buffer);
      expect(result.fullText).toBe("Hello\nWorld");
      expect(result.metadata.lineCount).toBe(2);
    });

    it("detects UTF-16LE via BOM", async () => {
        // UTF-16LE BOM: 0xFF 0xFE
        const content = Buffer.from("Hi", "utf16le");
        const BOM = Buffer.from([0xff, 0xfe]);
        const buffer = Buffer.concat([BOM, content]);
        
        const result = await TxtExtractor.extract(buffer);
        expect(result.fullText).toBe("Hi");
    });

    it("throws EmptyExtractionError for whitespace only", async () => {
        const buffer = Buffer.from("   \n  ", "utf-8");
        await expect(TxtExtractor.extract(buffer)).rejects.toThrow(EmptyExtractionError);
    });
  });

  describe("DocxExtractor", () => {
    it("extracts text successfully", async () => {
        const buffer = Buffer.from("VALID");
        const result = await DocxExtractor.extract(buffer);
        expect(result.fullText).toBe("Docx Content");
    });
  });

  describe("PdfExtractor", () => {
    it("collects page-level text", async () => {
      const buffer = Buffer.from("MOCK_PDF_CONTENT");
      const result = await PdfExtractor.extract(buffer);
      
      expect(result.fullText).toBe("Page 1");
      expect(result.pageCount).toBe(1);
      expect(result.pages).toEqual({ 1: "Page 1" });
    });
  });

  describe("ExtractorRegistry", () => {
    it("routes correctly", () => {
      expect(ExtractorRegistry.getExtractor("application/pdf")).toBe(PdfExtractor);
      expect(ExtractorRegistry.getExtractor("text/plain")).toBe(TxtExtractor);
    });
  });
});
