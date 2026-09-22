const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: 'list',
    use: {
        ...devices['Desktop Chrome'],
        trace: 'on-first-retry'
    }
});
