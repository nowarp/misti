# Misti Detector Examples

This directory contains sample detectors that demonstrate the capabilities and usage of the Misti API. These examples serve as templates and guides for creating custom detectors for the Misti static analysis tool.

## Included Examples

- [Implicit Init](./implicit-init): This is a very simple detector that can be used as a starting template for writing your own detector. It showcases the basic structure and required elements of a Misti detector.

## Usage

Each detector in this directory is accompanied by its own set of tests. These tests can be used as a reference for understanding the expected behavior of the detectors and for developing tests for your custom detectors.

## Dynamic Loading

Detectors in this directory are designed to be dynamically loaded by the Misti driver. To use any of these example detectors or your custom detectors, specify the path to the TypeScript detector implementation in your Misti configuration file. This setup allows for easy integration and testing of new detectors.
