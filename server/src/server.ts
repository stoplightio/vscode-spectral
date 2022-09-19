/* eslint-disable require-jsdoc */
import * as fs from 'fs';
import * as path from 'path';
import { Minimatch } from 'minimatch';
import {
  DidChangeConfigurationNotification,
  DidChangeWatchedFilesNotification,
  DidChangeWorkspaceFoldersNotification,
  InitializeParams,
  ProposedFeatures,
  TextDocumentSyncKind,
  TextDocuments,
  createConnection,
  PublishDiagnosticsParams,
} from 'vscode-languageserver';
import { string as isString } from 'vscode-languageserver/lib/utils/is';
import { WorkDoneProgress } from 'vscode-languageserver/lib/progress';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { URI } from 'vscode-uri';
import { Ruleset } from '@stoplight/spectral-core';
import { asyncapi, oas } from '@stoplight/spectral-rulesets';
import { fetch } from '@stoplight/spectral-runtime';
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
import { makePublishDiagnosticsParams } from './util';

/**
 * The connection on which communication between the extension (client) and the
 * language server occurs.
 */
const connection = createConnection(ProposedFeatures.all);

/**
 * Cache of lint-related settings per document.
 */
const documentSettings: Map<string, Thenable<TextDocumentSettings>> = new Map<string, Thenable<TextDocumentSettings>>();

const seenDependencies: Map<string, string> = new Map<string, string>();

/**
 * Message queue that ensures validation doesn't occur on stale content.
 */
const messageQueue: BufferedMessageQueue = new BufferedMessageQueue(connection);

/**
 * Spectral linter.
 */
let linter: Linter;

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
  seenDependencies.clear();
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
  if (isString(documentOrUri)) {
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
 * Determines the default Spectral ruleset, which is assumed to be in the workspace folder.
 * @param {string | undefined} dirpath - The location of the workspace for which the path should be determined.
 * @return {Promise<string|undefined>} A string value with the folder path if it can be determined; or undefined if not.
 */
async function getDefaultRulesetFile(dirpath: string | undefined): Promise<string | undefined> {
  if (!dirpath) return;
  const workspaceFolderFs = getDocumentPath(dirpath);
  if (!workspaceFolderFs) return;
  try {
    for (const filename of await fs.promises.readdir(workspaceFolderFs)) {
      if (Ruleset.isDefaultRulesetFile(filename)) {
        return path.join(workspaceFolderFs, filename);
      }
    }
  } catch {
    return;
  }
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
      if (!isString(docPath)) {
        return settings;
      }

      // If the document does not match one of the configured file globs, set validate=false and done.
      if (configuration.validateFiles && configuration.validateFiles.length > 0) {
        const positiveGlobs = [];
        const negativeGlobs = [];
        for (const globEntry of configuration.validateFiles) {
          const miniMatch = new Minimatch(globEntry, { matchBase: true });
          if (miniMatch.negate) {
            miniMatch.options.flipNegate = true;
            negativeGlobs.push(miniMatch);
          } else {
            positiveGlobs.push(miniMatch);
          }
        }

        if (positiveGlobs.length > 0 && !positiveGlobs.some((glob) => glob.match(docPath))) {
          connection.console.log(`File ${document.uri} doesn't match any of the specified positive file globs; skipping.`);
          settings.validate = false;
          return settings;
        }
        // ignore if any negative globs match
        if (negativeGlobs.some((glob) => glob.match(docPath))) {
          connection.console.log(`File ${document.uri} matches a specified negative file glob; skipping.`);
          settings.validate = false;
          return settings;
        }
      }

      let rulesetFile: string | null = null;

      // Probing logic:
      //  Workspace mode:
      //    If rulesetFile => Probe for it. Non existent => log the full path. Otherwise use it
      //    Try find a default at the root. Non existent => log a message. Otherwise use it.
      //  Standalone mode:
      //    Try find a default next to the opened file. Non existent => log a message. Otherwise use it.
      //  Open topics:
      //    Should we default to oas when nothing is found?

      connection.console.log(`Using ruleset file: ${configuration.rulesetFile}.`);

      let rulesetFileIsUrl = false;
      if (configuration.rulesetFile) {
        // if ruleset is a uri with http/https scheme then we will resolve it later
        const ruleSetUri: URI = URI.parse(configuration.rulesetFile);
        rulesetFileIsUrl = URI.isUri(ruleSetUri) && (ruleSetUri.scheme === 'https' || ruleSetUri.scheme === 'http');

        if (configuration.workspaceFolder && !rulesetFileIsUrl) {
          // A ruleset was specified, use that if it exists (relative to workspace).
          // Calculate the absolute path to the ruleset.
          rulesetFile = path.resolve(getDocumentPath(configuration.workspaceFolder.uri) ?? '', configuration.rulesetFile);
        } else {
          // Somehow(?) there's no workspace path (maybe it's just an open file?) so... do our best.
          rulesetFile = configuration.rulesetFile;
        }
      } else {
        // Nothing configured, load the default (.spectral.yml in the same folder as the workspace).
        rulesetFile = (await getDefaultRulesetFile(configuration.workspaceFolder?.uri)) ?? null;
      }

      if (rulesetFile && (rulesetFileIsUrl || fs.existsSync(rulesetFile))) {
        // Only use the ruleset if we can find it. If we can't, it's not an
        // error - it could just be that the person doesn't have their default
        // rules in place or is working on setting things up.
        if (docPath === rulesetFile) {
          // Don't validate the ruleset with itself.
          settings.validate = false;
          return settings;
        }

        if (!rulesetFileIsUrl) {
          connection.sendNotification(StartWatcherNotification.type, { path: rulesetFile });
        }
        try {
          const { ruleset, dependencies } = await Linter.loadRuleset(rulesetFile, { fs, fetch });
          for (const dependency of dependencies) {
            connection.sendNotification(StartWatcherNotification.type, { path: dependency });
          }

          settings.ruleset = ruleset;
        } catch (err) {
          showErrorMessage(docPath, `Unable to read ruleset at ${rulesetFile}. ${err}`);
        }
      } else {
        // If there's no ruleset available, default to built-in rulesets.
        settings.ruleset = new Ruleset({
          extends: [oas, asyncapi],
        });
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
      seenDependencies.delete(uri);
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

const findRoot = (document: TextDocument): TextDocument => {
  connection.console.log(`Scan triggered file ${document.uri}.`);

  const rootUri = seenDependencies.get(document.uri);

  if (rootUri === undefined) {
    connection.console.log(`Linting root file ${document.uri}.`);
    return document;
  }

  connection.console.log(`Found root file ${rootUri}.`);

  const rootDocument = documents.get(rootUri);

  if (rootDocument === undefined) {
    // May happen when the root document has been dropped or renamed
    throw new Error(`Unable to build a document from root '${rootUri}'`);
  }

  connection.console.log(`Linting inferred root file ${rootDocument.uri}.`);

  return rootDocument;
};

async function lintDocumentOrRoot(document: TextDocument, ruleset: Ruleset | undefined, currentDependencies: Map<string, string>): Promise<[PublishDiagnosticsParams[], [string, string][]]> {
  const rootDocument = findRoot(document);

  const results = await linter.lint(rootDocument, ruleset);

  const knownDeps = new Set<string>();

  if (document.uri !== rootDocument.uri) {
    knownDeps.add(document.uri);
  }

  for (const dep of currentDependencies) {
    if (dep[1] !== rootDocument.uri) {
      continue;
    }

    knownDeps.add(dep[0]);
  }

  connection.console.log(`[DBG] lintDocumentOrRoot. knownDeps=${JSON.stringify([...knownDeps])}`);

  const pdps = makePublishDiagnosticsParams(rootDocument.uri, [...knownDeps], results);
  const deps = pdps.filter((e) => e.uri !== rootDocument.uri).map<[string, string]>((e) => [e.uri, rootDocument.uri]);

  return [pdps, deps];
}

const dump = (input: Map<string, string>): void => {
  for (const [key, value] of input.entries()) {
    connection.console.log(key + ' $reffed by ' + value);
  }
  connection.console.log('-----');
};

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
      connection.console.log(`seenDependencies (before): ${seenDependencies.size}.`);
      dump(seenDependencies);

      const [pdps, deps] = await lintDocumentOrRoot(document, settings.ruleset, seenDependencies);

      connection.console.log(`pdps: ${JSON.stringify(pdps, null, 2)}.`);
      connection.console.log(`deps: ${JSON.stringify(deps, null, 2)}.`);

      for (const [dep, root] of deps) {
        seenDependencies.set(dep, root);
      }

      connection.console.log(`seenDependencies (after): ${seenDependencies.size}.`);
      dump(seenDependencies);

      // Send diagnostics with the results to the client. If there aren't any
      // results, it means the document was ignored or is valid - send an empty
      // array of results to ensure any existing issues are cleared.
      pdps.forEach((pdp) => connection.sendDiagnostics(pdp));
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
  linter = new Linter(documents, connection.console);

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

