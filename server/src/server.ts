import * as fs from 'fs';
import * as path from 'path';
import { Minimatch } from 'minimatch';
import {
  Diagnostic,
  DidChangeConfigurationNotification,
  DidChangeWatchedFilesNotification,
  DidChangeWorkspaceFoldersNotification,
  InitializeParams,
  ProposedFeatures,
  TextDocumentSyncKind,
  TextDocuments,
  createConnection,
} from 'vscode-languageserver';
import { WorkDoneProgress } from 'vscode-languageserver/lib/progress';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { getDefaultRulesetFile } from '@stoplight/spectral/dist/rulesets/loader';
import { readRuleset } from '@stoplight/spectral/dist/rulesets/reader';
import {
  ExtensionSettings,
  TextDocumentSettings,
} from './configuration';
import { Linter } from './linter';
import {
  StartWatcherNotification,
  ValidateNotification,
} from './notifications';
import { BufferedMessageQueue } from './queue';
import { makeDiagnostic } from './util';

// eslint-disable-next-line
namespace Is {
  const toString = Object.prototype.toString;

  /**
   * User-defined type guard to check/convert a value to string.
   * {@link https://github.com/Microsoft/TypeScript/issues/1007 Spec}
   * @param {any} value - The value to check/convert to string.
   * @return {string} The value cast to a string.
   */
  // eslint-disable-next-line
  export function string(value: any): value is string {
    return toString.call(value) === '[object String]';
  }
}

/**
 * The connection on which communication between the extension (client) and the
 * language server occurs.
 */
const connection = createConnection(ProposedFeatures.all);
connection.console.info(`Spectral v${Linter.version} server running (Node.js ${process.version})`);

/**
 * Cache of lint-related settings per document.
 */
const documentSettings: Map<string, Thenable<TextDocumentSettings>> = new Map<string, Thenable<TextDocumentSettings>>();

/**
 * Message queue that ensures validation doesn't occur on stale content.
 */
const messageQueue: BufferedMessageQueue = new BufferedMessageQueue(connection);

/**
 * Spectral linter.
 */
const linter = new Linter();

/**
 * Document listener used to raise document-related events.
 */
let documents: TextDocuments<TextDocument>;

/**
 * Something in the environment changed, so clear the document cache and
 * re-validate all open documents based on whatever new settings are calculated.
 */
function environmentChanged(): void {
  connection.console.info('Environment changed; refreshing validation results.');
  documentSettings.clear();
  for (const document of documents.all()) {
    // Clear our diagnostics for all documents in prep for re-validation. This
    // allows a change like 'stop validating .json files' to avoid leaving
    // diagnostics hanging around for files we don't validate anymore.
    connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
    messageQueue.addNotificationMessage(ValidateNotification.type, document, document.version);
  }
}

/**
 * Determines the path to a VS Code document. Useful in finding the default
 * Spectral ruleset, which is assumed to be in the same folder as the document.
 * @param {string | TextDocument | URI | undefined} documentOrUri - The location of the document for which the path should be determined.
 * @return {string|undefined} A string value with the folder path if it can be determined; or undefined if not.
 */
function getDocumentPath(documentOrUri: string | TextDocument | URI | undefined): string | undefined {
  if (!documentOrUri) {
    return undefined;
  }
  let uri: URI;
  if (Is.string(documentOrUri)) {
    uri = URI.parse(documentOrUri);
  } else if (documentOrUri instanceof URI) {
    uri = documentOrUri;
  } else {
    uri = URI.parse(documentOrUri.uri);
  }

  // This happens with remote documents or untitled docs.
  if (uri.scheme !== 'file') {
    return undefined;
  }

  return uri.fsPath;
}

/**
 * Determines the set of validation configuration settings for a given document
 * and updates the settings cache.
 * @param {TextDocument} document - The document for which configuration settings should be determined.
 * @return {Thenable<TextDocumentSettings>} The lint settings for the specified document.
 */
function resolveSettings(document: TextDocument): Thenable<TextDocumentSettings> {
  const uri = document.uri;
  let resultPromise = documentSettings.get(uri);
  if (resultPromise) {
    return resultPromise;
  }

  // Configuration section is empty to indicate to the client that it should go through
  // its middleware. The client will actually retrieve the 'spectral' section itself.
  resultPromise = connection.workspace.getConfiguration({ scopeUri: uri, section: '' })
    .then(async (configuration: ExtensionSettings) => {
      const settings: TextDocumentSettings = {
        validate: configuration.enable,
        run: configuration.run,
        ruleset: undefined,
      };

      // If global validation is off for this workspace, set validate=false and done.
      if (!settings.validate) {
        return settings;
      }

      // If the document is not one of the configured language types, set validate=false and done.
      if (configuration.validateLanguages &&
        !configuration.validateLanguages.some((value: string) => document.languageId === value)) {
        connection.console.log(`File ${document.uri} (${document.languageId}) doesn't match any of the specified language types; skipping.`);
        settings.validate = false;
        return settings;
      }

      // Some settings can only be configured for documents that actually have a
      // filesystem path.
      const docPath = getDocumentPath(document.uri);
      if (Is.string(docPath)) {
        // If the document does not match one of the configured file globs, set validate=false and done.
        const stringPath = docPath;
        if (configuration.validateFiles &&
          configuration.validateFiles.length > 0 &&
          !configuration.validateFiles.some((value: string) => new Minimatch(value, { matchBase: true }).match(stringPath))) {
          connection.console.log(`File ${document.uri} doesn't match any of the specified file globs; skipping.`);
          settings.validate = false;
          return settings;
        }

        let rulesetFile: string | null;

        // Probing logic:
        //  Workspace mode:
        //    If rulesetFile => Probe for it. Non existent => log the full path. Otherwise use it
        //    Try find a default at the root. Non existent => log a message. Otherwise use it.
        //  Standalone mode:
        //    Try find a default next to the opened file. Non existent => log a message. Otherwise use it.
        //  Open topics:
        //    Should we default to oas when nothing is found?

        if (configuration.rulesetFile) {
          // A ruleset was specified, use that if it exists (relative to workspace).
          if (configuration.workspaceFolder) {
            // Calculate the absolute path to the ruleset.
            rulesetFile = path.resolve(getDocumentPath(configuration.workspaceFolder.uri) ?? '', configuration.rulesetFile);
          } else {
            // Somehow(?) there's no workspace path (maybe it's just an open file?) so... do our best.
            rulesetFile = configuration.rulesetFile;
          }
        } else {
          // Nothing configured, load the default (.spectral.yml in the same folder as the doc).
          rulesetFile = await getDefaultRulesetFile(path.dirname(stringPath));
        }

        if (rulesetFile && fs.existsSync(rulesetFile)) {
          // Only use the ruleset if we can find it. If we can't, it's not an
          // error - it could just be that the person doesn't have their default
          // rules in place or is working on setting things up.
          if (docPath === rulesetFile) {
            // Don't validate the ruleset with itself.
            settings.validate = false;
            return settings;
          }

          connection.sendNotification(StartWatcherNotification.type, { path: rulesetFile });
          try {
            settings.ruleset = await readRuleset(rulesetFile);
          } catch (err) {
            showErrorMessage(docPath, `Unable to read ruleset at ${rulesetFile}.`);
          }
        } else {
          // If there's no ruleset available, default to built-in rulesets.
          settings.ruleset = await readRuleset(Linter.builtInRulesets);
        }
      }

      return settings;
    });

  documentSettings.set(uri, resultPromise);
  return resultPromise;
}

/**
 * Registers for document events and starts listening for those events.
 */
function setupDocumentListener(): void {
  documents.listen(connection);

  documents.onDidOpen((event) => {
    resolveSettings(event.document).then((settings) => {
      if (!settings.validate || settings.run !== 'onSave') {
        return;
      }
      messageQueue.addNotificationMessage(ValidateNotification.type, event.document, event.document.version);
    });
  });

  documents.onDidChangeContent((event) => {
    resolveSettings(event.document).then((settings) => {
      if (!settings.validate || settings.run !== 'onType') {
        return;
      }
      messageQueue.addNotificationMessage(ValidateNotification.type, event.document, event.document.version);
    });
  });

  documents.onDidSave((event) => {
    resolveSettings(event.document).then((settings) => {
      if (!settings.validate || settings.run !== 'onSave') {
        return;
      }
      messageQueue.addNotificationMessage(ValidateNotification.type, event.document, event.document.version);
    });
  });

  documents.onDidClose((event) => {
    resolveSettings(event.document).then((settings) => {
      const uri = event.document.uri;
      documentSettings.delete(uri);
      if (settings.validate) {
        // Clear any diagnostics associated with the document that closed.
        connection.sendDiagnostics({ uri: uri, diagnostics: [] });
      }
    });
  });
}

/**
 * Pops up toast to say something bad happened, directs the user to a logged console message.
 * @param {string} uri The document being validated when the error occurred.
 * @param {any} err The error that occurred.
 */
function showErrorMessage(uri: string, err: any): void {
  connection.window.showErrorMessage(`Spectral: An error occurred while validating ${uri}. Please see the 'Spectral' output channel for details.`);
  connection.console.error(`An error occurred while validating document ${uri}: ${err}`);
}

/**
 * Validates a single document with Spectral and presents the results to VS Code as diagnostics.
 * @param {TextDocument} document - The document to validate.
 * @return {Thenable<void>} A promise to await completion.
 */
function validate(document: TextDocument): Thenable<void> {
  return resolveSettings(document).then(async (settings) => {
    if (!settings.validate) {
      return;
    }
    try {
      const results = await linter.lint(document, settings.ruleset);
      // Send diagnostics with the results to the client. If there aren't any
      // results, it means the document was ignored or is valid - send an empty
      // array of results to ensure any existing issues are cleared.
      const diagnostics: Diagnostic[] = [];
      if (results.length > 0) {
        results.forEach((result) => {
          const diagnostic = makeDiagnostic(result);
          diagnostics.push(diagnostic);
        });
      }
      connection.sendDiagnostics({ uri: document.uri, diagnostics });
    } catch (err) {
      showErrorMessage(document.uri, err);
    }
  });
}

// Log uncaught exceptions to the console.
process.on('uncaughtException', (error: any) => {
  let message: string | undefined;
  if (error) {
    if (typeof error.stack === 'string') {
      message = error.stack;
    } else if (typeof error.message === 'string') {
      message = error.message;
    } else if (typeof error === 'string') {
      message = error;
    }
    if (message === undefined || message.length === 0) {
      try {
        message = JSON.stringify(error, undefined, 4);
      } catch (e) {
        // Should not happen.
      }
    }
  }
  // eslint-disable-next-line no-console
  console.error('Uncaught exception received.');
  if (message) {
    // eslint-disable-next-line no-console
    console.error(message);
  }
});

// When a notification to validate a document comes in, run the validation procedure.
messageQueue.onNotification(ValidateNotification.type, (document) => {
  validate(document);
}, (document): number => {
  return document.version;
});

// Configuration settings got updated; reset and revalidate.
messageQueue.registerNotification(DidChangeConfigurationNotification.type, (_params) => {
  environmentChanged();
});

// The whole workspace changed; reset and revalidate.
messageQueue.registerNotification(DidChangeWorkspaceFoldersNotification.type, (_params) => {
  environmentChanged();
});

// One of the watched ruleset files changed; reset and revalidate.
messageQueue.registerNotification(DidChangeWatchedFilesNotification.type, (_params) => {
  environmentChanged();
});

connection.onInitialize((_params: InitializeParams, _cancel, progress: WorkDoneProgress) => {
  progress.begin('Initializing Spectral Server');
  documents = new TextDocuments(TextDocument);
  setupDocumentListener();
  progress.done();
  return {
    capabilities: {
      textDocumentSync: {
        openClose: true,
        change: TextDocumentSyncKind.Full,
        willSaveWaitUntil: false,
        save: {
          includeText: false,
        },
      },
    },
  };
});

connection.onInitialized(() => {
  connection.client.register(DidChangeConfigurationNotification.type, undefined);
  connection.client.register(DidChangeWorkspaceFoldersNotification.type, undefined);
});

connection.listen();
