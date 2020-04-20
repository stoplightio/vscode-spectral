import * as assert from 'assert';
import { IRuleResult } from '@stoplight/spectral';
import { DiagnosticSeverity as SpectralDiagnosticSeverity } from '@stoplight/types/dist/diagnostics';
import { makeDiagnostic } from '../../util';
import { DiagnosticSeverity as VSCodeDiagnosticSeverity } from 'vscode-languageserver';

/**
 * Creates a rule result for use in testing.
 * @return {IRuleResult} A test result.
 */
function createResult(): IRuleResult {
  return {
    range: {
      start: {
        line: 1,
        character: 2,
      },
      end: {
        line: 3,
        character: 4,
      },
    },
    path: [

    ],
    code: 'rule-name',
    message: 'message',
    severity: SpectralDiagnosticSeverity.Error,
  };
}

describe('makeDiagnostic', () => {
  it('sets the source to spectral', () => {
    const result = createResult();
    const actual = makeDiagnostic(result);
    assert.equal('spectral', actual.source, 'should set the source of the diagnostic');
  });
  it('converts severity', () => {
    const result = createResult();
    result.severity = SpectralDiagnosticSeverity.Error;
    let actual = makeDiagnostic(result);
    assert.equal(VSCodeDiagnosticSeverity.Error, actual.severity, 'should handle errors');
    result.severity = SpectralDiagnosticSeverity.Warning;
    actual = makeDiagnostic(result);
    assert.equal(VSCodeDiagnosticSeverity.Warning, actual.severity, 'should handle warnings');
    result.severity = SpectralDiagnosticSeverity.Information;
    actual = makeDiagnostic(result);
    assert.equal(VSCodeDiagnosticSeverity.Information, actual.severity, 'should handle information');
    result.severity = SpectralDiagnosticSeverity.Hint;
    actual = makeDiagnostic(result);
    assert.equal(VSCodeDiagnosticSeverity.Hint, actual.severity, 'should handle information');
  });
});
