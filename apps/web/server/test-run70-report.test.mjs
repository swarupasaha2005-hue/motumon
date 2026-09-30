// Offline report fixtures only; no transaction/user evidence is created.
import { describe,it,expect } from 'vitest';
import { renderTestReport,feedbackFixture } from '../../../scripts/lib/test-run70-report.mjs';
import { initialCheckpoint } from '../../../scripts/lib/test-run70.mjs';
import { parseCsv } from '../../../scripts/lib/user-evidence.mjs';
describe('controlled test report and separate synthetic feedback',()=>{
  it('contains exactly 56 positive and 14 negative unique fixture texts',()=>{
    const fixture=feedbackFixture();
    expect(fixture.filter(r=>r.sentiment==='Positive')).toHaveLength(56);
    expect(fixture.filter(r=>r.sentiment==='Negative')).toHaveLength(14);
    expect(new Set(fixture.map(r=>r.feedback)).size).toBe(70);
    expect(fixture.every(r=>r.classification.startsWith('SYNTHETIC'))).toBe(true);
  });
  it('renders all 70 unattempted slots without fabricating identity or evidence',()=>{
    const cp=initialCheckpoint('a'.repeat(64));cp.failure={stage:'Preview indexer verification',error:'ENOTFOUND'};
    const report=renderTestReport(cp,'fixed offline timestamp');
    const rows=parseCsv(report.csv);
    expect(rows).toHaveLength(70);
    expect(rows.every(r=>r.status==='NOT ATTEMPTED' && r.registrationTx==='' && r.claimTx==='' && r.commitment==='')).toBe(true);
    expect(report.totals.completed).toBe(0);
    expect(report.verdict).toContain('EXTERNAL ENVIRONMENT BLOCKER');
  });
  it('uses checkpoint receipts only, retaining ambiguity and excluding secret properties',()=>{
    const cp=initialCheckpoint('a'.repeat(64));
    cp.participants=[{number:1,commitment:'public-commitment',context:'public-context',employeeSecret:'PRIVATE-MARKER',
      registration:{intent:true,status:'VERIFIED',txId:'mock-indexed-id',block:123},claim:{intent:true,status:'AMBIGUOUS',txId:null}}];
    const r=renderTestReport(cp,'offline');expect(r.rows[0].status).toBe('UNVERIFIED');
    expect(r.rows[0].claimTx).toBe('');expect(r.totals.completed).toBe(0);
    expect(r.md+r.csv+r.feedbackCsv).not.toContain('PRIVATE-MARKER');
    expect(r.rows[1].status).toBe('NOT ATTEMPTED');
  });
});
