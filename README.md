# <img src="img/misti.svg" alt="Misti Logo" width="32"/> Misti
Misti is a static analysis tool designed for smart contracts on the [TON blockchain](https://ton.org/) written in [Tact](https://tact-lang.org/).

#### Features
- **Code Analysis**: Built-in suite of [38 detectors](https://nowarp.io/tools/misti/docs/next/detectors) for identifying security vulnerabilities and anti-patterns.
- **CI/CD Integration**:
  [Integrate](https://nowarp.io/tools/misti/docs/tutorial/ci-cd) Misti into your CI/CD pipeline to ensure continuous code quality checks.
- **Custom Detectors**: Create [custom detectors](https://nowarp.io/tools/misti/docs/hacking/custom-detector) to solve specific problems in your code or to provide a thorough security review if you are an auditor.

## Getting Started
1. *(optional)* [Install Soufflé](https://souffle-lang.github.io/install) to enable more built-in detectors.
2. Install Misti:
```bash
npm install -g @nowarp/misti
```

3. Run Misti by specifying a Tact contract, project config, or directory to check:
```bash
misti path/to/src/contracts
```

See [Misti Configuration](https://nowarp.io/tools/misti/docs/tutorial/getting-started/) for available options, or [Developing Misti](https://nowarp.io/tools/misti/docs/next/hacking/developing-misti) for advanced instructions. Blueprint users should refer to the [appropriate documentation page](https://nowarp.io/tools/misti/docs/tutorial/blueprint).

## Resources
- **[nowarp.io](https://nowarp.io)**: We are doing other TON Security stuff beyond Misti.
- **[Documentation](https://nowarp.io/tools/misti/docs)**: Comprehensive guide on detectors, architecture, and development.
- **[API Reference](https://nowarp.io/api/misti/)**: Useful for contributors or developers creating custom detectors.
- **[Blueprint Plugin](https://github.com/nowarp/blueprint-misti)**: A plugin for the Blueprint Framework to enhance your workflow.
- **[Community Chat](https://t.me/tonsec_chat)**: Join the conversation and get help with Misti-related questions.
