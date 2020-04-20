import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  IRuleResult,
  Spectral,
} from '@stoplight/spectral';
import { parseYaml } from '@stoplight/spectral/dist/parsers';
import { IParsedResult } from '@stoplight/spectral/dist/document';
import { IRuleset } from '@stoplight/spectral/dist/types/ruleset';
import { getLocationForJsonPath } from '@stoplight/yaml';
import { URI } from 'vscode-uri';
import { refResolver } from './resolver';
import { registerFormats } from './formats';

/**
 * Wrapper for the Spectral linter that runs linting against VS Code document
 * content in a manner similar to the Spectral CLI.
 */
export class Linter {
  private spectral = new Spectral({ resolver: refResolver });

  /**
   * Initializes a new instance of the linter.
   */
  constructor() {
    registerFormats(this.spectral);
  }

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
    const spec = parseYaml(text);

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
    const parsedResult: IParsedResult = {
      source: file,
      parsed: spec,
      getLocationForJsonPath,
    };

    return this.spectral.run(parsedResult, { ignoreUnknownFormat: true, resolve: { documentUri: file } });
  }
}
