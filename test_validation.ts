
import { validateQuestionnaireUpload } from "./src/lib/questionnaires/validate-questionnaire-upload";
import { buildSpreadsheetPreview } from "./src/modules/questionnaires/spreadsheet-preview";
import { InvalidFileError } from "./src/lib/storage/errors";

async function testScenario(name: string, fn: () => void) {
  try {
    fn();
    console.log(`❌ ${name} - FAILED (expected error but passed)`);
  } catch (err: any) {
    console.log(`✅ ${name} - PASSED (${err.message})`);
  }
}

async function main() {
  console.log("Starting validation scenario tests...\n");

  // 1. Unsupported Type
  await testScenario("Unsupported Type (.txt)", () => {
    validateQuestionnaireUpload({
      originalName: "test.txt",
      mimeType: "text/plain",
      byteLength: 100
    });
  });

  // 2. Empty File
  await testScenario("Empty File (0 bytes)", () => {
    validateQuestionnaireUpload({
      originalName: "test.csv",
      mimeType: "text/csv",
      byteLength: 0
    });
  });

  // 3. Corrupt/Non-spreadsheet File
  console.log("\nTesting Corrupt/Non-spreadsheet File...");
  // Real binary garbage that shouldn't parse as any known spreadsheet format
  const corruptBuf = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]); // JPEG header
  const res = buildSpreadsheetPreview(corruptBuf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  if ("error" in res) {
    console.log(`✅ Corrupt File - PASSED (${res.error})`);
  } else {
    console.log("❌ Corrupt File - FAILED (expected error but passed)");
    console.log("Result Preview:", JSON.stringify(res.preview.columnHeaders, null, 2));
    console.log("Sheet names:", JSON.stringify(res.preview.sheetNames, null, 2));
  }

  console.log("\nValidation scenario tests COMPLETE.");
}

main().catch(console.error);
