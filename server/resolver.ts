import { createResolveHttp, resolveFile } from '@stoplight/json-ref-readers';
import { Resolver } from '@stoplight/json-ref-resolver';

const httpResolver = createResolveHttp({});

/**
 * Aggregate reference resolver that handles HTTP, HTTPS and file protocols.
 */
export const refResolver = new Resolver({
  resolvers: {
    https: { resolve: httpResolver },
    http: { resolve: httpResolver },
    file: { resolve: resolveFile },
  },
});
