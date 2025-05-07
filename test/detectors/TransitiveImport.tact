import "./DuplicatedImport.tact"; // Bad: Transitive import of `NeverAccessedVariables`

import "@stdlib/ownable"; // OK: Explicitly imported => no warning after importing `DuplicatedImport`
import "@stdlib/ownable"; // OK: Duplicated import; no false positive
