#!/usr/bin/env node

if (process.env.CI === "true" || process.env.CHAY_SILENT_INSTALL === "1") {
  process.exit(0);
}

console.log(`
chay-runtime installed.

In your project, run:
  cr start

Optional direct chatbot rules:
  cr chat install

Then create a feature contract:
  cr go "Describe the feature"
`);
