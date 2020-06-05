// Configuration has the same definitions/interfaces in both client and server
// with two exceptions:
// - The server has some configuration it only uses internally, so they don't
//   show up in the client.
// - The client uses `vscode-languageclient` and the server uses
//   `vscode-languageserver` for interfaces.
//
// Keeping it in a separate file like this makes it easier to find and update
// across the client and server components.

import { WorkspaceFolder } from 'vscode-languageclient';

/**
 * Possible configuration values for when the Spectral linter runs.
 */
export type RunValues = 'onType' | 'onSave';

/**
 * Structure for extension-level settings. Based on these values the individual
 * document linting settings are determined. These settings are defined in the
 * root-level package.json. Settings can be overridden down to the resource
 * level.
 */
export interface ExtensionSettings {
  /**
   * Controls whether or not Spectral is enabled.
   */
  enable: boolean;

  /**
   * Location of the ruleset file to use when validating. If omitted, the
   * default is a .spectral.yml/.spectral.json in the same folder as the
   * document being validated. This is relative to the workspace folder;
   * it's not currently possible to expand predefined variables in extensions.
   * {@link https://github.com/microsoft/vscode/issues/46471|GitHub Issue}
   */
  rulesetFile: string | undefined;

  /**
   * Run the linter on save (onSave) or as you type (onType).
   */
  run: RunValues;

  /**
   * An array of file globs which should be validated by Spectral. If language
   * identifiers are also specified, the file must match both in order to be
   * validated.
   */
  validateFiles: string[] | undefined;

  /**
   * An array of language IDs which should be validated by Spectral. If file
   * globs are also specified, the file must match both in order to be
   * validated.
   */
  validateLanguages: string[] | undefined;

  /**
   * The workspace folder for which the settings were retrieved. Used in file
   * path calculations.
   */
  workspaceFolder: WorkspaceFolder | undefined;
}
