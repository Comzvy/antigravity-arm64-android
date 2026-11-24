# Core Runtime Module (`modules/core`)

Manages extraction, ELF64/AArch64 validation, glibc dependency packaging, Linux environment shims, and SHA-256 manifest verification for the Antigravity **v2.35.0** `language_server` binary.

## Directory Structure

| Path | Responsibility |
| :--- | :--- |
| `spec/` | `version.env` (`CORE_VERSION=2.35.0`, `go1.28-20261102-RC01`), `checksums.json` (expected pristine SHA-256 `eac9fe86ffcdd807af0843fd18bd2735e38884907bbdc3535641932fe9279f0b`, `216,421,040` bytes), `glibc_deps.list`, `shims.list`. |
| `pristine/` | Stores upstream `language_server.tar.gz` (gitignored; hydrated automatically in CI from `2.35.0-6394266482769920/unsigned/language_server-linux-arm64`). |
| `unpack/` | `archive_detector.py`, `extractor.py`, `permissions.py` for extracting and preparing the ARM64 ELF binary. |
| `validate/` | `elf_header.py`, `elf_arch.py` (`EM_AARCH64`), `elf_compat.py`, `checksum_checker.py`, and end-to-end `verify_pipeline.py`. |
| `manifest/` | Streaming SHA-256 `file_hasher.py`, `manifest_builder.py`, and `manifest_verifier.py` (`manifest.json`). |
| `bundle/` | `layout.py`, `pack_binaries.py`, `pack_libraries.py`, `pack_certs.py`, `pack_seed.py`, and orchestrator `assemble.py`. |
| `glibc/` | AArch64 `ld-linux-aarch64.so.1`, `libc.so.6`, `liblse_compat.so`, and base `etc/{hosts,resolv.conf,nsswitch.conf}`. |
| `certs/` & `seed/` & `shims/` | Root CA bundle (`ca-certificates.crt`), onboarding state seeds, and POSIX wrappers (`xdg-open`, `open`, `rish`). |
| `tests/` | `test_extractor.py`, `test_elf_validator.py`, `test_manifest.py`, `test_bundle.py`, `test_shims.py`, `run_all.sh`. |

## Verification

```bash
bash modules/core/tests/run_all.sh
python3 modules/core/validate/verify_pipeline.py
```
