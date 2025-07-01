import { startTransition, useActionState, useEffect } from "react";
import { getSuggestions } from "./actions";

const cache = new Map<string, string[]>();

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
  onSelect,
}: {
  imageUrl: string;
  onSelect: (v: string) => void;
}) {
  const [state, action, pending] = useActionState<{
    url: string;
    suggestions: string[];
  } | null>(async () => {
    let cachedSuggestions = cache.get(imageUrl);

    if (!cachedSuggestions) {
      const newSuggestions = await getSuggestions(
        imageUrl,
        localStorage.getItem("togetherApiKey"),
      );
      cache.set(imageUrl, newSuggestions);
      cachedSuggestions = newSuggestions;
    }

    return { url: imageUrl, suggestions: cachedSuggestions };
  }, null);

  useEffect(() => {
    if (!pending && state?.url !== imageUrl) {
      setTimeout(() => {
        startTransition(() => {
          action();
        });
      }, 50);
    }
  }, [action, imageUrl, pending, state?.url]);

  return (
    <div className="p-2 md:p-4">
      <style>{shimmer}</style>

      {/* {true ? ( */}
      {pending || !state ? (
        <div className="grid grid-cols-3 gap-2 pb-4">
          {Array.from(Array(3).keys()).map((i) => (
            <div
              className="h-9 w-full animate-[shimmer_4.5s_infinite_linear] rounded-md bg-gradient-to-r from-[#1a1a1a] via-[#2a2a2a] to-[#1a1a1a] bg-[length:400%_100%]"
              key={i}
            />
          ))}
        </div>
      ) : (
        <div className="-mx-2 flex gap-2 overflow-x-auto px-2 pb-4 md:-mx-4 md:px-4 no-scrollbar">
          {state?.suggestions.map((suggestion, i) => (
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
