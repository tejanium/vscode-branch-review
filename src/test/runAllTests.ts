import * as path from 'path';
import * as Mocha from 'mocha';
import * as glob from 'glob';

/**
 * Standalone test runner for Branch Review extension
 *
 * This runner executes all integration tests WITHOUT spawning VSCode,
 * providing comprehensive coverage of the extension's behavior in a
 * pure Node.js environment.
 */
async function runTests(): Promise<void> {
  console.log('🧪 Running Branch Review Integration Tests...');
  console.log('📁 Test directory:', __dirname);

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
        console.error('❌ Error finding test files:', err);
        return reject(err);
      }

      if (files.length === 0) {
        console.log('⚠️  No test files found in:', testsRoot);
        return resolve();
      }

      console.log(`📋 Found ${files.length} test files:`);
      files.forEach(f => console.log(`   - ${f}`));
      console.log('');

      // Add files to the test suite
      files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

      try {
        // Run the mocha test
        mocha.run(failures => {
          if (failures > 0) {
            console.log(`\n❌ ${failures} test(s) failed.`);
            reject(new Error(`${failures} tests failed.`));
          } else {
            console.log('\n✅ All tests passed!');
            console.log('🎉 Branch Review extension is working correctly.');
            resolve();
          }
        });
      } catch (err) {
        console.error('❌ Error running tests:', err);
        reject(err);
      }
    });
  });
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Test execution failed:', error.message);
      process.exit(1);
    });
}

export { runTests as run };
