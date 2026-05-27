const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'src/app/onboarding/onboarding-workspace-form.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Normalize line endings
content = content.replace(/\r\n/g, '\n');

// The issue: ROOT DIV (line 289) is being closed too early at line 403.
// We need to remove the extra </div> closing root prematurely.

const PrematureClosingPattern = /<\/label>\n\s+<\/div>\n\s+<\/div>\n\n\s+<div className=\"flex gap-3\">/;

const FixedClosingHeader = `</label>
          </div>

        <div className="flex gap-3">`;

if (content.match(PrematureClosingPattern)) {
    content = content.replace(PrematureClosingPattern, FixedClosingHeader);
    fs.writeFileSync(filePath, content);
    console.log('Fixed premature closing div.');
} else {
    console.log('Premature closing pattern not found. Analyzing lines...');
    // Fallback: search for exactly what we see in view_file
    const lines = content.split('\n');
    let fixed = false;
    for (let i = 0; i < lines.length - 10; i++) {
        if (lines[i].includes('</label>') && 
            lines[i+1].trim() === '</div>' && 
            lines[i+2].trim() === '</div>' && 
            lines[i+4].includes('<div className="flex gap-3">')) {
            
            // Remove lines[i+1] and lines[i+2]? No, we only want to remove ONE </div>
            // Wait, let's see. line 302 (content) needs to be closed. line 289 (root) needs to be closed.
            // If they both close at i+1 and i+2, then root is closed before buttons.
            // So we remove lines[i+2].
            lines.splice(i+2, 1);
            fs.writeFileSync(filePath, lines.join('\n'));
            fixed = true;
            console.log('Fixed using line removal fallback.');
            break;
        }
    }
}
