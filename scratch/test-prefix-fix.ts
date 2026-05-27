
import JSZip from 'jszip';
import fs from 'fs';

async function testFix() {
    // This is just a conceptual test of the replacement logic.
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<x:workbook xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
    <x:sheets>
        <x:sheet name="Sheet1" sheetId="1" r:id="rId1"/>
    </x:sheets>
</x:workbook>`;

    // Remove the prefix
    const fixed = xml
        .replace(/<x:(\w+)/g, '<$1')
        .replace(/<\/x:(\w+)>/g, '</$1>')
        .replace(/xmlns:x=/g, 'xmlns=');
    
    console.log(fixed);
}

testFix();
