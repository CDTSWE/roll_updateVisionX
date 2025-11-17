// Simple test to verify colored console output works
const consoleUtils = require('./src/utils/consoleUtils');

consoleUtils.title("Testing Colored Console Output");
consoleUtils.info("This is an info message");
consoleUtils.success("This is a success message");
consoleUtils.warn("This is a warning message");
consoleUtils.error("This is an error message");
consoleUtils.status("This is a status message");
consoleUtils.skipped("This is a skipped message");
consoleUtils.debug("This is a debug message");
consoleUtils.section("This is a section header");

console.log("\nIf you see colors above, the consoleUtils are working properly!");