module.exports = (input, { value }) => {
  if (input !== value) {
    return [
      {
        message: `${input} must match ${value}`,
      },
    ];
  }
};
