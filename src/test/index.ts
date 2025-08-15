import * as path from 'path';
import * as Mocha from 'mocha';
import * as glob from 'glob';

/**
 * Main test entry point for VSCode extension testing
 *
 * This file is used by VSCode's test runner to execute all tests.
 * It discovers and runs all test files in the test directory.
 */
export function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 15000, // 15 second timeout for integration tests
    reporter: 'spec',
    slow: 2000, // Mark tests as slow if they take more than 2 seconds
  });

  const testsRoot = path.resolve(__dirname);

  return new Promise((resolve, reject) => {
    // Find all test files
    glob('**/**.test.js', { cwd: testsRoot }, (err, files) => {
      if (err) {
        return reject(err);
      }

      // Add files to the test suite
      files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

      try {
        // Run the mocha test
        mocha.run(failures => {
          if (failures > 0) {
            reject(new Error(`${failures} tests failed.`));
          } else {
            console.log('All tests passed!');
            resolve();
          }
        });
      } catch (err) {
        console.error('Error running tests:', err);
        reject(err);
      }
    });
  });
}
