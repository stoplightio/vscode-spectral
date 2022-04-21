/* eslint-disable require-jsdoc */

import {
  Diagnostic,
  DiagnosticSeverity,
  PublishDiagnosticsParams,
} from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import type { ISpectralDiagnostic } from '@stoplight/spectral-core';
import { DiagnosticSeverity as SpectralDiagnosticSeverity } from '@stoplight/types';

/**
 * Converts a Spectral rule violation severity into a VS Code diagnostic severity.
 * @param {DiagnosticSeverity} severity - The Spectral diagnostic severity to convert.
 * @return {DiagnosticSeverity} The converted severity for a VS Code diagnostic.
 */
function convertSeverity(severity: SpectralDiagnosticSeverity): DiagnosticSeverity {
  switch (severity) {
    case SpectralDiagnosticSeverity.Error:
      return DiagnosticSeverity.Error;
    case SpectralDiagnosticSeverity.Warning:
      return DiagnosticSeverity.Warning;
    case SpectralDiagnosticSeverity.Information:
      return DiagnosticSeverity.Information;
    case SpectralDiagnosticSeverity.Hint:
      return DiagnosticSeverity.Hint;
    default:
      return DiagnosticSeverity.Error;
  }
}

/**
 * Converts a Spectral rule violation to a VS Code diagnostic.
 * @param {ISpectralDiagnostic} problem - The Spectral rule result to convert to a VS Code diagnostic message.
 * @return {Diagnostic} The converted VS Code diagnostic to send to the client.
 */
export function makeDiagnostic(problem: ISpectralDiagnostic): Diagnostic {
  return {
    range: {
      start: {
        line: problem.range.start.line,
        character: problem.range.start.character,
      },
      end: {
        line: problem.range.end.line,
        character: problem.range.end.character,
      },
    },
    severity: convertSeverity(problem.severity),
    code: problem.code,
    source: 'spectral',
    message: problem.message,
  };
}

export function makePublishDiagnosticsParams(rootDocumentUri: string, knownDependencieUris: string[], problems: ISpectralDiagnostic[]): PublishDiagnosticsParams[] {
  const grouped = problems.reduce<Record<string, ISpectralDiagnostic[]>>((grouped, problem) => {
    if (problem.source === undefined) {
      return grouped;
    }

    const uri = URI.file(problem.source).toString();
    if (!(uri in grouped)) {
      grouped[uri] = [];
    }

    grouped[uri].push(problem);

    return grouped;
  }, {});

  for (const uri of [...knownDependencieUris, rootDocumentUri]) {
    if ((uri in grouped)) {
      continue;
    }

    grouped[uri] = [];
  }

  return Object.entries(grouped).map(([source, problems]) => {
    return {
      uri: source,
      diagnostics: problems.map((p) => makeDiagnostic(p)),
    };
  });
}
