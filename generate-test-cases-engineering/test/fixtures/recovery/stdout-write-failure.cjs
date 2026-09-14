'use strict';

process.stdout.write = function failStdoutWrite() {
  throw new Error('simulated stdout transport failure');
};
