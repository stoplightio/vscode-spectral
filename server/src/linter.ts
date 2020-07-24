/* eslint-disable require-jsdoc */
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  IRuleResult,
  Spectral,
  Parsers,
  Document as SpectralDocument,
  KNOWN_FORMATS,
  KNOWN_RULESETS,
  SPECTRAL_PKG_VERSION,
} from '@stoplight/spectral';
import { DEFAULT_REQUEST_OPTIONS } from '@stoplight/spectral/dist/request';
import { IRuleset } from '@stoplight/spectral/dist/types/ruleset';
import { URI } from 'vscode-uri';
import { createResolveHttp, resolveFile } from '@stoplight/json-ref-readers';
import { ICache } from '@stoplight/json-ref-resolver/types';
import { Resolver, Cache } from '@stoplight/json-ref-resolver';
import { RemoteConsole, TextDocuments } from 'vscode-languageserver';
import * as URIjs from 'urijs';

const buildFileResolver = (documents: TextDocuments<TextDocument>, console: RemoteConsole) => {
  return (ref: URIjs): Promise<unknown> => {
    console.log(`[DBG] documents.keys => ${JSON.stringify(documents.keys())}`);
    console.log(`[DBG] fileResolver.resolve => ${ref.toString()}`);
    const lookedUpUri = URI.file(ref.toString());
    console.log(`[DBG] lookedUpUri => ${lookedUpUri}`);
    const lookedUpUriStr = lookedUpUri.toString();

    for (const key of documents.keys()) {
      console.log(`[DBG] uri => ${key}`);
      console.log(`[DBG] key ==? lookedUpUri => ${key === lookedUpUriStr}`);

      if (key === lookedUpUriStr) {
        const doc = documents.get(lookedUpUriStr);

        if (doc === undefined) {
          throw new Error(`Unexpected undefined doc '${lookedUpUriStr}'`);
        }

        return Promise.resolve(doc.getText());
      }
    }

    return resolveFile(ref);
  };
};

export function createHttpAndFileResolver(
  documents: TextDocuments<TextDocument>,
  uriCache: ICache,
  console: RemoteConsole
): Resolver {
  const resolveHttp = createResolveHttp({ ...DEFAULT_REQUEST_OPTIONS });

  return new Resolver({
    resolvers: {
      https: { resolve: resolveHttp },
      http: { resolve: resolveHttp },
      file: { resolve: buildFileResolver(documents, console) },
    },
    uriCache,
  });
}

const useNimma = true;

const buildSpectralInstance = (documents: TextDocuments<TextDocument>, uriCache: ICache, console: RemoteConsole): Spectral => {
  const spectral = new Spectral({
    resolver: createHttpAndFileResolver(documents, uriCache, console),
    useNimma,
  });

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
  static version = `${SPECTRAL_PKG_VERSION}[useNimma=${useNimma}]`;
  static builtInRulesets = KNOWN_RULESETS;

  private readonly spectral: Spectral;
  private readonly cache: ICache;

  constructor(documents: TextDocuments<TextDocument>, console: RemoteConsole) {
    this.cache = new Cache();
    this.spectral = buildSpectralInstance(documents, this.cache, console);
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

    this.cache.purge();
    return this.spectral.run(doc, { ignoreUnknownFormat: true, resolve: { documentUri: file } });
  }
}
