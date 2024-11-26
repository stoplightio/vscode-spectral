/* eslint-disable require-jsdoc */
import { expect } from 'chai';

import { IRuleResult, Ruleset } from '@stoplight/spectral-core';
import { truthy, falsy } from '@stoplight/spectral-functions';
import { DiagnosticSeverity as SpectralDiagnosticSeverity } from '@stoplight/types';
import { getRuleDocumentationUrl, makeDiagnostic, makePublishDiagnosticsParams } from '../../src/util';
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

function createRuleset(rulesetDoc: string | undefined): Ruleset {
  return new Ruleset({
    documentationUrl: rulesetDoc,
    rules: {
      'with-direct-doc': {
        documentationUrl: 'https://example.com/direct',
        given: '$',
        severity: 'error',
        then: {
          function: truthy,
        },
      },
      'without-direct-doc': {
        given: '$',
        severity: 'error',
        then: {
          function: falsy,
        },
      },
    },
  });
}

describe('makeDiagnostic', () => {
  it('sets the source to spectral', () => {
    const result = createResult();
    const actual = makeDiagnostic(result, undefined);
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

      const actual = makeDiagnostic(result, undefined);
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
        const actual = makePublishDiagnosticsParams(sourceUri, [], [], undefined);

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
        const actual = makePublishDiagnosticsParams(fakeRoot, [sourceUri], [], undefined);

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

    const actual = makePublishDiagnosticsParams('file:///one', [], problems, undefined);

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

  describe('getRuleDocumentationUrl', () => {
    it('uses the rule\'s documentation if it exists', () => {
      const ruleset = createRuleset(undefined);
      const documentationUrl = getRuleDocumentationUrl(ruleset, 'with-direct-doc');
      expect(documentationUrl).to.eql('https://example.com/direct');
    });
    it('uses the rule\'s documentation if it exists, even if the ruleset has its own', () => {
      const ruleset = createRuleset('https://example.com');
      const documentationUrl = getRuleDocumentationUrl(ruleset, 'with-direct-doc');
      expect(documentationUrl).to.eql('https://example.com/direct');
    });
    it('uses the ruleset\'s documentation and #code if the rule has no direct doc and the ruleset has one', () => {
      const ruleset = createRuleset('https://example.com');
      const documentationUrl = getRuleDocumentationUrl(ruleset, 'without-direct-doc');
      expect(documentationUrl).to.eql('https://example.com#without-direct-doc');
    });
    it('returns undefined if neither the rule or ruleset has a documentation', () => {
      const ruleset = createRuleset(undefined);
      const documentationUrl = getRuleDocumentationUrl(ruleset, 'without-direct-doc');
      expect(documentationUrl).to.be.undefined;
    });
  });
});
