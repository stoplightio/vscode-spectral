import {
  FormatLookup,
  Spectral,
  isJSONSchema,
  isJSONSchemaDraft2019_09, // eslint-disable-line
  isJSONSchemaDraft4,
  isJSONSchemaDraft6,
  isJSONSchemaDraft7,
  isJSONSchemaLoose,
  isOpenApiv2,
  isOpenApiv3,
} from '@stoplight/spectral';

// TODO: Leverage https://github.com/stoplightio/spectral/pull/1156/files#diff-b91c6e8fe452fcee80f15d196282d253

/**
 * Mapping of format ID to detector function that can determine if a given
 * document is of that type.
 */
const allFormats: Array<[string, FormatLookup]> = [
  ['oas2', isOpenApiv2],
  ['oas3', isOpenApiv3],
  ['json-schema', isJSONSchema],
  ['json-schema-loose', isJSONSchemaLoose],
  ['json-schema-draft4', isJSONSchemaDraft4],
  ['json-schema-draft6', isJSONSchemaDraft6],
  ['json-schema-draft7', isJSONSchemaDraft7],
  ['json-schema-2019-09', isJSONSchemaDraft2019_09] // eslint-disable-line
];

/**
 * Registers the default set of formats to process with Spectral.
 * @param {Spectral} spectral - The Spectral linter instance with which formats should be registered.
 */
export function registerFormats(spectral: Spectral): void {
  for (const [format, lookup] of allFormats) {
    // Each document type that Spectral can lint gets registered with detectors.
    spectral.registerFormat(format, (document) => lookup(document));
  }
}
