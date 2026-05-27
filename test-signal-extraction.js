// Test script to verify enhanced signal extraction
const { WebsiteAnalysisService } = require('./src/modules/workspaces/onboarding/website-analysis-service.ts');

// Mock evidence items with rich software content
const mockEvidenceItems = [
  {
    evidence: {
      url: 'https://example.com/product',
      title: 'Our SaaS Platform',
      headings: ['Enterprise Software Solutions', 'Cloud-Based Platform'],
      snippet: 'We provide a comprehensive SaaS platform for enterprise businesses. Our cloud-based software solution includes subscription pricing and monthly plans.'
    },
    pageType: 'product',
    score: 80,
    structured: {
      url: 'https://example.com/product',
      title: 'Our SaaS Platform',
      pageType: 'product',
      score: 80,
      sourceConfidence: 0.9,
      blocks: [
        {
          kind: 'heading-section',
          level: 1,
          heading: 'Enterprise Software Solutions',
          bodyText: 'We provide a comprehensive SaaS platform for enterprise businesses.'
        },
        {
          kind: 'meta',
          metaDescription: 'Cloud-based SaaS platform with subscription pricing for enterprise customers'
        }
      ]
    }
  }
];

console.log('Testing enhanced signal extraction...');
console.log('Mock evidence items:', mockEvidenceItems.length);

// Test the enhanced signal extraction
try {
  const signals = WebsiteAnalysisService.extractEnhancedBusinessSignals(mockEvidenceItems);
  console.log('Extracted signals:', signals.length);
  console.log('Signals:', JSON.stringify(signals, null, 2));
} catch (error) {
  console.error('Error testing signal extraction:', error);
}
