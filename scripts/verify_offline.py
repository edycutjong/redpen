#!/usr/bin/env python3
import sys
import os
import socket
import unittest

# Setup import paths
script_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(script_dir), "executas", "redpen"))

# Block all socket connections to simulate an air-gapped/offline environment
def block_network(*args, **kwargs):
    raise socket.error("Internet access is blocked in offline verification mode!")

socket.socket = block_network
socket.create_connection = block_network

# Import modules after blocking network
import crypto_helper
import plugin

class TestOfflineExecution(unittest.TestCase):
    def test_offline_parsing(self):
        """Verify contract splitting operates offline."""
        text = "Clause 1. Sample text\n\nSection 2. More text"
        clauses = []
        plugin.write_jsonrpc_response = lambda result, error=None, msg_id=None: clauses.extend(result.get("clauses", []))
        
        plugin.handle_contract_parse({"text": text}, 1)
        self.assertEqual(len(clauses), 2)
        self.assertEqual(clauses[0]["section"], "Clause 1.")
        self.assertEqual(clauses[1]["section"], "Section 2.")

    def test_offline_cryptography(self):
        """Verify AES-GCM-256 and Ed25519 operate offline."""
        key = crypto_helper.os.urandom(32)
        plaintext = b"Air-gapped data payload"
        
        # Test local envelope encryption
        c, t, iv = crypto_helper.encrypt_aes_gcm(plaintext, key)
        p = crypto_helper.decrypt_aes_gcm(c, t, iv, key)
        self.assertEqual(p, plaintext)
        
        # Test signature keypair generation
        seed, pk = crypto_helper.generate_keypair()
        sig = crypto_helper.sign_ed25519(plaintext, seed)
        is_valid = crypto_helper.verify_ed25519(sig, plaintext, pk)
        self.assertTrue(is_valid)

if __name__ == "__main__":
    print("==========================================================")
    print("Running Air-Gapped Offline Execution Verification...")
    
    # Run tests
    suite = unittest.TestLoader().loadTestsFromTestCase(TestOfflineExecution)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    print("----------------------------------------------------------")
    if result.wasSuccessful():
        print("Offline Verification: PASSED (Zero Network Dependencies Verified) ✅")
    else:
        print("Offline Verification: FAILED ❌")
    print("==========================================================")
    sys.exit(0 if result.wasSuccessful() else 1)
