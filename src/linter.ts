import * as vscode from 'vscode';
import * as Spectral from '@stoplight/spectral';
import {
  isOpenApiv2,
  isOpenApiv3,
  isJSONSchema,
  isJSONSchemaLoose,
  isJSONSchemaDraft4,
  isJSONSchemaDraft6,
  isJSONSchemaDraft7,
  isJSONSchemaDraft2019_09
} from '@stoplight/spectral';
import { httpAndFileResolver } from './resolver';

export const getLinter = function (document: vscode.TextDocument) {
  return new Promise<Spectral.Spectral>(function (resolve, reject) {
    const linter = new Spectral.Spectral({ resolver: httpAndFileResolver });
    linter.registerFormat('oas2', isOpenApiv2);
    linter.registerFormat('oas3', isOpenApiv3);
    linter.registerFormat('json-schema', isJSONSchema);
    linter.registerFormat('json-schema-loose', isJSONSchemaLoose);
    linter.registerFormat('json-schema-draft4', isJSONSchemaDraft4);
    linter.registerFormat('json-schema-draft6', isJSONSchemaDraft6);
    linter.registerFormat('json-schema-draft7', isJSONSchemaDraft7);
    linter.registerFormat('json-schema-2019-09', isJSONSchemaDraft2019_09);
    linter.loadRuleset('spectral:oas')
      .then(() => {
        resolve(linter);
      })
      .catch(ex => {
        reject(ex);
      });
  });
};
