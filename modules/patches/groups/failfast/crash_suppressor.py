"""
crash_suppressor.py - Bypasses preinit CPU feature check and preinit atomic flag initialization for ARMv8.0-A CPUs.
"""
import struct
from typing import Tuple, Dict, Any, List, Union

# CPU feature check invariant core (after adrp x19; mov w10, #0x8300; ldr x8, [x19, #imm]):
#   mov w9, w8; tst w9, #0x10000; b.ne ...; tbnz w8, #7, ...; tbnz w8, #20, ...
CPU_TAIL = bytes.fromhex("e903282a3f010aeae1020054e8033836e8045036")
# Function epilogue at start + 0x64: ldr x19, [sp, #16]; ldp x29, x30, [sp], #32; ret
CPU_EPILOGUE = bytes.fromhex("f30b40f9fd7bc2a8c0035fd6")
REPLACEMENT_CPU = bytes.fromhex("190000141f2003d51f2003d51f2003d51f2003d51f2003d51f2003d51f2003d5")

# Preinit atomic flag check invariant core (after adrp x8; add x8, x8, #imm):
#   mov w9, #1; ldaddal x9, x8, [x8]; cbz x8, +8; ret; nop
ATOMIC_TAIL_RAW = bytes.fromhex("290080520801e9f8480000b4c0035fd61f2003d5")
# Replacement preserves adrp+add and replaces ldaddal with ldr/cbz/ret/str:
#   ldr x9, [x8]; mov w10, #1; cbz x9, +8; ret; str x10, [x8]
ATOMIC_TAIL_PATCHED = bytes.fromhex("090140f92a008052490000b4c0035fd60a0100f9")


def _exec_ranges(data: Union[bytes, bytearray, memoryview]) -> List[Tuple[int, int]]:
    n = len(data)
    if n >= 64 and bytes(data[:4]) == b"\x7fELF" and data[4] == 2 and data[5] == 1:
        e_phoff = struct.unpack_from("<Q", data, 32)[0]
        e_phentsize, e_phnum = struct.unpack_from("<HH", data, 54)
        if e_phentsize >= 56 and e_phoff + e_phnum * e_phentsize <= n:
            ranges = []
            for i in range(e_phnum):
                p_type, p_flags, p_offset, _va, _pa, p_filesz, _ms, _al = struct.unpack_from(
                    "<IIQQQQQQ", data, e_phoff + i * e_phentsize
                )
                if p_type == 1 and (p_flags & 1) and p_filesz > 0:
                    end = min(n, p_offset + p_filesz)
                    if p_offset < end:
                        ranges.append((p_offset, end))
            if ranges:
                return ranges
    return [(0, n)]


def _find_in_ranges(data: Union[bytes, bytearray, memoryview], pattern: bytes, ranges: List[Tuple[int, int]]) -> List[int]:
    matches = []
    for r_start, r_end in ranges:
        pos = r_start
        while pos < r_end:
            pos = data.find(pattern, pos, r_end)
            if pos == -1:
                break
            if pos % 4 == 0:
                matches.append(pos)
            pos += 4
    return matches


def _scan_cpu(data: Union[bytes, bytearray, memoryview], ranges: List[Tuple[int, int]]) -> Tuple[List[int], List[int]]:
    raw_cpu = []
    for pos in _find_in_ranges(data, CPU_TAIL, ranges):
        start = pos - 12
        if start < 0 or start + 0x70 > len(data):
            continue
        w0, w1, w2 = struct.unpack_from("<III", data, start)
        is_adrp_x19 = (w0 & 0x9F00001F) == 0x90000013
        is_mov_w10 = w1 == 0x5290600A
        is_ldr_x8_x19 = (w2 & 0xFFC003FF) == 0xF9400268
        if is_adrp_x19 and is_mov_w10 and is_ldr_x8_x19 and bytes(data[start + 0x64:start + 0x70]) == CPU_EPILOGUE:
            raw_cpu.append(start)

    repl_cpu = []
    for pos in _find_in_ranges(data, REPLACEMENT_CPU, ranges):
        if len(data) < 0x70 or (pos + 0x70 <= len(data) and bytes(data[pos + 0x64:pos + 0x70]) == CPU_EPILOGUE):
            repl_cpu.append(pos)

    return raw_cpu, repl_cpu


def _scan_atomic(data: Union[bytes, bytearray, memoryview], ranges: List[Tuple[int, int]]) -> Tuple[List[int], List[int]]:
    def filter_adrp_add(tail_matches: List[int]) -> List[int]:
        out = []
        for pos in tail_matches:
            start = pos - 8
            if start < 0:
                continue
            w0, w1 = struct.unpack_from("<II", data, start)
            is_adrp_x8 = (w0 & 0x9F00001F) == 0x90000008
            is_add_x8_x8 = (w1 & 0xFF8003FF) == 0x91000108
            if is_adrp_x8 and is_add_x8_x8:
                out.append(start)
        return out

    raw_atomic = filter_adrp_add(_find_in_ranges(data, ATOMIC_TAIL_RAW, ranges))
    repl_atomic = filter_adrp_add(_find_in_ranges(data, ATOMIC_TAIL_PATCHED, ranges))
    return raw_atomic, repl_atomic


def apply(data: bytearray, verify: bool = False, dry_run: bool = False, allow_missing: bool = False) -> Tuple[bool, Dict[str, Any]]:
    ranges = _exec_ranges(data)
    raw_cpu, repl_cpu = _scan_cpu(data, ranges)
    raw_atomic, repl_atomic = _scan_atomic(data, ranges)

    info = {
        "name": "failfast_cpu_and_atomic",
        "cpu_raw": [hex(x) for x in raw_cpu],
        "cpu_patched": [hex(x) for x in repl_cpu],
        "atomic_raw": [hex(x) for x in raw_atomic],
        "atomic_patched": [hex(x) for x in repl_atomic],
    }

    cpu_total = len(raw_cpu) + len(repl_cpu)
    atomic_total = len(raw_atomic) + len(repl_atomic)

    if cpu_total == 0 or atomic_total == 0:
        if allow_missing:
            info["status"] = "skipped_missing"
            return True, info
        info["status"] = "missing_signature"
        return False, info

    if cpu_total != 1 or atomic_total != 1:
        info["status"] = f"unexpected_count_cpu_{cpu_total}_atomic_{atomic_total}"
        return False, info

    if verify:
        v_ok = (len(raw_cpu) == 0 and len(repl_cpu) == 1 and len(raw_atomic) == 0 and len(repl_atomic) == 1)
        info["status"] = "verified" if v_ok else "unverified"
        return v_ok, info

    if len(raw_cpu) == 0 and len(raw_atomic) == 0:
        info["status"] = "already_patched"
        return True, info

    if not dry_run:
        for start in raw_cpu:
            data[start:start + len(REPLACEMENT_CPU)] = REPLACEMENT_CPU
        for start in raw_atomic:
            data[start + 8:start + 8 + len(ATOMIC_TAIL_PATCHED)] = ATOMIC_TAIL_PATCHED
        info["status"] = "patched"
    else:
        info["status"] = "dry_run"

    return True, info
