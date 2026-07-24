import { useEffect, useState } from "react";
import {
  shouldSkipSuggestedPrompts,
  SUGGESTIONS_RATE_LIMIT_RESET_KEY,
  suggestionResetAtFromResponse,
} from "@/lib/suggested-prompts-session";

const shimmer = `
  @keyframes shimmer {
    0% {
      background-position: -200% 0;
    }
    100% {
      background-position: 200% 0;
    }
  }
`;

export function SuggestedPrompts({
  imageUrl,
  hasApiKey,
  onSelect,
}: {
  imageUrl: string;
  hasApiKey: boolean;
  onSelect: (v: string) => void;
}) {
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [quotaLimited, setQuotaLimited] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchSuggestions() {
      setLoading(true);
      setQuotaLimited(false);
      try {
        const apiKey = localStorage.getItem("togetherApiKey");
        const storedResetAt = sessionStorage.getItem(
          SUGGESTIONS_RATE_LIMIT_RESET_KEY,
        );
        if (shouldSkipSuggestedPrompts(apiKey, storedResetAt)) {
          setSuggestions([]);
          setQuotaLimited(true);
          return;
        }
        if (apiKey || storedResetAt) {
          sessionStorage.removeItem(SUGGESTIONS_RATE_LIMIT_RESET_KEY);
        }

        const headers: HeadersInit = {};
        if (apiKey) {
          headers["x-api-key"] = apiKey;
        }

        const res = await fetch(
          `/api/suggested-prompts?imageUrl=${encodeURIComponent(imageUrl)}`,
          { headers },
        );
        if (res.status === 429) {
          sessionStorage.setItem(
            SUGGESTIONS_RATE_LIMIT_RESET_KEY,
            String(
              suggestionResetAtFromResponse(
                res.headers.get("x-ratelimit-reset"),
              ),
            ),
          );
          if (!cancelled) {
            setQuotaLimited(true);
          }
        }
        const data = await res.json();

        if (!cancelled) {
          setSuggestions(data.suggestions ?? []);
        }
      } catch {
        if (!cancelled) {
          setSuggestions([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchSuggestions();

    return () => {
      cancelled = true;
    };
  }, [hasApiKey, imageUrl]);

  return (
    <div className="p-2 md:p-4">
      <style>{shimmer}</style>

      {!loading && quotaLimited ? (
        <p
          role="status"
          aria-live="polite"
          className="mb-4 rounded-md bg-amber-400/10 px-3 py-2 text-xs/5 text-pretty text-amber-100"
        >
          Daily AI suggestion quota used. You can still type your own edit, or
          add a Together API key.
        </p>
      ) : loading || suggestions === null ? (
        <div className="grid grid-cols-3 gap-2 pb-4">
          {Array.from(Array(3).keys()).map((i) => (
            <div
              className="h-9 w-full animate-[shimmer_4.5s_infinite_linear] rounded-md bg-gradient-to-r from-[#1a1a1a] via-[#2a2a2a] to-[#1a1a1a] bg-[length:400%_100%]"
              key={i}
            />
          ))}
        </div>
      ) : (
        <div className="-mx-2 flex gap-2 overflow-x-auto px-2 pb-4 md:-mx-4 md:px-4">
          {suggestions.map((suggestion, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(suggestion)}
              className="shrink-0 rounded-md bg-gray-800 px-3 py-2 text-left text-sm transition enabled:cursor-pointer enabled:hover:bg-gray-700 disabled:opacity-50"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
