import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

import app.main as main_module
from app.llm_router import build_llm_status
from app.main import app


class ChatRouterControlTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)
        self._orig_chat_max = main_module._CHAT_MAX_REQUESTS
        self._orig_chat_window = main_module._CHAT_WINDOW_S
        main_module._CHAT_REQUEST_LOG.clear()

    def tearDown(self) -> None:
        main_module._CHAT_MAX_REQUESTS = self._orig_chat_max
        main_module._CHAT_WINDOW_S = self._orig_chat_window
        main_module._CHAT_REQUEST_LOG.clear()

    @patch.dict(
        "os.environ",
        {
            "CHETANA_CLOUD_FALLBACK": "false",
            "CHETANA_ENABLE_ANTHROPIC": "false",
            "CHETANA_ENABLE_OPENAI": "false",
        },
        clear=False,
    )
    def test_llm_status_keeps_cloud_disabled_and_local_models_listed(self) -> None:
        status = build_llm_status()
        self.assertFalse(status["policy"]["gemini_enabled"])
        self.assertFalse(status["policy"]["cloud_fallback_enabled"])
        self.assertFalse(status["policy"]["caller_model_selection"])
        provider_ids = [provider["id"] for provider in status["providers"]]
        self.assertEqual(provider_ids, ["ollama", "anthropic", "openai"])
        self.assertIn("hf.co/Mungert/sarvam-m-GGUF:Q4_K_M", status["providers"][0]["models"])
        self.assertIn("chetana-guard-fast", status["providers"][0]["models"])
        self.assertIn("phi4-mini", status["providers"][0]["models"])
        self.assertIn("qwen2.5:7b", status["providers"][0]["models"])
        self.assertIn("llama3.2:3b", status["providers"][0]["models"])
        self.assertIn("mirrorstudent:latest", status["providers"][0]["models"])
        catalog_ids = {entry["id"] for entry in status["providers"][0]["catalog"]}
        self.assertIn("hf.co/mradermacher/sarvam-translate-i1-GGUF:Q4_K_M", catalog_ids)
        self.assertIn("qwen2.5vl:7b", catalog_ids)
        self.assertEqual(status["routing"]["chat_ladder"][0]["model"], "phi4-mini")
        self.assertTrue(all(item["provider"] == "ollama" for item in status["routing"]["chat_ladder"]))
        self.assertEqual(status["routing"]["cloud_fallback_order"], [])
        self.assertFalse(status["providers"][1]["enabled"])
        self.assertFalse(status["providers"][2]["enabled"])
        self.assertIn("available_models", status["providers"][0])
        self.assertIn("missing_models", status["providers"][0])

    @patch.dict(
        "os.environ",
        {
            "CHETANA_OLLAMA_CHAT_MODELS": "hf.co/Mungert/sarvam-m-GGUF:Q4_K_M,unknown-model,phi4-mini,phi4-mini",
        },
        clear=False,
    )
    def test_llm_status_filters_unknown_or_duplicate_local_models(self) -> None:
        status = build_llm_status()
        self.assertEqual(
            status["providers"][0]["models"],
            [
                "hf.co/Mungert/sarvam-m-GGUF:Q4_K_M",
                "phi4-mini",
            ],
        )

    @patch("app.main._fetch_kb_articles_for_chat", new_callable=AsyncMock, return_value=[])
    @patch("app.main.generate_chat_reply", new_callable=AsyncMock)
    def test_chat_uses_guarded_router_result(self, mock_generate, _kb) -> None:
        mock_generate.return_value = {
            "text": "Use the official app or bank number you already trust.",
            "provider": "anthropic",
            "model": "claude-3-5-haiku-latest",
        }

        resp = self.client.post(
            "/api/chat",
            json={"message": "How should I verify a bank message?", "lang": "en"},
        )

        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["engine"], "anthropic")
        self.assertEqual(data["model"], "claude-3-5-haiku-latest")
        self.assertIn("official app", data["reply"])
        called_prompt = mock_generate.await_args.args[0]
        self.assertIn("verify a bank message", called_prompt)

    @patch("app.main._fetch_kb_articles_for_chat", new_callable=AsyncMock, return_value=[])
    @patch("app.main.generate_chat_reply", new_callable=AsyncMock)
    def test_chat_rate_limit_blocks_burst_abuse(self, mock_generate, _kb) -> None:
        mock_generate.return_value = {
            "text": "Pause and verify independently.",
            "provider": "ollama",
            "model": "hf.co/Mungert/sarvam-m-GGUF:Q4_K_M",
        }
        main_module._CHAT_MAX_REQUESTS = 1
        main_module._CHAT_WINDOW_S = 60

        first = self.client.post(
            "/api/chat",
            json={"message": "How does scanning work?", "lang": "en"},
        )
        second = self.client.post(
            "/api/chat",
            json={"message": "How do I report fraud?", "lang": "en"},
        )

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 429)
        data = second.json()
        self.assertEqual(data["error"], "rate_limited")
        self.assertGreaterEqual(data["retry_after_s"], 1)
        self.assertEqual(second.headers["Retry-After"], str(data["retry_after_s"]))


if __name__ == "__main__":
    unittest.main()
