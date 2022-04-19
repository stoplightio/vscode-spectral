/* eslint-disable require-jsdoc */
import { expect } from 'chai';

import type { IRuleResult } from '@stoplight/spectral-core';
import { DiagnosticSeverity as SpectralDiagnosticSeverity } from '@stoplight/types';
import { makeDiagnostic, makePublishDiagnosticsParams } from '../../src/util';
import { DiagnosticSeverity as VSCodeDiagnosticSeverity } from 'vscode-languageserver';

function createResult(source?: string): IRuleResult {
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
    source,
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


describe('makePublishDiagnosticsParams', () => {
  const sources: string[] = [
    'file:///c%3A/folder/test.txt',
    'file:///home/folder/test.txt',
  ];

  describe('returns an empty array of diagnostics for the root file being analyzed even when it has no issues', () => {
    sources.forEach((sourceUri) => {
      it(sourceUri, () => {
        const actual = makePublishDiagnosticsParams(sourceUri, [], []);

        expect(actual).to.have.length(1);
        expect(actual[0].uri).to.eql(sourceUri);
        expect(actual[0].diagnostics).to.have.length(0);
      });
    });
  });

  describe('returns an empty array of diagnostics for the file being analyzed and its root even when they have no issues', () => {
    sources.forEach((sourceUri) => {
      it(sourceUri, () => {
        const fakeRoot = 'file:///different/root';
        const actual = makePublishDiagnosticsParams(fakeRoot, [sourceUri], []);

        expect(actual).to.have.length(2);

        const red = actual.reduce<Record<string, number>>((g, p) => {
          if (!(p.uri in g)) {
            g[p.uri] = 0;
          }

          g[p.uri] += p.diagnostics.length;

          return g;
        }, {});

        expect(Object.keys(red)).to.have.length(2);
        expect(Object.keys(red)).to.contain(sourceUri);
        expect(red[sourceUri]).to.eql(0);
        expect(Object.keys(red)).to.contain(fakeRoot);
        expect(red[fakeRoot]).to.eql(0);
      });
    });
  });

  it('groups linting results per source', () => {
    const problems: IRuleResult[] = [
      createResult('four'),
      createResult('one'),
      createResult('two'),
      createResult('five'),
      createResult('four'),
      createResult('three'),
      createResult('five'),
      createResult('three'),
      createResult('five'),
      createResult('two'),
      createResult('five'),
      createResult('four'),
      createResult('three'),
      createResult('five'),
      createResult('four'),
    ];

    const actual = makePublishDiagnosticsParams('file:///one', [], problems);

    expect(actual).to.have.length(5);

    actual.forEach((pdp) => {
      switch (pdp.uri) {
        case 'file:///one':
          expect(pdp.diagnostics).to.have.length(1);
          break;

        case 'file:///two':
          expect(pdp.diagnostics).to.have.length(2);
          break;

        case 'file:///three':
          expect(pdp.diagnostics).to.have.length(3);
          break;

        case 'file:///four':
          expect(pdp.diagnostics).to.have.length(4);
          break;

        case 'file:///five':
          expect(pdp.diagnostics).to.have.length(5);
          break;

        default:
          throw new Error(`Unexpected uri '${pdp.uri}'`);
      }
    });
  });
});
