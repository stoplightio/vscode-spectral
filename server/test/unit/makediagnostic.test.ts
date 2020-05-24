import { expect } from 'chai';

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
    expect(actual.source).to.eql('spectral');
  });

  const testCases: [SpectralDiagnosticSeverity, VSCodeDiagnosticSeverity][] = [
    [SpectralDiagnosticSeverity.Error, VSCodeDiagnosticSeverity.Error],
    [SpectralDiagnosticSeverity.Warning, VSCodeDiagnosticSeverity.Warning],
    [SpectralDiagnosticSeverity.Information, VSCodeDiagnosticSeverity.Information],
    [SpectralDiagnosticSeverity.Hint, VSCodeDiagnosticSeverity.Hint],
  ];

  testCases.forEach(([input, expected]) => {
    it(`converts Spectral severity to VSCode severity (${input} => ${expected})`, () => {
      const result = createResult();
      result.severity = input;

      const actual = makeDiagnostic(result);
      expect(actual.severity).to.eql(expected);
    });
  });
});
