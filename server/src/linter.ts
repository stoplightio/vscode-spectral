/* eslint-disable require-jsdoc */
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  IRuleResult,
  Spectral,
  Document as SpectralDocument,
  Ruleset,
} from '@stoplight/spectral-core';
import { URI } from 'vscode-uri';
import * as Parsers from '@stoplight/spectral-parsers';
import { createResolveHttp, resolveFile } from '@stoplight/json-ref-readers';
import { ICache } from '@stoplight/json-ref-resolver/types';
import { Resolver, Cache } from '@stoplight/json-ref-resolver';
import { runtime } from '@stoplight/spectral-ruleset-bundler/presets/runtime';
import { commonjs } from '@stoplight/spectral-ruleset-bundler/plugins/commonjs';
import { stdin } from '@stoplight/spectral-ruleset-bundler/plugins/stdin';
import type { IO } from '@stoplight/spectral-ruleset-bundler';
import { migrateRuleset } from '@stoplight/spectral-ruleset-migrator';
import * as path from '@stoplight/path';
import { RemoteConsole, TextDocuments } from 'vscode-languageserver';
import * as URIjs from 'urijs';
import { Plugin, rollup } from 'rollup';

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
  const resolveHttp = createResolveHttp();

  return new Resolver({
    resolvers: {
      https: { resolve: resolveHttp },
      http: { resolve: resolveHttp },
      file: { resolve: buildFileResolver(documents, console) },
    },
    uriCache,
  });
}

const buildSpectralInstance = (documents: TextDocuments<TextDocument>, uriCache: ICache, console: RemoteConsole): Spectral => {
  const spectral = new Spectral({
    resolver: createHttpAndFileResolver(documents, uriCache, console),
  });


  return spectral;
};

/**
 * Wrapper for the Spectral linter that runs linting against VS Code document
 * content in a manner similar to the Spectral CLI.
 */
export class Linter {
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
  public async lint(document: TextDocument, ruleset: Ruleset | undefined): Promise<IRuleResult[]> {
    // Unclear if we may have issues changing the ruleset on the shared Spectral
    // instance here. If so, we may need to store a Spectral instance per
    // document rather than using a single shared one via Linter.
    if (ruleset) {
      this.spectral.setRuleset(ruleset);
    } else {
      // No ruleset, so clear everything out.
      this.spectral.setRuleset({
        rules: {},
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
    return this.spectral.run(doc, { ignoreUnknownFormat: true });
  }

  static async loadRuleset(filepath: string, io: IO): Promise<{ dependencies: string[]; ruleset: Ruleset }> {
    let rulesetFile = filepath;
    const plugins: Plugin[] = [...runtime(io), commonjs()];

    if (/\.(json|ya?ml)$/.test(path.extname(filepath))) {
      rulesetFile = path.join(path.dirname(rulesetFile), '.spectral.js');
      plugins.unshift(stdin(await migrateRuleset(filepath, { format: 'esm', ...io }), rulesetFile));
    }

    const bundle = await rollup({
      input: rulesetFile,
      plugins,
      treeshake: false,
      watch: false,
      perf: false,
      onwarn(e, fn) {
        if (e.code === 'MISSING_NAME_OPTION_FOR_IIFE_EXPORT') {
          return;
        }

        fn(e);
      },
    });

    const outputChunk = (await bundle.generate({ format: 'iife', exports: 'auto' })).output[0];

    return {
      dependencies: Object.keys(outputChunk.modules).filter((m) => path.isAbsolute(m) && !path.isURL(m)),
      ruleset: new Ruleset(Function(`return ${outputChunk.code}`)(), {
        severity: 'recommended',
        source: rulesetFile,
      }),
    };
  }
}
