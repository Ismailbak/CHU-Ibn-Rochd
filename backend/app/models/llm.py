"""
LLM model integration with Ollama (BioMistral)
Supports French, English, and Arabic medical queries
"""

import logging
from typing import Dict
import requests

logger = logging.getLogger(__name__)


class LLMModel:
    def __init__(self,
                 ollama_host: str = "http://localhost:11434",
                 model_name: str = "gemma4:e4b"):
        """
        Initialize LLM model connection to Ollama

        Args:
            ollama_host: Ollama API endpoint
            model_name: Model to use (e.g., cniongolo/biomistral or gemma4:e4b)
        """
        self.ollama_host = ollama_host
        self.model_name = model_name
        self.api_endpoint = f"{ollama_host}/api/generate"
        self.is_available = False

    def load(self) -> bool:
        """
        Soft health-check — failure does NOT disable generation.
        generate() always tries Ollama directly.

        Returns:
            bool: True if connection and model check passed
        """
        try:
            response = requests.get(
                f"{self.ollama_host}/api/tags",
                timeout=10
            )
            if response.status_code == 200:
                models = response.json().get("models", [])
                model_names = [m["name"] for m in models]
                logger.info(f"Available Ollama models: {model_names}")

                # Mark available regardless — generate() will surface errors if wrong name
                self.is_available = True

                base = self.model_name.split(":")[0]
                if any(base in m for m in model_names):
                    logger.info(f"Model {self.model_name} confirmed on Ollama")
                else:
                    logger.warning(
                        f"Model {self.model_name} not found in list {model_names}. "
                        "Will attempt generation anyway."
                    )
                return True
            else:
                logger.error(f"Ollama health check failed: HTTP {response.status_code}")
                return False
        except Exception as e:
            logger.error(f"Failed to connect to Ollama at {self.ollama_host}: {e}")
            return False

    def generate(self, prompt: str, system: str = None, language: str = "fr", **kwargs) -> Dict:
        """
        Generate response using BioMistral via Ollama.
        Always attempts the API call — does NOT depend on is_available.

        Args:
            prompt: The full prompt (may include patient context)
            system: Optional system prompt to guide the model behavior
            language: Language code (fr, en, ar)
            **kwargs: Additional parameters (temperature, top_p, top_k, num_predict)

        Returns:
            dict: {"response": str, "tokens": int, "model": str}
        """
        try:
            payload = {
                "model": self.model_name,
                "prompt": prompt,
                "stream": False,
                # Keep the model loaded between requests to avoid cold-start latency
                "keep_alive": kwargs.get("keep_alive", "30m"),
                "options": {
                    "temperature": kwargs.get("temperature", 0.7),
                    "top_p": kwargs.get("top_p", 0.9),
                    "top_k": kwargs.get("top_k", 40),
                }
            }
            if kwargs.get("num_predict"):
                payload["options"]["num_predict"] = kwargs["num_predict"]
            
            if system:
                payload["system"] = system

            logger.debug(f"Calling Ollama ({self.model_name}): {prompt[:100]}...")
            response = requests.post(
                self.api_endpoint,
                json=payload,
                timeout=180  # Medical queries can take time on first load
            )

            if response.status_code == 200:
                self.is_available = True
                result = response.json()
                return {
                    "response": result.get("response", ""),
                    "tokens": result.get("eval_count", 0),
                    "model": self.model_name
                }
            else:
                logger.error(
                    f"Ollama API error: HTTP {response.status_code} — {response.text[:300]}"
                )
                return {
                    "response": (
                        f"[API Error {response.status_code}] "
                        f"Model '{self.model_name}' may not be loaded on the Ollama server."
                    ),
                    "tokens": 0,
                    "model": "error"
                }

        except requests.exceptions.Timeout:
            logger.error("Ollama request timed out after 180s")
            return {
                "response": "[Timeout] The AI is taking too long. Please try again.",
                "tokens": 0,
                "model": "timeout"
            }
        except Exception as e:
            logger.error(f"Error calling Ollama: {e}")
            return {
                "response": f"[Connection Error] Cannot reach AI server: {str(e)}",
                "tokens": 0,
                "model": "error"
            }

from app.core.config import settings

# Global singleton (host/model from environment)
llm = LLMModel(
    ollama_host=settings.OLLAMA_HOST,
    model_name=settings.OLLAMA_MODEL,
)
