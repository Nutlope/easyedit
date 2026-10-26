import { MAX_UPLOAD_BYTES, UPLOAD_CONTENT_TYPES } from "@/lib/upload-limits";
import clsx from "clsx";
import { getImageData, usePresignedUpload } from "next-s3-upload";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import Spinner from "./Spinner";

export function ImageUploader({
  onUpload,
}: {
  onUpload: ({
    url,
    width,
    height,
  }: {
    url: string;
    width: number;
    height: number;
  }) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const { uploadToS3 } = usePresignedUpload();
  const [pending, startTransition] = useTransition();

  async function handleUpload(file: File) {
    if (
      !Object.hasOwn(UPLOAD_CONTENT_TYPES, file.type) ||
      file.size > MAX_UPLOAD_BYTES
    ) {
      toast.error(
        "Please upload a JPEG, PNG, WebP, GIF, or AVIF image up to 10 MB.",
      );
      return;
    }

    startTransition(async () => {
      try {
        const [result, data] = await Promise.all([
          uploadToS3(file, {
            endpoint: { request: { body: { filesize: file.size } } },
          }),
          getImageData(file),
        ]);

        onUpload({
          url: result.url,
          width: data.width ?? 1024,
          height: data.height ?? 768,
        });
      } catch (error) {
        toast.error(
          typeof error === "string"
            ? error
            : "Upload failed. Please try again.",
        );
      }
    });
  }

  return (
    <button
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        const data = e.dataTransfer;
        const file = data?.files?.[0];
        if (file) {
          handleUpload(file);
        }
      }}
      onDragEnter={() => setIsDragging(true)}
      onDragLeave={() => {
        setIsDragging(false);
      }}
      onClick={() => {
        fileInputRef.current?.click();
      }}
      className={clsx(
        isDragging && "text-gray-400",
        !isDragging && !pending && "text-gray-700 hover:text-gray-400",
        "relative flex aspect-[4/3] w-full cursor-pointer flex-col items-center justify-center rounded-xl bg-gray-900 focus-visible:text-gray-400 focus-visible:outline-none",
      )}
    >
      <svg
        className={clsx("absolute inset-0 transition-colors")}
        viewBox="0 0 400 300"
      >
        <rect
          x=".5"
          y=".5"
          width="399"
          height="299"
          rx="6"
          ry="6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="8,10"
        />
      </svg>

      {!pending ? (
        <>
          <div className="flex grow flex-col justify-center">
            <p className="text-xl text-white">Drop a photo</p>
            <p className="mt-1 text-gray-500">or click to upload</p>
          </div>

          <div className="flex flex-row items-center justify-center gap-2 pb-4">
            <p className="text-sm text-gray-500">Powered by</p>
            <img src="/poweredby.png" className="h-[20px]" />
          </div>
        </>
      ) : (
        <div className="text-white">
          <Spinner />
          <p className="mt-2 text-lg">Uploading...</p>
        </div>
      )}

      <input
        type="file"
        accept={Object.keys(UPLOAD_CONTENT_TYPES).join(",")}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            handleUpload(file);
          }
        }}
        ref={fileInputRef}
      />
    </button>
  );
}
