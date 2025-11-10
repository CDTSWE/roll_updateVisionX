const readline = require("readline");

class AskHelper {
  constructor(input = process.stdin, output = process.stdout) {
    this.rl = readline.createInterface({ input, output });
  }

  ask(question) {
    return new Promise((resolve) => {
      this.rl.question(question, resolve);
    });
  }

  close() {
    this.rl.close();
  }
}

module.exports = AskHelper;
