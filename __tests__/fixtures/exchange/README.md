# Synthetic cross-app backup fixtures

These six files were produced by the three applications' real export functions after this storage-safety update. They contain only synthetic records (교차 검증), a bootstrap test administrator, and PT-007. The encrypted fixture passphrase is `test-password`; it is not a production credential. Each application's backupInterop.test.ts imports all six files and checks note and account contents.

Historical formats are covered separately in storageSafety.test.ts. Regenerate these fixtures deliberately when changing the exchange contract; do not replace them solely to make a failing import test pass.
