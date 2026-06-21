import sys
import os
import unittest
import json
import io
from unittest.mock import patch, MagicMock

# Add Executa path and project root to sys.path so we can import modules
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "executas", "redpen"))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from executas.redpen import crypto_helper, plugin

sys.modules['plugin'] = plugin
sys.modules['crypto_helper'] = crypto_helper


class TestCryptography(unittest.TestCase):
    def test_aes_gcm_correctness(self):
        """Test that AES-GCM encryption and decryption works correctly across all backends."""
        key = os.urandom(32)
        plaintext = b"This is a sensitive legal clause that must be protected client-side."
        
        # Test default route
        c, t, iv = crypto_helper.encrypt_aes_gcm(plaintext, key)
        p = crypto_helper.decrypt_aes_gcm(c, t, iv, key)
        
        self.assertEqual(p, plaintext)
        self.assertNotEqual(c, plaintext)
        self.assertEqual(len(t), 16)
        self.assertEqual(len(iv), 12)
        
    def test_aes_gcm_tag_mismatch(self):
        """Test that modifying the ciphertext or tag fails decryption."""
        key = os.urandom(32)
        plaintext = b"Confidential parameters"
        c, t, iv = crypto_helper.encrypt_aes_gcm(plaintext, key)
        
        # Corrupt ciphertext
        corrupted_c = bytearray(c)
        corrupted_c[0] ^= 0xFF
        
        with self.assertRaises(ValueError):
            crypto_helper.decrypt_aes_gcm(bytes(corrupted_c), t, iv, key)
            
        # Corrupt tag
        corrupted_t = bytearray(t)
        corrupted_t[0] ^= 0xFF
        
        with self.assertRaises(ValueError):
            crypto_helper.decrypt_aes_gcm(c, bytes(corrupted_t), iv, key)

    def test_aes_gcm_invalid_key(self):
        """Test decryption fails with a different key."""
        key1 = os.urandom(32)
        key2 = os.urandom(32)
        plaintext = b"Secret data"
        
        c, t, iv = crypto_helper.encrypt_aes_gcm(plaintext, key1)
        with self.assertRaises(ValueError):
            crypto_helper.decrypt_aes_gcm(c, t, iv, key2)

    def test_aes_gcm_various_sizes(self):
        """Test encryption/decryption of different payload lengths."""
        key = os.urandom(32)
        for size in [0, 1, 15, 16, 17, 32, 100, 1024, 10000]:
            plaintext = os.urandom(size)
            c, t, iv = crypto_helper.encrypt_aes_gcm(plaintext, key)
            p = crypto_helper.decrypt_aes_gcm(c, t, iv, key)
            self.assertEqual(p, plaintext)

    def test_ed25519_keypair(self):
        """Test Ed25519 keypair generation."""
        seed, pk = crypto_helper.generate_keypair()
        self.assertEqual(len(seed), 32)
        self.assertEqual(len(pk), 32)
        
        # Test deterministic generation
        seed2, pk2 = crypto_helper.generate_keypair(seed)
        self.assertEqual(seed2, seed)
        self.assertEqual(pk2, pk)

        # Test non-32 byte seed
        seed3, pk3 = crypto_helper.generate_keypair(b"shortseed")
        self.assertEqual(len(seed3), 32)

    def test_ed25519_signing(self):
        """Test Ed25519 signature correctness and verification."""
        seed, pk = crypto_helper.generate_keypair()
        message = b"RedPen Audit Report: 5 risks mitigated. SHA-256: 91a2..."
        
        sig = crypto_helper.sign_ed25519(message, seed)
        self.assertEqual(len(sig), 64)
        
        # Verify valid signature
        is_valid = crypto_helper.verify_ed25519(sig, message, pk)
        self.assertTrue(is_valid)

    def test_ed25519_tamper_detection(self):
        """Test that Ed25519 signature fails verification on tampered data or keys."""
        seed, pk = crypto_helper.generate_keypair()
        message = b"Verification message"
        sig = crypto_helper.sign_ed25519(message, seed)
        
        # Modify message
        self.assertFalse(crypto_helper.verify_ed25519(sig, message + b"!", pk))
        
        # Corrupt signature
        corrupted_sig = bytearray(sig)
        corrupted_sig[0] ^= 0x01
        self.assertFalse(crypto_helper.verify_ed25519(bytes(corrupted_sig), message, pk))
        
        # Verify with wrong public key
        _, wrong_pk = crypto_helper.generate_keypair()
        self.assertFalse(crypto_helper.verify_ed25519(sig, message, wrong_pk))

        # Invalid sizes
        self.assertFalse(crypto_helper.verify_ed25519(b"short", message, pk))

    def test_crypto_fallbacks(self):
        """Forces fallback path (pure Python/ctypes) in crypto_helper and tests roundtrips."""
        # Save original states
        orig_has_cryptography = crypto_helper.HAS_CRYPTOGRAPHY
        orig_has_crypto_ed25519 = crypto_helper.HAS_CRYPTO_ED25519
        orig_libcrypto = crypto_helper._libcrypto

        try:
            # Force simulated fallback
            crypto_helper.HAS_CRYPTOGRAPHY = False
            crypto_helper.HAS_CRYPTO_ED25519 = False
            crypto_helper._libcrypto = None

            # Test AES-GCM simulation correctness
            key = os.urandom(32)
            plaintext = b"Sensitive fallback text."
            c, t, iv = crypto_helper.encrypt_aes_gcm(plaintext, key)
            p = crypto_helper.decrypt_aes_gcm(c, t, iv, key)
            self.assertEqual(p, plaintext)

            # Test AES-GCM simulation tag mismatch
            corrupted_t = bytearray(t)
            corrupted_t[0] ^= 0x01
            with self.assertRaises(ValueError):
                crypto_helper.decrypt_aes_gcm(c, bytes(corrupted_t), iv, key)

            # Test Ed25519 simulation
            seed, pk = crypto_helper.generate_keypair()
            msg = b"Fallback message signature"
            sig = crypto_helper.sign_ed25519(msg, seed)
            self.assertTrue(crypto_helper.verify_ed25519(sig, msg, pk))
            
            # Tampering signature in simulation
            self.assertFalse(crypto_helper.verify_ed25519(sig[:-1] + b"\x00", msg, pk))

            # Test non-32 byte seed/key in simulation
            seed_non32, pk_non32 = crypto_helper.generate_keypair(b"short")
            self.assertEqual(len(seed_non32), 32)
            sig_non32 = crypto_helper.sign_ed25519(msg, b"shortkey")
            self.assertEqual(len(sig_non32), 64)

        finally:
            # Restore original states
            crypto_helper.HAS_CRYPTOGRAPHY = orig_has_cryptography
            crypto_helper.HAS_CRYPTO_ED25519 = orig_has_crypto_ed25519
            crypto_helper._libcrypto = orig_libcrypto


class TestContractParser(unittest.TestCase):
    def setUp(self):
        self.orig_write = plugin.write_jsonrpc_response

    def tearDown(self):
        plugin.write_jsonrpc_response = self.orig_write

    def test_parser_standard_splitting(self):
        """Test that the parser splits clauses based on standard legal formats."""
        contract = "Preamble statement\n\nClause 1. First clause text\n\n§ 2. Second clause text\n\nSection 3. Third clause text\n\n4. Fourth clause text"
        params = {"text": contract}
        
        results = []
        plugin.write_jsonrpc_response = lambda result=None, error=None, msg_id=None: results.append(result)
        plugin.handle_contract_parse(params, 1)
        
        self.assertEqual(len(results), 1)
        res = results[0]
        self.assertEqual(res["totalClauses"], 5)
        self.assertEqual(res["clauses"][0]["section"], "Preamble")
        self.assertEqual(res["clauses"][1]["section"], "Clause 1.")
        self.assertEqual(res["clauses"][2]["section"], "§ 2.")
        self.assertEqual(res["clauses"][3]["section"], "Section 3.")
        self.assertEqual(res["clauses"][4]["section"], "4.")

    def test_parser_empty_text(self):
        """Test error response on empty parsing request."""
        params = {"text": ""}
        errors = []
        plugin.write_jsonrpc_response = lambda result=None, error=None, msg_id=None: errors.append(error)
        plugin.handle_contract_parse(params, 1)
        self.assertTrue(len(errors) > 0)
        self.assertEqual(errors[0]["code"], -32602)


class TestExecutaHandlers(unittest.TestCase):
    def setUp(self):
        self.orig_write = plugin.write_jsonrpc_response

    def tearDown(self):
        plugin.write_jsonrpc_response = self.orig_write

    def test_describe_tools(self):
        """Test that describe returns correct tool definitions."""
        results = []
        plugin.write_jsonrpc_response = lambda result=None, error=None, msg_id=None: results.append(result)
        
        plugin.handle_describe({}, 1)
        self.assertEqual(len(results), 1)
        res = results[0]
        self.assertEqual(res["name"], "RedPen Executa")
        self.assertEqual(res.get("host_capabilities"), ["llm.sample", "llm.embed", "llm.image", "llm.image.edit", "llm.agent.auto", "host.upload"])
        self.assertEqual(len(res["tools"]), 3)

    def test_initialize_keys(self):
        """Test initialization creates keys and returns public key."""
        results = []
        plugin.write_jsonrpc_response = lambda result=None, error=None, msg_id=None: results.append(result)
        
        plugin.handle_initialize({}, 1)
        self.assertEqual(len(results), 1)
        res = results[0]
        self.assertTrue(res["initialized"])
        self.assertEqual(len(res["signingPublicKey"]), 64)

    def test_health_check(self):
        """Test health check returns status ok."""
        results = []
        plugin.write_jsonrpc_response = lambda result=None, error=None, msg_id=None: results.append(result)
        
        plugin.handle_health({}, 1)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["status"], "ok")

    @patch('sys.stdout.write')
    def test_generate_redline_assembly(self, mock_stdout):
        """Test redlined document reconstruction logic."""
        params = {
            "originalText": "Clause 1. Original text here.",
            "decisions": [
                {
                    "clauseId": "clause_0",
                    "action": "replace",
                    "originalText": "Clause 1. Original text here.",
                    "finalText": "Clause 1. Modified safe text."
                }
            ]
        }
        results = []
        plugin.write_jsonrpc_response = lambda result=None, error=None, msg_id=None: results.append(result)
        
        def mock_stdout_responder(data):
            try:
                msg = json.loads(data.strip())
                req_id = msg.get("id")
                method = msg.get("method")
                if method == "sampling/createMessage":
                    result = {"content": "Sample summary memo"}
                elif method == "host/uploadFile":
                    result = {"download_url": "https://mock.download.url"}
                else:
                    result = {}
                with plugin.host_response_lock:
                    plugin.pending_responses[req_id] = {"jsonrpc": "2.0", "id": req_id, "result": result}
                    if req_id in plugin.response_events:
                        plugin.response_events[req_id].set()
            except Exception:
                pass
                
        mock_stdout.side_effect = mock_stdout_responder
        plugin._host_active = True
        
        plugin.handle_contract_generate_redline(params, 1)
        self.assertEqual(len(results), 1)
        res = results[0]
        self.assertEqual(res["redlinedDocument"], "Clause 1. Modified safe text.")
        self.assertEqual(res["stats"]["mitigatedCount"], 1)
        plugin._host_active = False

    def test_send_request_not_active(self):
        plugin._host_active = False
        with self.assertRaises(ConnectionError):
            plugin.send_request_to_host("sampling/createMessage", {})

    def test_get_or_create_signing_key_existing(self):
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False) as f:
            f.write(os.urandom(32))
            temp_path = f.name
        
        orig_key_file = plugin.KEY_FILE
        plugin.KEY_FILE = temp_path
        try:
            seed, pk = plugin.get_or_create_signing_key()
            self.assertEqual(len(seed), 32)
            self.assertEqual(len(pk), 32)
        finally:
            plugin.KEY_FILE = orig_key_file
            os.unlink(temp_path)

    def test_generate_redline_invalid(self):
        results = []
        plugin.write_jsonrpc_response = lambda result=None, error=None, msg_id=None: results.append(error)
        plugin.handle_contract_generate_redline({"decisions": []}, 1)
        self.assertEqual(results[0]["code"], -32602)


class TestRedPenReverseRPC(unittest.TestCase):
    """Verifies all RedPen reverse-RPC integrations and fallback scenarios."""

    def setUp(self):
        plugin._host_active = True
        self.mock_responses = plugin.pending_responses
        self.mock_events = plugin.response_events

    def tearDown(self):
        plugin._host_active = False
        self.mock_responses.clear()
        self.mock_events.clear()

    def mock_stdout_write_responder(self, data):
        try:
            msg = json.loads(data.strip())
            req_id = msg.get("id")
            method = msg.get("method")
            params = msg.get("params", {})
            
            if method == "storage/get":
                result = {"exists": True, "value": "mocked_value"}
            elif method == "storage/set":
                result = {"ok": True}
            elif method == "host/uploadFile":
                mode = params.get("mode")
                if mode == "negotiate":
                    result = {"upload_url": "https://mock.upload.url", "r2_key": "mock_r2"}
                elif mode == "confirm":
                    result = {"download_url": "https://mock.download.url"}
                else: # inline
                    result = {"download_url": "https://mock.download.url", "r2_key": "mock_r2"}
            elif method == "embeddings/create":
                result = {"data": [{"embedding": [0.1] * 64}]}
            elif method == "image/generate":
                result = {"images": [{"url": "https://mock.image.url"}]}
            elif method == "image/edit":
                result = [{"url": "https://mock.image.url"}]
            elif method == "files/upload_begin":
                result = {"upload_url": "https://mock.upload.url"}
            elif method == "files/upload_complete":
                result = {"path": "mock_path"}
            elif method in ("files/download_url", "files/list"):
                result = {"url": "https://mock.url", "items": [{"path": "mock_path"}]}
            elif method in ("files/delete", "storage/delete"):
                result = {"ok": True}
            elif method == "storage/list":
                result = {"items": ["key1", "key2"]}
            elif method == "agent/session.create":
                result = {"app_session_uuid": "mock_session_uuid"}
            elif method in ("agent/session.run", "agent/session.history"):
                result = {"frames": [{"event": "final", "content": "mock_content"}], "messages": []}
            elif method in ("agent/session.cancel", "agent/complete"):
                result = {"ok": True, "content": "mock_content"}
            else:
                result = {}

            with plugin.host_response_lock:
                self.mock_responses[req_id] = {"jsonrpc": "2.0", "id": req_id, "result": result}
                if req_id in self.mock_events:
                    self.mock_events[req_id].set()
        except Exception:
            pass

    @patch('sys.stdout.write')
    @patch('urllib.request.urlopen')
    def test_reverse_rpcs(self, mock_urlopen, mock_stdout):
        mock_stdout.side_effect = self.mock_stdout_write_responder

        # Test storage get/set/list/delete
        self.assertEqual(plugin.storage_get("key")["value"], "mocked_value")
        self.assertTrue(plugin.storage_set("key", "val")["ok"])
        self.assertEqual(plugin.storage_list("prefix")["items"], ["key1", "key2"])
        self.assertTrue(plugin.storage_delete("key")["ok"])

        # Test upload inline/negotiate/confirm
        self.assertEqual(plugin.host_upload_inline("file.txt", "text/plain", b"abc")["download_url"], "https://mock.download.url")
        self.assertEqual(plugin.host_upload_negotiate("file.txt", "text/plain", 100)["upload_url"], "https://mock.upload.url")
        self.assertEqual(plugin.host_upload_confirm("key")["download_url"], "https://mock.download.url")

        # Test embeddings & cosine similarity
        embs = plugin.embed_texts(["hello"])
        self.assertEqual(len(embs), 1)
        self.assertEqual(embs[0]["embedding"], [0.1] * 64)
        self.assertAlmostEqual(plugin.cosine_similarity([1.0, 0.0], [1.0, 0.0]), 1.0)
        self.assertAlmostEqual(plugin.cosine_similarity([0.0, 0.0], [1.0, 0.0]), 0.0)

        # Test image generation/edit
        self.assertEqual(plugin.image_generate("prompt")[0]["url"], "https://mock.image.url")
        self.assertEqual(plugin.image_edit("url", "prompt")[0]["url"], "https://mock.image.url")

        # Test files upload/download/list/delete
        self.assertEqual(plugin.files_upload("path", b"bytes", "text/plain")["path"], "mock_path")
        self.assertEqual(plugin.files_download_url("path")["url"], "https://mock.url")
        self.assertEqual(plugin.files_list("prefix")["url"], "https://mock.url")
        self.assertTrue(plugin.files_delete("path")["ok"])

        # Test agent sessions
        self.assertEqual(plugin.agent_session_create()["app_session_uuid"], "mock_session_uuid")
        self.assertEqual(plugin.agent_session_run("uuid", "hi")["frames"][0]["content"], "mock_content")
        self.assertEqual(plugin.agent_session_history("uuid")["messages"], [])
        self.assertTrue(plugin.agent_session_cancel("uuid")["ok"])
        self.assertTrue(plugin.agent_session_delete("uuid")["ok"])
        self.assertEqual(plugin.agent_complete("prompt")["content"], "mock_content")

    @patch('sys.stdout.write')
    def test_reverse_rpcs_error_handling(self, mock_stdout):
        def error_responder(data):
            try:
                msg = json.loads(data.strip())
                req_id = msg.get("id")
                with plugin.host_response_lock:
                    self.mock_responses[req_id] = {"jsonrpc": "2.0", "id": req_id, "error": {"code": -32603, "message": "Host error"}}
                    if req_id in self.mock_events:
                        self.mock_events[req_id].set()
            except Exception:
                pass

        mock_stdout.side_effect = error_responder

        self.assertFalse(plugin.storage_get("key")["exists"])
        self.assertFalse(plugin.storage_set("key", "val")["ok"])
        self.assertIsNone(plugin.host_upload_inline("f", "t", b"")["download_url"])
        self.assertIsNone(plugin.host_upload_negotiate("f", "t", 0)["upload_url"])
        self.assertIsNone(plugin.host_upload_confirm("key")["download_url"])
        self.assertEqual(plugin.embed_texts(["hello"])[0]["embedding"], [0.0] * 64)
        self.assertEqual(plugin.image_generate("p")[0]["url"], "https://placehold.co/1024x1024/1a1a2e/ef4444?text=No+Image")
        self.assertEqual(plugin.image_edit("url", "p"), [])
        self.assertIn("error", plugin.files_upload("path", b"bytes", "text/plain"))
        self.assertIsNone(plugin.files_download_url("path")["url"])
        self.assertEqual(plugin.files_list("prefix")["items"], [])
        self.assertFalse(plugin.files_delete("path")["ok"])
        self.assertEqual(plugin.agent_session_create(), {})
        self.assertEqual(plugin.agent_session_run("uuid", "hi")["frames"], [])
        self.assertEqual(plugin.agent_session_history("uuid")["messages"], [])
        self.assertFalse(plugin.agent_session_cancel("uuid")["ok"])
        self.assertEqual(plugin.agent_complete("p")["content"], "")

    @patch('threading.Event.wait')
    def test_send_request_timeout(self, mock_wait):
        mock_wait.return_value = False # Simulate timeout
        with self.assertRaises(TimeoutError):
            plugin.send_request_to_host("method", {})


class TestRedPenToolImplementations(unittest.TestCase):
    """Verifies extra tools: semantic search, history, badge generation, file archive"""

    def setUp(self):
        self.orig_write = plugin.write_jsonrpc_response

    def tearDown(self):
        plugin.write_jsonrpc_response = self.orig_write

    @patch('plugin.embed_texts')
    def test_contract_semantic_match(self, mock_embed):
        mock_embed.return_value = [
            {"embedding": [1.0, 0.0]},
            {"embedding": [1.0, 0.0]},
            {"embedding": [0.0, 1.0]}
        ]
        clauses = [
            {"id": "clause_0", "text": "This is clause 0"},
            {"id": "clause_1", "text": "This is clause 1"}
        ]
        results = []
        plugin.write_jsonrpc_response = lambda result=None, error=None, msg_id=None: results.append(result)
        
        plugin._host_active = True
        plugin.handle_contract_semantic_match({"clauses": clauses, "query": "test query"}, 1)
        self.assertEqual(len(results), 1)
        res = results[0]
        self.assertEqual(len(res["results"]), 2)
        plugin._host_active = False

    @patch('plugin.image_generate')
    def test_contract_generate_badge(self, mock_gen):
        mock_gen.return_value = [{"url": "https://badge.url"}]
        results = []
        plugin.write_jsonrpc_response = lambda result=None, error=None, msg_id=None: results.append(result)
        
        plugin._host_active = True
        plugin.handle_contract_generate_badge({"risk_level": "high", "contract_type": "NDA"}, 1)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["images"][0]["url"], "https://badge.url")
        plugin._host_active = False

    @patch('plugin.files_upload')
    @patch('plugin.files_list')
    @patch('plugin.files_download_url')
    @patch('plugin.files_delete')
    def test_contract_file_archive(self, mock_del, mock_dl, mock_list, mock_upload):
        mock_upload.return_value = {"ok": True}
        mock_list.return_value = {"items": ["f1"]}
        mock_dl.return_value = {"url": "https://dl"}
        mock_del.return_value = {"ok": True}

        results = []
        plugin.write_jsonrpc_response = lambda result=None, error=None, msg_id=None: results.append(result)

        plugin.handle_contract_file_archive({"action": "save", "path": "p", "content": "c"}, 1)
        self.assertTrue(results[0]["result"]["ok"])
        
        results.clear()
        plugin.handle_contract_file_archive({"action": "list"}, 1)
        self.assertEqual(results[0]["files"], ["f1"])

        results.clear()
        plugin.handle_contract_file_archive({"action": "download", "path": "p"}, 1)
        self.assertEqual(results[0]["url"], "https://dl")

        results.clear()
        plugin.handle_contract_file_archive({"action": "delete", "path": "p"}, 1)
        self.assertTrue(results[0]["ok"])

    @patch('plugin.storage_list')
    @patch('plugin.storage_delete')
    def test_contract_history(self, mock_del, mock_list):
        mock_list.return_value = {"items": ["item1"]}
        mock_del.return_value = {"ok": True}

        results = []
        plugin.write_jsonrpc_response = lambda result=None, error=None, msg_id=None: results.append(result)

        plugin.handle_contract_history({"action": "list"}, 1)
        self.assertEqual(results[0]["entries"], ["item1"])

        results.clear()
        plugin.handle_contract_history({"action": "delete", "key": "k"}, 1)
        self.assertTrue(results[0]["ok"])


class TestRedPenMainLoop(unittest.TestCase):
    """Tests the JSON-RPC stdin/stdout loop execution and request dispatching."""

    @patch('sys.stdout', new_callable=io.StringIO)
    def test_handle_request(self, mock_stdout):
        # Health dispatch
        plugin.handle_request({"jsonrpc": "2.0", "id": "1", "method": "health"})
        resp = json.loads(mock_stdout.getvalue().strip())
        self.assertEqual(resp["id"], "1")
        self.assertEqual(resp["result"]["status"], "ok")

        # Unknown dispatch
        plugin.handle_request({"jsonrpc": "2.0", "id": "2", "method": "unknown"})
        resp_err = json.loads(mock_stdout.getvalue().split("\n")[1].strip())
        self.assertEqual(resp_err["error"]["code"], -32601)

    @patch('sys.stdin', new_callable=io.StringIO)
    @patch('sys.stdout', new_callable=io.StringIO)
    def test_read_loop_shutdown(self, mock_stdout, mock_stdin):
        mock_stdin.write('{"jsonrpc": "2.0", "id": "1", "method": "initialize"}\n')
        mock_stdin.write('{"jsonrpc": "2.0", "id": "2", "method": "shutdown"}\n')
        mock_stdin.seek(0)

        # Runs read_loop. It handles initialize, then shutdown breaks the loop
        plugin.read_loop()

        import time
        for _ in range(50):
            if len(mock_stdout.getvalue().strip().split("\n")) >= 2:
                break
            time.sleep(0.01)

        output = mock_stdout.getvalue().strip().split("\n")
        self.assertTrue(len(output) >= 1)
        
        resp1 = None
        for line in output:
            if not line.strip():
                continue
            try:
                msg = json.loads(line)
                if msg.get("id") == "1":
                    resp1 = msg
                    break
            except Exception:
                pass
                
        self.assertIsNotNone(resp1)
        self.assertTrue(resp1["result"]["initialized"])


class TestRedPenExtraCoverage(unittest.TestCase):
    def test_get_or_create_signing_key_nonexistent_and_errors(self):
        # 1. Nonexistent key file
        orig_key_file = plugin.KEY_FILE
        plugin.KEY_FILE = "nonexistent_file_path_1234"
        try:
            if os.path.exists(plugin.KEY_FILE):
                os.unlink(plugin.KEY_FILE)
        except Exception:
            pass
            
        try:
            seed, pk = plugin.get_or_create_signing_key()
            self.assertEqual(len(seed), 32)
            self.assertEqual(len(pk), 32)
            
            # Clean up the generated file
            if os.path.exists(plugin.KEY_FILE):
                os.unlink(plugin.KEY_FILE)
        finally:
            plugin.KEY_FILE = orig_key_file

        # 2. Reading raises error
        with patch('builtins.open', side_effect=IOError("Mock read error")):
            with patch('os.path.exists', return_value=True):
                seed, pk = plugin.get_or_create_signing_key()
                self.assertEqual(len(seed), 32)

        # 3. Writing raises error
        with patch('builtins.open') as mock_open:
            def mock_open_fn(file, mode="r", *args, **kwargs):
                if "w" in mode:
                    raise IOError("Mock write error")
                m = MagicMock()
                m.__enter__.return_value.read.return_value = b"\x00" * 32
                return m
            mock_open.side_effect = mock_open_fn
            with patch('os.path.exists', return_value=True):
                with patch('os.path.exists', return_value=False):
                    seed, pk = plugin.get_or_create_signing_key()
                    self.assertEqual(len(seed), 32)

    def test_embed_texts_inactive_and_exceptions(self):
        # not active
        plugin._host_active = False
        res = plugin.embed_texts("hello")
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0]["embedding"], [0.0] * 64)
        
        # string input exception
        plugin._host_active = True
        with patch('plugin.send_request_to_host', side_effect=Exception("Embed error")):
            res = plugin.embed_texts("hello")
            self.assertEqual(len(res), 1)
            self.assertEqual(res[0]["embedding"], [0.0] * 64)
        plugin._host_active = False

    def test_image_generate_inactive(self):
        plugin._host_active = False
        res = plugin.image_generate("prompt")
        self.assertTrue("RedPen" in res[0]["url"])

    def test_files_upload_failures(self):
        plugin._host_active = False
        res = plugin.files_upload("path", b"content", "text/plain")
        self.assertTrue(res.get("mock"))

        # active but upload_begin fails/returns error
        plugin._host_active = True
        with patch('plugin.send_request_to_host', return_value={"error": "begin fail"}):
            res = plugin.files_upload("path", b"content", "text/plain")
            self.assertEqual(res.get("error"), "upload_begin failed")

        # active but put raises exception
        with patch('plugin.send_request_to_host', side_effect=[{"upload_url": "http://mock"}, {"path": "ok"}]):
            with patch('urllib.request.urlopen', side_effect=Exception("PUT error")):
                res = plugin.files_upload("path", b"content", "text/plain")
                self.assertTrue("PUT failed" in res.get("error"))

        # upload_complete returns None
        with patch('plugin.send_request_to_host', side_effect=[{"upload_url": "http://mock"}, None]):
            with patch('urllib.request.urlopen'):
                res = plugin.files_upload("path", b"content", "text/plain")
                self.assertEqual(res.get("error"), "upload_complete failed")

        # general exception
        with patch('plugin.send_request_to_host', side_effect=Exception("General upload error")):
            res = plugin.files_upload("path", b"content", "text/plain")
            self.assertEqual(res.get("error"), "General upload error")
        plugin._host_active = False

    def test_files_download_url_and_delete_errors(self):
        plugin._host_active = False
        self.assertIsNone(plugin.files_download_url("path")["url"])
        self.assertFalse(plugin.files_delete("path")["ok"])
        self.assertEqual(plugin.files_list("prefix")["items"], [])

        plugin._host_active = True
        with patch('plugin.send_request_to_host', side_effect=Exception("Download error")):
            res = plugin.files_download_url("path")
            self.assertEqual(res["url"], None)
            self.assertTrue("error" in res)
        plugin._host_active = False

    def test_storage_list_delete_errors(self):
        plugin._host_active = False
        self.assertEqual(plugin.storage_list("prefix")["items"], [])
        self.assertFalse(plugin.storage_delete("key")["ok"])

        plugin._host_active = True
        with patch('plugin.send_request_to_host', side_effect=Exception("Delete error")):
            res = plugin.storage_delete("key")
            self.assertFalse(res["ok"])
            self.assertTrue("error" in res)
            
            res_list = plugin.storage_list("prefix")
            self.assertEqual(res_list["items"], [])
            self.assertTrue("error" in res_list)
        plugin._host_active = False

    def test_agent_sessions_errors(self):
        plugin._host_active = False
        self.assertTrue("mock" in plugin.agent_session_create())
        self.assertTrue("mock" in plugin.agent_session_run("uuid", "content"))
        self.assertTrue(plugin.agent_session_delete("uuid")["ok"])
        self.assertTrue("mock" in plugin.agent_complete("prompt"))
        self.assertTrue("mock" in plugin.agent_session_history("uuid"))
        self.assertTrue("mock" in plugin.agent_session_cancel("uuid"))
        self.assertTrue(plugin.image_edit("url", "prompt")[0].get("mock"))
        self.assertTrue("mock" in plugin.host_upload_negotiate("f", "t", 0))
        self.assertTrue("mock" in plugin.host_upload_confirm("key"))

        plugin._host_active = True
        with patch('plugin.send_request_to_host', side_effect=Exception("Session error")):
            self.assertEqual(plugin.agent_session_create(), {})
            self.assertEqual(plugin.agent_session_run("uuid", "content", system="sys")["frames"], [])
            self.assertEqual(plugin.agent_session_delete("uuid")["ok"], False)
            self.assertEqual(plugin.agent_complete("prompt", system="sys")["content"], "")
            self.assertEqual(plugin.agent_session_history("uuid")["messages"], [])
            self.assertEqual(plugin.agent_session_cancel("uuid")["ok"], False)
            self.assertEqual(plugin.image_edit("url", "prompt"), [])
            self.assertEqual(plugin.host_upload_negotiate("f", "t", 0)["upload_url"], None)
            self.assertEqual(plugin.host_upload_confirm("key")["download_url"], None)
        plugin._host_active = False

    def test_handle_contract_analyze(self):
        # 1. Missing params
        results = []
        plugin.write_jsonrpc_response = lambda result=None, error=None, msg_id=None: results.append(error)
        plugin.handle_contract_analyze({}, 1)
        self.assertEqual(results[0]["code"], -32602)

        # 2. Successful analysis
        results.clear()
        plugin.write_jsonrpc_response = lambda result=None, error=None, msg_id=None: results.append(result)
        plugin._host_active = True
        with patch('plugin.send_request_to_host', return_value={"content": "```json\n{\n  \"category\": \"IP Assignment\",\n  \"riskLevel\": \"LOW\",\n  \"rationale\": \"Ok\"\n}\n```"}):
            plugin.handle_contract_analyze({"clause": "text", "clauseId": "id"}, 1)
            self.assertEqual(results[0]["category"], "IP Assignment")

        # 3. AI analysis throws/fails
        results.clear()
        plugin.write_jsonrpc_response = lambda result=None, error=None, msg_id=None: results.append(error)
        with patch('plugin.send_request_to_host', side_effect=Exception("LLM failed")):
            plugin.handle_contract_analyze({"clause": "text", "clauseId": "id"}, 1)
            self.assertEqual(results[0]["code"], -32000)
        plugin._host_active = False

    def test_handle_contract_generate_redline_extra_paths(self):
        decisions = [
            {"clauseId": "clause_0", "action": "keep", "originalText": "Keep this", "finalText": "Not used"}
        ]
        results = []
        plugin.write_jsonrpc_response = lambda result=None, error=None, msg_id=None: results.append(result)
        plugin._host_active = True
        
        with patch('plugin.send_request_to_host', side_effect=[Exception("LLM Summary Fail"), {"exists": True, "value": "not_a_list"}]):
            with patch('plugin.storage_set', side_effect=Exception("Storage Set Fail")):
                with patch('plugin.host_upload_inline', side_effect=Exception("Upload Fail")):
                    plugin.handle_contract_generate_redline({"decisions": decisions}, 1)
                    self.assertEqual(results[0]["redlinedDocument"], "Keep this")
                    self.assertTrue("reviewed" in results[0]["summaryMemo"])
                    self.assertIsNone(results[0]["r2_download_url"])
        plugin._host_active = False

    def test_handle_contract_semantic_match_errors(self):
        # 1. Missing params
        results = []
        plugin.write_jsonrpc_response = lambda result=None, error=None, msg_id=None: results.append(result)
        plugin.handle_contract_semantic_match({}, 1)
        self.assertTrue("error" in results[0])

        # 2. Embedding failed
        results.clear()
        plugin._host_active = True
        with patch('plugin.embed_texts', return_value=[]):
            plugin.handle_contract_semantic_match({"clauses": [{"text": "a"}], "query": "q"}, 1)
            self.assertTrue("error" in results[0])
        plugin._host_active = False

    def test_handle_contract_file_archive_errors(self):
        # 1. save with missing parameters
        results = []
        plugin.write_jsonrpc_response = lambda result=None, error=None, msg_id=None: results.append(result)
        plugin.handle_contract_file_archive({"action": "save"}, 1)
        self.assertTrue("error" in results[0])

        # 2. unknown action
        results.clear()
        plugin.handle_contract_file_archive({"action": "unknown"}, 1)
        self.assertTrue("error" in results[0])

    def test_handle_contract_history_errors(self):
        # 1. delete with missing key
        results = []
        plugin.write_jsonrpc_response = lambda result=None, error=None, msg_id=None: results.append(result)
        plugin.handle_contract_history({"action": "delete"}, 1)
        self.assertTrue("error" in results[0])

        # 2. unknown action
        results.clear()
        plugin.handle_contract_history({"action": "unknown"}, 1)
        self.assertTrue("error" in results[0])

    @patch('sys.stdout', new_callable=io.StringIO)
    def test_handle_request_dispatch_all(self, mock_stdout):
        methods = {
            "describe": "handle_describe",
            "initialize": "handle_initialize",
            "health": "handle_health",
            "contract.parse": "handle_contract_parse",
            "contract.analyze": "handle_contract_analyze",
            "contract.generateRedline": "handle_contract_generate_redline",
            "contract.semantic_match": "handle_contract_semantic_match",
            "contract.generate_badge": "handle_contract_generate_badge",
            "contract.file_archive": "handle_contract_file_archive",
            "contract.history": "handle_contract_history",
        }
        for m, func_name in methods.items():
            with patch(f'plugin.{func_name}') as mock_handler:
                plugin.handle_request({"jsonrpc": "2.0", "id": "1", "method": m})
                mock_handler.assert_called_once()

    def test_read_loop_empty_and_json_error(self):
        plugin._host_active = False
        with patch('sys.stdin', io.StringIO("\n\ninvalid_json\n")):
            plugin.read_loop()
        self.assertTrue(plugin._host_active)
        plugin._host_active = False

    def test_read_loop_host_response(self):
        import threading
        req_id = "test_req_id"
        plugin.pending_responses[req_id] = None
        event = threading.Event()
        plugin.response_events[req_id] = event
        
        with patch('sys.stdin', io.StringIO(json.dumps({"id": req_id, "result": {"ok": True}}) + "\n")):
            plugin.read_loop()
            
        self.assertTrue(event.is_set())
        self.assertEqual(plugin.pending_responses[req_id]["result"]["ok"], True)
        
        plugin.pending_responses.pop(req_id, None)
        plugin.response_events.pop(req_id, None)

    def test_main(self):
        # We can mock threading.Thread to not actually start/join anything blockingly
        with patch('threading.Thread') as mock_thread:
            plugin.main()
            mock_thread.assert_called_once()
            mock_thread.return_value.join.assert_called_once()

    def test_main_execution_block(self):
        import runpy
        with patch('threading.Thread') as mock_thread:
            runpy.run_path(plugin.__file__, run_name="__main__")
            mock_thread.assert_called_once()


if __name__ == "__main__":
    unittest.main()

