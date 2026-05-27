const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src/app/onboarding/onboarding-workspace-form.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Normalize line endings
content = content.replace(/\r\n/g, '\n');

// We need to ensure that:
// 1. DIV 304 (<div className="space-y-6">) is closed.
// 2. ROOT DIV 291 is closed after the buttons.

// Let's rebuild the RECOMMENDATIONS block return part to be absolutely sure.
const blocks = content.split('if (step === "RECOMMENDATIONS") {');
if (blocks.length < 2) {
    console.log('Step block not found');
    process.exit(1);
}

const beforeStep = blocks[0];
const afterStepStart = blocks[1];

// Find the end of the step block (the return statement ending)
const returnMatch = afterStepStart.match(/return \(\s+<div className="flex flex-col gap-6">([\s\S]+?) {2}\);\n {2}\}/);

if (!returnMatch) {
    console.log('Return statement match failed. Trying less strict match.');
    // Try to find the structure by braces
    const lines = content.split('\n');
    let startIdx = -1;
    let endIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('if (step === "RECOMMENDATIONS") {')) startIdx = i;
        if (startIdx !== -1 && lines[i].includes('if (step === "ANALYZING") {')) {
            endIdx = i - 1;
            break;
        }
    }
    
    if (startIdx !== -1 && endIdx !== -1) {
        console.log(`Fixing block between ${startIdx} and ${endIdx}`);
        // We will manually fix the closing tags before endIdx
        // We expect:
        // ...
        // </label>
        // </div> <-- closes 390
        // </div> <-- closes 304 (MISSING)
        // </div> <-- closes buttons (418)
        // </div> <-- closes root (291/419)
        
        let foundLabel = -1;
        for (let j = endIdx; j > startIdx; j--) {
            if (lines[j].includes('</label>')) {
                foundLabel = j;
                break;
            }
        }
        
        if (foundLabel !== -1) {
            // Find where buttons start
            let buttonsIdx = -1;
            for (let j = foundLabel; j < endIdx; j++) {
                if (lines[j].includes('flex gap-3')) {
                    buttonsIdx = j;
                    break;
                }
            }
            
            if (buttonsIdx !== -1) {
                // The gap is between foundLabel and buttonsIdx
                // There should be two closing divs there
                const gap = lines.slice(foundLabel + 1, buttonsIdx);
                console.log('Current gap content:', gap.map(l => l.trim()).filter(l => l));
                
                // We want to force it to be:
                // </div> <!-- closes 390 -->
                // </div> <!-- closes 304 -->
                const newGap = ['          </div>', '        </div>', ''];
                lines.splice(foundLabel + 1, buttonsIdx - (foundLabel + 1), ...newGap);
                
                // Now fix the end of the return
                // The return end should have buttons div closed and root div closed
                // Then ); then }
                const returnEndIdx = lines.findIndex((l, idx) => idx > buttonsIdx && l.includes('if (step === "ANALYZING")'));
                if (returnEndIdx !== -1) {
                   const finalBlock = [
                     '        </div>',
                     '      </div>',
                     '    );',
                     '  }',
                     ''
                   ];
                   // Replace everything from button div closing to returnEndIdx
                   // Find the button closing
                   let buttonCloserIdx = -1;
                   for (let j = returnEndIdx - 1; j > buttonsIdx; j--) {
                       if (lines[j].trim() === '</div>') {
                           buttonCloserIdx = j;
                           // But wait, we might have many </div>. We want the one that closes the buttons.
                           // The buttons div usually has 2-3 lines of content.
                           break;
                       }
                   }
                   
                   if (buttonCloserIdx !== -1) {
                       lines.splice(buttonCloserIdx, returnEndIdx - buttonCloserIdx, ...finalBlock);
                       fs.writeFileSync(filePath, lines.join('\n'));
                       console.log('Structural fix applied successfully via line manipulation.');
                   }
                }
            }
        }
    }
} else {
    console.log('Return match worked! (Unexpected since build failed)');
}
