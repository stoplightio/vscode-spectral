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

const DEFAULT_RULESET = 'spectral:oas'; // fallback value, if changed update package.json

export class LinterCache {
  // configToLinterCache is keyed on a string to avoid needing object identity
  private configToLinterMap = new Map<string, Spectral.Spectral>();
  private documentToConfigMap = new Map<vscode.Uri, vscode.Uri>();

  private configs: vscode.Uri[] = [];

  private async findClosestConfig(uri: vscode.Uri) {
    if (this.configs.length === 0) {
      const root = vscode.workspace.getWorkspaceFolder(uri);
      if (root && root.uri.scheme === 'file') {
        this.configs = await vscode.workspace.findFiles(
          new vscode.RelativePattern(root, '**/spectral.{json,yml,yaml}'),
          '**/node_modules/**',
        );
        this.configs = this.configs.concat(
          await vscode.workspace.findFiles(
            new vscode.RelativePattern(root, '**/.spectral.{json,yml,yaml}'),
            '**/node_modules/**',
          ),
        );
        // sort configs by number of directory components
        this.configs.sort((a, b) => {
          const componentsA = a.path.split('/').length;
          const componentsB = b.path.split('/').length;
          if (componentsA < componentsB) return -1;
          if (componentsB > componentsA) return +1;
          return 0;
        });
      }
    }
    const documentContainer = dirname(uri.fsPath);
    const parents = this.configs.filter(parentUri => {
      const container = dirname(parentUri.fsPath);
      return documentContainer.indexOf(container) >= 0;
    });
    if (parents.length) {
      return parents.pop();
    }
    return vscode.Uri.parse(vscode.workspace.getConfiguration('spectral').get('defaultRuleset') || DEFAULT_RULESET);
  }
  public purgeCaches() {
    this.configToLinterMap.clear();
    this.documentToConfigMap.clear();
    this.configs = [];
    return true;
  }
  public purgeDocumentUri(uri: vscode.Uri) {
    this.documentToConfigMap.delete(uri);
    // if no documents point to a config any more, we could purge the associated
    // Spectral instance, at the cost of maybe needing to regenerate it later
    return true;
  }
  public getLinter = (uri: vscode.Uri) => {
    return new Promise<Spectral.Spectral>(async (resolve, reject) => {
      let config = this.documentToConfigMap.get(uri);
      if (!config) {
        config = await this.findClosestConfig(uri);
        this.documentToConfigMap.set(uri, config!);
      }
      const cached = this.configToLinterMap.get(config!.toString());
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
          this.configToLinterMap.set(config!.toString(), linter);
          resolve(linter);
        })
        .catch(ex => {
          reject(ex);
        });
    });
  };
}
