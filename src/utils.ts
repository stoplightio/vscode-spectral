import { IRuleResult } from "@stoplight/spectral";

export const groupWarningsBySource = function(warnings: IRuleResult[], defaultSource: string) {
    const resultBag = new Map<string, IRuleResult[]>();
    resultBag.set(defaultSource, []);
    warnings.forEach(function(warning){
        const source = warning.source || defaultSource;
        if (!resultBag.has(source)) {
          resultBag.set(source, []);
        }
        resultBag.get(source)!.push(warning);
    });
    return resultBag;
};
