#!/usr/bin/env python3
"""
test_elf_validator.py - Unit tests for ELF header, AArch64 architecture, and type verification.
"""
import unittest
import os
import sys
import tempfile
import shutil

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
MODULE_ROOT = os.path.dirname(TESTS_DIR)
sys.path.insert(0, os.path.join(MODULE_ROOT, "validate"))
sys.path.insert(0, os.path.join(MODULE_ROOT, "unpack"))

import elf_header
import elf_arch
import elf_compat
import checksum_checker
import extractor

class TestElfValidator(unittest.TestCase):
    def setUp(self):
        self.loader_path = os.path.join(MODULE_ROOT, "glibc", "ld-linux-aarch64.so.1")
        self.archive_path = os.path.join(MODULE_ROOT, "pristine", "language_server.tar.gz")

    def test_01_valid_elf_loader(self):
        self.assertTrue(os.path.isfile(self.loader_path))
        self.assertTrue(elf_header.validate_elf_header(self.loader_path))
        self.assertTrue(elf_arch.validate_aarch64(self.loader_path))
        self.assertIn(elf_compat.validate_executable_type(self.loader_path), ("ET_DYN", "ET_EXEC"))

    def test_02_invalid_elf(self):
        with self.assertRaises(ValueError):
            elf_header.validate_elf_header(self.archive_path)

    def test_03_checksum_verification(self):
        expected_binary_sha = "9772a2fd0d7654b317d439afec450a051018d0c69c9fb96e642a801846170fec"
        tmp_dir = tempfile.mkdtemp(prefix="agy_elf_test_")
        try:
            extracted_bin = os.path.join(tmp_dir, "language_server")
            self.assertTrue(extractor.extract_core(self.archive_path, extracted_bin))
            self.assertTrue(checksum_checker.verify_checksum(extracted_bin, expected_binary_sha))
        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

if __name__ == "__main__":
    unittest.main()
