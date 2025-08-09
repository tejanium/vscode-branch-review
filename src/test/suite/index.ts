import * as path from 'path';
import * as Mocha from 'mocha';
import * as fs from 'fs';

export function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
  });

  const testsRoot = path.resolve(__dirname, '..');

  return new Promise((c, e) => {
    try {
      // Manually add our test file
      const testFile = path.resolve(testsRoot, 'commentStorage.test.js');
      if (fs.existsSync(testFile)) {
        mocha.addFile(testFile);
      }

      // Run the mocha test
      mocha.run((failures: number) => {
        if (failures > 0) {
          e(new Error(`${failures} tests failed.`));
        } else {
          c();
        }
      });
    } catch (err) {
      console.error(err);
      e(err);
    }
  });
}
