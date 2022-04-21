import { createRulesetFunction } from '@stoplight/spectral-core';

export default createRulesetFunction({
  input: null,
  options: {
    type: 'object',
    additionalProperties: false,
    properties: {
      value: true,
    },
    required: ['value'],
  },
}, (input, { value }) => {
  if (input !== value) {
    return [
      {
        message: `${input} must match ${value}`,
      },
    ];
  }
});
