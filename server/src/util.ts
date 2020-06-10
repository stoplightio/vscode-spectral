/* eslint-disable require-jsdoc */

import {
  Diagnostic,
  DiagnosticSeverity,
  PublishDiagnosticsParams,
} from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import { IRuleResult } from '@stoplight/spectral';
import { DiagnosticSeverity as SpectralDiagnosticSeverity } from '@stoplight/types/dist/diagnostics';

/**
 * Converts a Spectral rule violation severity into a VS Code diagnostic severity.
 * @param {SpectralDiagnosticSeverity} severity - The Spectral diagnostic severity to convert.
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
 * @param {IRuleResult} problem - The Spectral rule result to convert to a VS Code diagnostic message.
 * @return {IDiagnostic} The converted VS Code diagnostic to send to the client.
 */
export function makeDiagnostic(problem: IRuleResult): Diagnostic {
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

export function makePublishDiagnosticsParams(uriBeingLinted: string, problems: IRuleResult[]): PublishDiagnosticsParams[] {
  const grouped = problems.reduce<Record<string, IRuleResult[]>>((grouped, problem) => {
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

  if (!(uriBeingLinted in grouped)) {
    grouped[uriBeingLinted] = [];
  }

  return Object.entries(grouped).map(([source, problems]) => {
    return {
      uri: source,
      diagnostics: problems.map((p) => makeDiagnostic(p)),
    };
  });
}
