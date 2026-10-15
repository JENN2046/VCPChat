# CodeSearcher native source provenance

This source accompanies the VCPChat update candidate, not a VCPToolBox update.

## Frozen origin

- VCPChat upstream: `3cde846645bab109dfb3b635a43287e63e2ed294`.
- Corresponding official source: `lioensky/VCPToolBox@17a220a4c39a415c0cde77b63c552886fafac8ca`, `Plugin/CodeSearcher/src/`.
- The upstream CodeSearcher executable in both repositories has Git blob `ead372340b8785c7a41f366d9a66a75e9b2547aa`. This is provenance evidence, not a reproducible-build assertion.
- Original Git blobs: Cargo.toml `3aa38b8b418042231b0f862721147f37de047e6c`; Cargo.lock `adfb07da6812003f35f3fe00d1e048cd5e3e3f1a`; src/main.rs `5fb7185c0af95531bddfa4f529bf55fc8de5eaaf`.

## Local adaptation

Explicit `include` overrides the extension whitelist for negative-only filters as well as positive filters. The fallback to configured extensions now applies only when no effective include exists. Positive include restrictions, exclusion ordering, sensitive-file rejection, ignored directories, and explicit single-file behavior remain unchanged.

Five unit tests cover absent/empty includes, negative-only rules, positive rules, mixed rules/order, and invalid patterns.

## Windows build and verification

Rust `1.89.0`, `x86_64-pc-windows-msvc`, existing MSVC Build Tools, isolated Cargo/target/temp directories:

```text
cargo test --release --locked --jobs 2
cargo build --release --locked --jobs 2
```

- Unit tests: 5 passed, 0 failed.
- Actual Windows executable with synthetic fixtures: 15 passed, 0 failed.
- JavaScript bridge invoking the rebuilt executable with the same synthetic fixtures: 15 passed, 0 failed.
- Actual packaged ASAR bridge plus unpacked executable: 15 passed, 0 failed. Both executable lookup and child working directory use the physical `app.asar.unpacked` tree; source-checkout paths remain unchanged. Four path/package regression tests cover this adaptation.
- Cargo.lock SHA-256: `ccea9fabf6d7b07da5cc4a423efb1e67ef5ccf12633b3ef7d92a1355efaa9f3e`.
- Cargo.toml SHA-256: `fafa67f64e5f747c8461b263f0e21146f2b270c27fbe3b95deba67abe0bcdfeb`.
- Fixed src/main.rs SHA-256: `3a876e78da564b9eb28223d697e99ed747d6cfd97ece6d5964dba1023e712294` (exact build input bytes).
- Rebuilt Windows executable: 2,584,576 bytes; SHA-256 `d94d56024a0d02c57b6107bc9c8123c0bee8d2772e6961ed2a7c2d644ab27704`.

The executable is a candidate artifact only. No installation, deployment, upstream binary equivalence, or completion of the full VCPChat acceptance process is implied.
