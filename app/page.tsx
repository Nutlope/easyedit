"use client";

import Image, { getImageProps } from "next/image";
import { useRef, useState, useTransition, useEffect, useMemo } from "react";
import { generateImage } from "./actions";
import { ImageUploader } from "./ImageUploader";
import { Fieldset } from "./Fieldset";
import Spinner from "./Spinner";
import { preloadNextImage } from "@/lib/preload-next-image";
import clsx from "clsx";
import { SampleImages } from "./SampleImages";
import { getAdjustedDimensions } from "@/lib/get-adjusted-dimentions";
import { DownloadIcon } from "./components/DownloadIcon";
import { toast } from "sonner";
import { SuggestedPrompts } from "./suggested-prompts/SuggestedPrompts";
import { flushSync } from "react-dom";

// Helper to slugify the prompt for filenames
function slugifyPrompt(prompt?: string): string {
  if (!prompt) return "image";
  // Take first 8 words, join with dashes, remove non-alphanum, limit to 40 chars
  const words = prompt.split(/\s+/).slice(0, 8);
  let slug = words.join("-").toLowerCase();
  slug = slug.replace(/[^a-z0-9\-]/g, "");
  if (slug.length > 40) slug = slug.slice(0, 40);
  return slug || "image";
}

export default function Home() {
  const [images, setImages] = useState<
    { url: string; version: number; prompt?: string }[]
  >([]);
  const [imageData, setImageData] = useState<{
    width: number;
    height: number;
  }>({ width: 1024, height: 768 });
  const [activeImageUrl, setActiveImageUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [prompt, setPrompt] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedModel, setSelectedModel] = useState<
    | "black-forest-labs/FLUX.1-kontext-dev"
    | "black-forest-labs/FLUX.1-kontext-pro"
  >("black-forest-labs/FLUX.1-kontext-dev");
  const [hasApiKey, setHasApiKey] = useState(false);

  const activeImage = useMemo(
    () => images.find((i) => i.url === activeImageUrl),
    [images, activeImageUrl],
  );

  const adjustedImageDimensions = getAdjustedDimensions(
    imageData.width,
    imageData.height,
  );

  useEffect(() => {
    function handleNewSession() {
      setImages([]);
      setActiveImageUrl(null);
    }
    window.addEventListener("new-image-session", handleNewSession);
    return () => {
      window.removeEventListener("new-image-session", handleNewSession);
    };
  }, []);

  useEffect(() => {
    const checkApiKey = () => {
      const apiKey = localStorage.getItem("togetherApiKey");
      const hasKey = !!apiKey;
      setHasApiKey(hasKey);

      // If Pro model is selected but no API key, switch to Dev model
      if (!hasKey && selectedModel === "black-forest-labs/FLUX.1-kontext-pro") {
        setSelectedModel("black-forest-labs/FLUX.1-kontext-dev");
      }
    };

    checkApiKey();

    // Listen for storage events (when localStorage changes in other tabs)
    window.addEventListener("storage", checkApiKey);

    // Poll for API key changes every 500ms to catch changes in the same tab
    const interval = setInterval(checkApiKey, 500);

    return () => {
      window.removeEventListener("storage", checkApiKey);
      clearInterval(interval);
    };
  }, [selectedModel]);

  async function handleDownload() {
    if (!activeImage) return;

    const imageProps = getImageProps({
      src: activeImage.url,
      alt: "Generated image",
      height: imageData.height,
      width: imageData.width,
      quality: 100,
    });

    // Fetch the image
    const response = await fetch(imageProps.props.src);
    const blob = await response.blob();

    const extension = blob.type.includes("jpeg")
      ? "jpg"
      : blob.type.includes("png")
        ? "png"
        : blob.type.includes("webp")
          ? "webp"
          : "bin";

    // Create a download link
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    // Use slugified prompt as filename prefix
    const slug = slugifyPrompt(activeImage.prompt);
    link.download = `v${activeImage.version}-${slug}.${extension}`;
    document.body.appendChild(link);
    link.click();

    // Cleanup
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 md:flex-row">
        <div
          ref={scrollRef}
          className="flex shrink-0 snap-x scroll-pl-4 gap-4 pt-1 pb-5 max-md:order-2 max-md:-mx-4 max-md:overflow-x-auto max-md:px-4 md:w-40 md:flex-col"
        >
          {images
            .slice()
            .reverse()
            .map((image) => (
              <div
                className="flex shrink-0 snap-start items-center gap-3"
                key={image.url}
              >
                <span
                  className={clsx(
                    activeImageUrl === image.url
                      ? "text-white"
                      : "text-gray-400",
                    "w-4 shrink-0 font-mono text-xs max-md:hidden",
                  )}
                >
                  v{image.version}
                </span>
                <button
                  className={clsx(
                    activeImageUrl === image.url
                      ? "max-md:border-white"
                      : "max-md:border-transparent",
                    "cursor-pointer overflow-hidden rounded-md focus-visible:outline focus-visible:outline-offset-2 focus-visible:outline-white max-md:border",
                  )}
                  onClick={() => setActiveImageUrl(image.url)}
                >
                  <Image
                    width={imageData.width}
                    height={imageData.height}
                    style={{
                      aspectRatio: imageData.width / imageData.height,
                    }}
                    className="w-auto max-md:h-20"
                    src={image.url}
                    alt=""
                  />
                </button>
              </div>
            ))}
        </div>

        <div className="grow">
          {!activeImage ? (
            <>
              <h1 className="mx-auto max-w-md text-center text-2xl text-balance text-white md:text-4xl">
                Edit any image with a simple prompt
              </h1>

              <div className="mt-8">
                <ImageUploader
                  onUpload={({ url, width, height }) => {
                    setImageData({ width, height });
                    setImages([{ url, version: 0 }]);
                    setActiveImageUrl(url);
                  }}
                />
              </div>

              <div className="mt-8">
                <SampleImages
                  onSelect={({ url, width, height }) => {
                    setImageData({ width, height });
                    setImages([{ url, version: 0 }]);
                    setActiveImageUrl(url);
                  }}
                />
              </div>
            </>
          ) : (
            <div>
              <div className="group relative flex items-center justify-center overflow-hidden rounded-xl bg-gray-900">
                <Image
                  width={imageData.width}
                  height={imageData.height}
                  src={activeImage.url}
                  style={{
                    aspectRatio:
                      adjustedImageDimensions.width /
                      adjustedImageDimensions.height,
                  }}
                  alt="uploaded image"
                  className="object-contain max-md:h-[50vh] md:max-h-[70vh]"
                />

                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-4 bg-gradient-to-t from-black/70 via-black/50 to-transparent p-4 pt-8">
                  <div className="flex items-center gap-4">
                    <div className="py-1">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-black/75 font-mono text-xs ring ring-white/10">
                        v{activeImage.version}
                      </div>
                    </div>
                    {activeImage.prompt && (
                      <div>
                        <p className="text-xs text-gray-400">Prompt used:</p>
                        <p className="text-sm text-gray-50 md:text-base">
                          {activeImage.prompt}
                        </p>
                      </div>
                    )}
                  </div>
                  <button
                    title="Download this image"
                    onClick={handleDownload}
                    className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white text-gray-900 transition hover:bg-gray-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    <DownloadIcon />
                  </button>
                </div>

                <div className="pointer-events-none absolute inset-0 rounded-xl ring ring-white/10 ring-inset" />

                {pending && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gray-900/75">
                    <Spinner className="size-6 text-white" />
                    <p className="animate-pulse text-xl text-white">
                      Editing your image...
                    </p>
                    <p className="text-sm text-gray-400">
                      This can take up to 15 seconds.
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-4">
                {activeImage ? (
                  <form
                    className="relative"
                    key={activeImageUrl}
                    ref={formRef}
                    action={(formData) => {
                      startTransition(async () => {
                        const prompt = formData.get("prompt") as string;

                        const generation = await generateImage({
                          imageUrl: activeImage.url, // Use the currently active image
                          prompt,
                          width: imageData.width,
                          height: imageData.height,
                          userAPIKey: localStorage.getItem("togetherApiKey"),
                          model: selectedModel,
                        });

                        if (generation.success) {
                          await preloadNextImage({
                            src: generation.url,
                            width: imageData.width,
                            height: imageData.height,
                          });
                          setImages((current) => [
                            ...current,
                            {
                              url: generation.url,
                              prompt,
                              version: current.length,
                            },
                          ]);
                          setActiveImageUrl(generation.url);
                          setPrompt("");
                        } else {
                          toast(generation.error);
                        }
                      });
                    }}
                  >
                    <div className="mb-4">
                      <label
                        htmlFor="model-select"
                        className="mb-2 block text-sm font-medium text-gray-300"
                      >
                        Model
                      </label>
                      <div className="relative">
                        <select
                          id="model-select"
                          value={selectedModel}
                          onChange={(e) =>
                            setSelectedModel(
                              e.target.value as typeof selectedModel,
                            )
                          }
                          disabled={pending}
                          className="w-full appearance-none rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <option value="black-forest-labs/FLUX.1-kontext-dev">
                            Flux Kontext Dev
                          </option>
                          <option
                            value="black-forest-labs/FLUX.1-kontext-pro"
                            disabled={!hasApiKey}
                          >
                            Flux Kontext Pro{" "}
                            {!hasApiKey && "(Together API key required)"}
                          </option>
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                        </div>
                      </div>
                      {!hasApiKey &&
                        selectedModel ===
                          "black-forest-labs/FLUX.1-kontext-pro" && (
                          <p className="mt-1 text-xs text-amber-400">
                            Pro model requires an API key. Please add your
                            Together AI API key to use this model.
                          </p>
                        )}
                    </div>

                    <Fieldset className="relative rounded-xl bg-gray-900">
                      <div className="pointer-events-none absolute inset-px rounded-xl ring ring-white/10" />
                      {/* Mobile: no autofocus */}
                      <input
                        type="text"
                        name="prompt"
                        className="mr-2 w-full px-3 py-4 pr-14 focus-visible:outline-none disabled:opacity-50 md:hidden"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Tell us the changes you want..."
                        required
                      />

                      {/* Desktop: autofocus */}
                      <input
                        type="text"
                        name="prompt"
                        autoFocus
                        className="mr-2 w-full px-4 py-5 pr-14 focus-visible:outline-none disabled:opacity-50 max-md:hidden"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Tell us the changes you want..."
                        required
                      />

                      <button className="absolute top-3 right-4 flex size-8 items-center justify-center rounded-full bg-white text-gray-900 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white enabled:cursor-pointer enabled:hover:bg-white/80 disabled:opacity-50 md:top-4">
                        <svg
                          width="10"
                          viewBox="0 0 8 10"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M3.49996 9.24264C3.49997 9.51878 3.72382 9.74264 3.99997 9.74264C4.27611 9.74264 4.49996 9.51878 4.49997 9.24264L3.49996 9.24264ZM4.35352 0.403806C4.15826 0.208544 3.84167 0.208544 3.64641 0.403806L0.464431 3.58579C0.269169 3.78105 0.269169 4.09763 0.464431 4.29289C0.659693 4.48816 0.976276 4.48816 1.17154 4.29289L3.99996 1.46447L6.82839 4.29289C7.02365 4.48816 7.34024 4.48816 7.5355 4.29289C7.73076 4.09763 7.73076 3.78105 7.5355 3.58579L4.35352 0.403806ZM3.99996 9.24264L4.49997 9.24264V0.757359L3.99996 0.757359L3.49996 0.757359V9.24264L3.99996 9.24264Z"
                            fill="#262626"
                          />
                        </svg>
                      </button>

                      <SuggestedPrompts
                        imageUrl={activeImage.url}
                        onSelect={(suggestion) => {
                          flushSync(() => {
                            setPrompt(suggestion);
                          });
                          formRef.current?.requestSubmit();
                        }}
                      />
                    </Fieldset>
                  </form>
                ) : (
                  <p className="pb-19 text-base/12 md:pb-25">
                    Select an image to make more edits.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="w-40 shrink-0" />
      </div>
    </>
  );
}
