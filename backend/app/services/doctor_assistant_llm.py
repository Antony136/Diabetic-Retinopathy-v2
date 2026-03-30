import json
import logging
import os
import time
from dataclasses import dataclass
from typing import Literal, Optional

import httpx
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

ProviderName = Literal["ollama", "groq"]


def _env_bool(name: str, default: bool) -> bool:
    v = os.getenv(name)
    if v is None:
        return default
    return v.strip().lower() in ["1", "true", "yes", "y", "on"]


def _env_float(name: str, default: float) -> float:
    v = os.getenv(name)
    if v is None:
        return default
    try:
        return float(v)
    except Exception:
        return default


def _env_int(name: str, default: int) -> int:
    v = os.getenv(name)
    if v is None:
        return default
    try:
        return int(v)
    except Exception:
        return default


@dataclass(frozen=True)
class LLMConfig:
    provider: ProviderName
    groq_api_key: str
    groq_url: str
    groq_model: str
    ollama_url: str
    ollama_model: str
    timeout_seconds: float
    temperature: float
    max_tokens: int
    cache_enable: bool
    cache_ttl_seconds: int
    cache_max_items: int

    @staticmethod
    def from_env() -> "LLMConfig":
        provider = (os.getenv("LLM_PROVIDER") or "ollama").strip().lower()
        if provider not in ["ollama", "groq"]:
            provider = "ollama"

        return LLMConfig(
            provider=provider,  # type: ignore[assignment]
            groq_api_key=(os.getenv("GROQ_API_KEY") or "").strip(),
            groq_url=(os.getenv("GROQ_URL") or "https://api.groq.com/openai/v1/chat/completions").strip(),
            groq_model=(os.getenv("GROQ_MODEL") or "llama3-8b-8192").strip(),
            ollama_url=(os.getenv("OLLAMA_URL") or "http://localhost:11434").strip().rstrip("/"),
            ollama_model=(os.getenv("OLLAMA_MODEL") or "phi3:mini").strip(),
            timeout_seconds=_env_float("LLM_TIMEOUT_SECONDS", 20.0),
            temperature=_env_float("LLM_TEMPERATURE", 0.2),
            max_tokens=_env_int("LLM_MAX_TOKENS", 700),
            cache_enable=_env_bool("DOCTOR_ASSISTANT_CACHE_ENABLE", True),
            cache_ttl_seconds=_env_int("DOCTOR_ASSISTANT_CACHE_TTL_SECONDS", 900),
            cache_max_items=_env_int("DOCTOR_ASSISTANT_CACHE_MAX_ITEMS", 256),
        )


class _TTLCache:
    def __init__(self, max_items: int, ttl_seconds: int):
        self._max_items = max(1, int(max_items))
        self._ttl_seconds = max(1, int(ttl_seconds))
        self._store: dict[str, tuple[float, object]] = {}

    def get(self, key: str) -> Optional[object]:
        now = time.time()
        item = self._store.get(key)
        if not item:
            return None
        expires_at, value = item
        if expires_at <= now:
            self._store.pop(key, None)
            return None
        return value

    def set(self, key: str, value: object) -> None:
        now = time.time()
        self._store[key] = (now + self._ttl_seconds, value)
        if len(self._store) <= self._max_items:
            return
        # best-effort eviction: drop expired then oldest-ish by expiry
        expired = [k for k, (exp, _) in self._store.items() if exp <= now]
        for k in expired:
            self._store.pop(k, None)
        if len(self._store) <= self._max_items:
            return
        for k, _ in sorted(self._store.items(), key=lambda kv: kv[1][0])[: max(1, len(self._store) - self._max_items)]:
            self._store.pop(k, None)


_cache: Optional[_TTLCache] = None


def _get_cache(cfg: LLMConfig) -> Optional[_TTLCache]:
    global _cache
    if not cfg.cache_enable:
        return None
    if _cache is None or _cache._ttl_seconds != cfg.cache_ttl_seconds or _cache._max_items != cfg.cache_max_items:
        _cache = _TTLCache(max_items=cfg.cache_max_items, ttl_seconds=cfg.cache_ttl_seconds)
    return _cache


def _short_json(obj: object) -> str:
    try:
        return json.dumps(obj, ensure_ascii=False, separators=(",", ":"), default=str)[:6000]
    except Exception:
        return str(obj)[:6000]


async def _call_ollama(prompt: str, cfg: LLMConfig) -> str:
    url = f"{cfg.ollama_url}/api/generate"
    payload = {
        "model": cfg.ollama_model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": cfg.temperature,
        },
    }
    timeout = httpx.Timeout(cfg.timeout_seconds)
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(url, json=payload)
        r.raise_for_status()
        data = r.json()
        if not isinstance(data, dict) or "response" not in data:
            raise RuntimeError(f"Ollama unexpected response: {_short_json(data)}")
        return str(data.get("response") or "").strip()


async def _call_groq(system: str, user: str, cfg: LLMConfig) -> str:
    if not cfg.groq_api_key:
        raise RuntimeError("GROQ_API_KEY is not set")
    payload = {
        "model": cfg.groq_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": cfg.temperature,
        "max_tokens": cfg.max_tokens,
    }
    timeout = httpx.Timeout(cfg.timeout_seconds)
    headers = {"Authorization": f"Bearer {cfg.groq_api_key}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(cfg.groq_url, headers=headers, json=payload)
        r.raise_for_status()
        data = r.json()
        try:
            return str(data["choices"][0]["message"]["content"]).strip()
        except Exception:
            raise RuntimeError(f"Groq unexpected response: {_short_json(data)}")


async def generate_with_fallback(
    *,
    system_prompt: str,
    user_prompt: str,
    cache_key: Optional[str] = None,
    cfg: Optional[LLMConfig] = None,
) -> tuple[Optional[str], Optional[ProviderName], Optional[str]]:
    """
    Returns (text, provider_used, error_message).
    If both providers fail, returns (None, None, "...")
    """
    cfg = cfg or LLMConfig.from_env()
    cache = _get_cache(cfg)
    if cache_key and cache:
        cached = cache.get(cache_key)
        if isinstance(cached, str) and cached.strip():
            return cached, cfg.provider, None

    primary: ProviderName = cfg.provider
    secondary: ProviderName = "groq" if primary == "ollama" else "ollama"

    async def _try(provider: ProviderName) -> str:
        if provider == "ollama":
            # Ollama generate endpoint is not chat-based; prepend system prompt.
            return await _call_ollama(f"{system_prompt}\n\n{user_prompt}".strip(), cfg)
        return await _call_groq(system_prompt, user_prompt, cfg)

    errors: list[str] = []
    for provider in [primary, secondary]:
        try:
            text = await _try(provider)
            if cache_key and cache and isinstance(text, str) and text.strip():
                cache.set(cache_key, text)
            return text, provider, None
        except Exception as e:
            msg = f"{provider} failed: {e}"
            errors.append(msg)
            logger.exception("DoctorAssistant LLM call failed (%s).", provider)

    return None, None, "; ".join(errors) if errors else "LLM call failed"

