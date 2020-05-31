import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  IRuleResult,
  Spectral,
  Parsers,
  Document as SpectralDocument,
  KNOWN_FORMATS,
} from '@stoplight/spectral';
import { httpAndFileResolver } from '@stoplight/spectral/dist/resolvers/http-and-file';
import { IRuleset } from '@stoplight/spectral/dist/types/ruleset';
import { URI } from 'vscode-uri';
import * as spectralPackage from '@stoplight/spectral/package.json';

const spectralVersion = spectralPackage.version;

const buildSpectralInstance = (): Spectral => {
  const spectral = new Spectral({ resolver: httpAndFileResolver });

  for (const [format, lookup] of KNOWN_FORMATS) {
    // Each document type that Spectral can lint gets registered with detectors.
    spectral.registerFormat(format, (document) => lookup(document));
  }

  return spectral;
};

/**
 * Wrapper for the Spectral linter that runs linting against VS Code document
 * content in a manner similar to the Spectral CLI.
 */
export class Linter {
  private spectral = buildSpectralInstance();
  static version = spectralVersion;

  /**
   * Executes Spectral linting against a VS Code document.
   * @param {TextDocument} document - The document to lint/validate.
   * @param {IRuleset|undefined} ruleset - The ruleset to use during validation, if any.
   * @return {Promise<IRuleResult[]>} The set of rule violations found. If no violations are found, this will be empty.
   */
  public async lint(document: TextDocument, ruleset: IRuleset | undefined): Promise<IRuleResult[]> {
    // Unclear if we may have issues changing the ruleset on the shared Spectral
    // instance here. If so, we may need to store a Spectral instance per
    // document rather than using a single shared one via Linter.
    if (ruleset) {
      this.spectral.setRuleset(ruleset);
    } else {
      // No ruleset, so clear everything out.
      this.spectral.setRuleset({
        functions: {},
        rules: {},
        exceptions: {},
      });
    }

    // It's unclear why JSON and YAML both get parsed as YAML, but that's how Spectral does it, sooooooo...
    const text = document.getText();

    // There's a bug in how `json-ref-resolver` handles file:// URLs - it fails
    // to decode any URL-encoded items because it treats a file://path/to/file
    // and /fs/path/to/file style URL as the same thing. To bypass the issue we
    // pre-convert the file URL into a local FS path.
    //
    // For in-memory documents, this URI will be `untitled:Untitled-1` or
    // something similar. The `fsPath` will be `Untitled-1`, and that seems as
    // reasonable as anything else for in-memory validation. This only really
    // matters when parsing the relative links in references anyway.
    const file = URI.parse(document.uri).fsPath;

    const doc = new SpectralDocument(
      text,
      Parsers.Yaml,
      file,
    );

    return this.spectral.run(doc, { ignoreUnknownFormat: true, resolve: { documentUri: file } });
  }
}
