# Misti

Misti is a static analysis tool for [Tact](https://tact-lang.org/) smart contracts.

## Installation
1. Install Soufflé according to [the official installation instruction](https://souffle-lang.github.io/install).

2. Clone the repository and install dependencies:
```bash
git clone https://github.com/nowarp/misti
cd misti
yarn install && yarn build
```

## Quick Start
Run Misti by specifying a Tact project configuration:
```bash
./bin/misti test/projects/simple/tactConfig.json
```

Or execute it for a single contract using the default configuration:
```bash
./bin/misti test/projects/simple/contract.tact
```

## Documentation
For detailed configuration and usage instructions, visit the [Misti Documentation](https://nowarp.github.io/docs/misti/).
