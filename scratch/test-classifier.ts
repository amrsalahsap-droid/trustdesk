import { classifyRow } from "../src/modules/questionnaires/row-classifier";

const testCases = [
  { q: "GENERAL INFORMATION", a: "", expected: "section_header" },
  { q: "1. SECURITY CONTROLS", a: "", expected: "section_header" },
  { q: "How do you handle data encryption?", a: "We use AES-256.", expected: "question_row" },
  { q: "Describe your incident response plan.", a: "", expected: "question_row" },
  { q: "Do you have a SOC2 report?", a: "Yes", expected: "question_row" },
  { q: "Please read these instructions before completing the form. This document is strictly confidential and should not be shared.", a: "", expected: "note_or_instruction" },
  { q: "", a: "", expected: "blank_or_spacer" },
  { q: "   ", a: "", expected: "blank_or_spacer" },
];

console.log("Running RowClassifier Tests...");
let passed = 0;
testCases.forEach((tc, i) => {
  const result = classifyRow(tc.q, tc.a);
  if (result === tc.expected) {
    console.log(`PASS: Case ${i + 1} ("${tc.q.substring(0, 20)}...") -> ${result}`);
    passed++;
  } else {
    console.error(`FAIL: Case ${i + 1} ("${tc.q.substring(0, 20)}...") -> expected ${tc.expected}, got ${result}`);
  }
});

console.log(`\nResult: ${passed}/${testCases.length} Passed`);
if (passed === testCases.length) process.exit(0);
else process.exit(1);
