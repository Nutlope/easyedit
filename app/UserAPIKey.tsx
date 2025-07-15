"use client";

import { useEffect, useState } from "react";

const isValidKeyFormat = (key: string) => /^[a-zA-Z0-9]{64,}$/.test(key);

export function UserAPIKey() {
  const [userAPIKey, setUserAPIKey] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("togetherApiKey") || "";
    }
    return "";
  });

  const [isValid, setIsValid] = useState(true);
  const [isChecking, setIsChecking] = useState(false);

  const validateKey = async (key: string) => {
    if (!key) {
      setIsValid(true);
      return;
    }

    if (!isValidKeyFormat(key)) {
      setIsValid(false);
      return;
    }

    setIsChecking(true);

    try {
      const res = await fetch("https://api.together.xyz/v1/models", {
        headers: {
          Authorization: `Bearer ${key}`,
        },
      });

      setIsValid(res.ok);
    } catch {
      setIsValid(false);
    } finally {
      setIsChecking(false);
    }
  };

  useEffect(() => {
    if (userAPIKey) {
      localStorage.setItem("togetherApiKey", userAPIKey);
      validateKey(userAPIKey);
    } else {
      localStorage.removeItem("togetherApiKey");
      setIsValid(true);
    }
  }, [userAPIKey]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-3 items-center">
        <div className="text-left text-xs max-md:hidden">
          <p className="text-gray-600">[Optional] Add your</p>
          <a
            href="https://api.together.xyz/settings/api-keys"
            target="_blank"
            className="text-gray-300 underline"
          >
            Together API Key:
          </a>
        </div>
        <input
          type="password"
          value={userAPIKey}
          autoComplete="off"
          onChange={(e) => setUserAPIKey(e.target.value)}
          placeholder="API key"
          className={`h-8 rounded border-[0.5px] px-2 text-sm focus-visible:outline
            ${
              isValid
                ? "border-gray-700 bg-gray-900 focus-visible:outline-gray-200"
                : "border-red-500 bg-red-900 focus-visible:outline-red-300"
            }`}
        />
      </div>

      {!isChecking && !isValid && (
        <p className="text-xs text-red-400 pl-[104px]">
          Invalid Together AI key. Please double-check or create one at{" "}
          <a
            href="https://api.together.xyz/settings/api-keys"
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Together API settings
          </a>.
        </p>
      )}

      {isChecking && (
        <p className="text-xs text-gray-400 pl-[104px]">Validating key...</p>
      )}
    </div>
  );
}
