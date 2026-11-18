"""
nosandbox.py - Disables desktop Linux exebox/sbox terminal sandboxing on Android.

Android's kernel/SELinux prohibits desktop user-namespace/seccomp_unotify sandboxes,
and launching sbox via selfexec fails with `libloader.so: invalid argument` when
language_server is booted through the glibc dynamic loader with --preload.

This patch:
1. Forces `b.cfg.NoSandbox = true` (1) inside `exebox.newBox` and branches directly
   to `exebox.(*Box).init` (in-process `urpc.Local` execution, skipping `initSbox`).
2. Forces `RunCommandHandler.isSandboxEnabled` to return `false` (0).
"""
from typing import Tuple, Dict, Any, List, Union

# 1. exebox.newBox (v2.33.0: 0x6139114 .. 0x613912c, 24 bytes):
#    str x1, [sp, #128]; mov x1, #1; strb w1, [sp, #39];
#    bl validateHostLoopbackPorts; cbnz x0, ...; ldr x0, [sp, #88]
# -> str x1, [sp, #128]; mov x1, #1; strb w1, [sp, #39];
#    ldr x2, [x0]; strb w1, [x2]; b 0x613916c (exebox.(*Box).init)
EXEBOX_CLEAN = bytes.fromhex("e14300f9e10340b2e19f00396c030094800900b5e02f40f9")
EXEBOX_PATCHED = bytes.fromhex("e14300f9e10340b2e19f0039020040f94100003911000014")

# 2. RunCommandHandler.isSandboxEnabled epilogue (0x6a2c100 .. 0x6a2c120, 32 bytes):
#    mov x0, x1 -> mov x0, xzr
SANDBOX_ENABLED_CLEAN = bytes.fromhex(
    "034840396300003642000037e1031faae00301aafd835ff8fe0744f8c0035fd6"
)
SANDBOX_ENABLED_PATCHED = bytes.fromhex(
    "034840396300003642000037e1031faae0031faafd835ff8fe0744f8c0035fd6"
)

PATTERNS = [
    ("exebox_newbox", EXEBOX_CLEAN, EXEBOX_PATCHED),
    ("is_sandbox_enabled", SANDBOX_ENABLED_CLEAN, SANDBOX_ENABLED_PATCHED),
]

EXPECTED_COUNT = len(PATTERNS)


def _find_all(data: Union[bytes, bytearray, memoryview], needle: bytes) -> List[int]:
    out = []
    pos = 0
    while True:
        pos = data.find(needle, pos)
        if pos < 0:
            break
        out.append(pos)
        pos += len(needle)
    return out


def scan(data: Union[bytes, bytearray, memoryview]) -> Tuple[List[Tuple[str, int, bytes]], List[Tuple[str, int]]]:
    clean_hits = []
    repl_hits = []
    for label, clean_sig, repl_sig in PATTERNS:
        for pos in _find_all(data, clean_sig):
            clean_hits.append((label, pos, repl_sig))
        for pos in _find_all(data, repl_sig):
            repl_hits.append((label, pos))
    return clean_hits, repl_hits


def apply(data: bytearray, verify: bool = False, dry_run: bool = False, allow_missing: bool = False) -> Tuple[bool, Dict[str, Any]]:
    clean_hits, repl_hits = scan(data)
    total = len(clean_hits) + len(repl_hits)

    info = {
        "name": "nosandbox",
        "expected": EXPECTED_COUNT,
        "clean_count": len(clean_hits),
        "replacement_count": len(repl_hits),
        "clean_offsets": [hex(pos) for _, pos, _ in clean_hits],
        "replacement_offsets": [hex(pos) for _, pos in repl_hits],
    }

    if total == 0:
        if allow_missing:
            info["status"] = "skipped_missing"
            return True, info
        info["status"] = "missing_signature"
        return False, info

    if total != EXPECTED_COUNT:
        info["status"] = f"unexpected_count_{total}"
        return False, info

    if verify:
        ok = (len(clean_hits) == 0 and len(repl_hits) == EXPECTED_COUNT)
        info["status"] = "verified" if ok else "unverified"
        return ok, info

    if len(clean_hits) == 0:
        info["status"] = "already_patched"
        return True, info

    if not dry_run:
        for _, pos, repl_sig in clean_hits:
            data[pos:pos + len(repl_sig)] = repl_sig
        info["status"] = "patched"
    else:
        info["status"] = "dry_run"

    return True, info
