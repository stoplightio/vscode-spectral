import * as Spectral from '@stoplight/spectral';
import {
  isJSONSchema,
  isJSONSchemaDraft2019_09,
  isJSONSchemaDraft4,
  isJSONSchemaDraft6,
  isJSONSchemaDraft7,
  isJSONSchemaLoose,
  isOpenApiv2,
  isOpenApiv3,
} from '@stoplight/spectral';
import { dirname } from 'path';
import * as vscode from 'vscode';
import { httpAndFileResolver } from './resolver';

export class Linter {
  // configToLinterCache is keyed on a string to avoid needing object identity
  private configToLinterCache = new Map<string, Spectral.Spectral>();
  private documentToConfigCache = new Map<vscode.Uri, vscode.Uri>();

  private async findClosestConfig(document: vscode.TextDocument) {
    let configs: vscode.Uri[] = [];
    const root = vscode.workspace.getWorkspaceFolder(document.uri);
    if (root && root.uri.scheme === 'file') {
      const documentContainer = dirname(document.uri.fsPath);
      configs = await vscode.workspace.findFiles(
        new vscode.RelativePattern(root, '**/spectral.{json,yml,yaml}'),
        '**/node_modules/**',
      );
      configs.concat(
        await vscode.workspace.findFiles(
          new vscode.RelativePattern(root, '**/.spectral.{json,yml,yaml}'),
          '**/node_modules/**',
        ),
      );
      // sort configs by number of directory components
      configs.sort((a, b) => {
        const componentsA = a.path.split('/').length;
        const componentsB = b.path.split('/').length;
        if (componentsA < componentsB) return -1;
        if (componentsB > componentsA) return +1;
        return 0;
      });
      const parents = configs.filter(uri => {
        const container = dirname(uri.fsPath);
        return documentContainer.indexOf(container) >= 0;
      });
      if (parents.length) {
        return parents.pop();
      }
    }
    return vscode.Uri.parse('spectral:oas');
  }
  public purgeCaches() {
    this.configToLinterCache.clear();
    this.documentToConfigCache.clear();
    return true;
  }
  public purgeDocumentUri(uri: vscode.Uri) {
    this.documentToConfigCache.delete(uri);
    return true;
  }
  public getLinter = (document: vscode.TextDocument) => {
    return new Promise<Spectral.Spectral>(async (resolve, reject) => {
      let config = this.documentToConfigCache.get(document.uri);
      if (!config) {
        config = await this.findClosestConfig(document);
        this.documentToConfigCache.set(document.uri, config!);
      }
      const cached = this.configToLinterCache.get(config!.toString());
      if (cached) {
        return resolve(cached);
      }
      const linter = new Spectral.Spectral({ resolver: httpAndFileResolver });
      linter.registerFormat('oas2', isOpenApiv2);
      linter.registerFormat('oas3', isOpenApiv3);
      linter.registerFormat('json-schema', isJSONSchema);
      linter.registerFormat('json-schema-loose', isJSONSchemaLoose);
      linter.registerFormat('json-schema-draft4', isJSONSchemaDraft4);
      linter.registerFormat('json-schema-draft6', isJSONSchemaDraft6);
      linter.registerFormat('json-schema-draft7', isJSONSchemaDraft7);
      linter.registerFormat('json-schema-2019-09', isJSONSchemaDraft2019_09);
      const ruleset = config!.scheme === 'file' ? config!.fsPath : config!.toString();
      linter
        .loadRuleset(ruleset)
        .then(() => {
          this.configToLinterCache.set(config!.toString(), linter);
          resolve(linter);
        })
        .catch(ex => {
          reject(ex);
        });
    });
  };
}
