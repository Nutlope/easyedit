import type { Metadata, Viewport } from "next";
import { Kulim_Park, Syne_Mono } from "next/font/google";
import "./globals.css";
import { Logo } from "./Logo";
import PlausibleProvider from "next-plausible";
import { UserAPIKey } from "./UserAPIKey";
import { Toaster } from "@/components/ui/sonner";
import GitHub from "./components/GitHubIcon";
import XformerlyTwitter from "./components/TwitterIcon";
import { PlusIcon } from "./components/PlusIcon";

const kulimPark = Kulim_Park({
  variable: "--font-kulim-park",
  subsets: ["latin"],
  weight: ["200", "300", "400", "600", "700"],
});

const syneMono = Syne_Mono({
  variable: "--font-syne-mono",
  subsets: ["latin"],
  weight: ["400"],
});

const title = "EasyEdit – Edit images with one prompt";
const description = "The easiest way to edit images in one prompt";
const url = "https://www.easyedit.io/";
const ogimage = "https://www.easyedit.io/og-image.png";
const sitename = "easyedit.io";

export const metadata: Metadata = {
  metadataBase: new URL(url),
  title,
  description,
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    images: [ogimage],
    title,
    description,
    url: url,
    siteName: sitename,
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    images: [ogimage],
    title,
    description,
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${kulimPark.variable} ${syneMono.variable}`}>
      <head>
        <PlausibleProvider domain="easyedit.io" />
      </head>
      <body className="flex min-h-screen w-full flex-col antialiased">
        <header className="relative flex p-4 text-center text-white">
          <UserAPIKey />
          <a
            target="_blank"
            rel="noopener noreferrer"
            href="https://easyedit.io"
            className="absolute left-1/2 flex grow -translate-x-1/2 items-center gap-2 text-lg max-md:hidden"
          >
            <Logo />
            EasyEdit
          </a>

          <div className="absolute top-4 right-4 flex gap-2">
            <a
              href="https://github.com/Nutlope/easyedit"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-8 cursor-pointer items-center gap-2 rounded border-[0.5px] border-gray-700 bg-gray-900 px-3.5 text-gray-200 transition hover:bg-gray-800"
              title="Star on GitHub"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="currentColor"
                viewBox="0 0 20 20"
                className="h-4 w-4 text-yellow-400"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.967a1 1 0 00.95.69h4.175c.969 0 1.371 1.24.588 1.81l-3.38 2.455a1 1 0 00-.364 1.118l1.287 3.966c.3.922-.755 1.688-1.54 1.118l-3.38-2.454a1 1 0 00-1.175 0l-3.38 2.454c-.784.57-1.838-.196-1.54-1.118l1.287-3.966a1 1 0 00-.364-1.118L2.05 9.394c-.783-.57-.38-1.81.588-1.81h4.175a1 1 0 00.95-.69l1.286-3.967z" />
              </svg>
              <GitHub className="h-4 w-4" />
              <span className="hidden md:inline">Star on GitHub</span>
            </a>
            <a
              href="https://easyedit.io"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden h-8 cursor-pointer items-center gap-2 rounded border-[0.5px] border-gray-700 bg-gray-900 px-3.5 text-gray-200 transition hover:bg-gray-800 md:flex"
            >
              <PlusIcon />
              New Image
            </a>
          </div>
        </header>

        <main className="flex flex-1 flex-col items-center justify-center overflow-auto pt-4 md:pb-12">
          <div className="w-full">{children}</div>
        </main>

        <Toaster />

        <footer className="flex flex-col items-center p-4 max-md:gap-4 md:flex-row md:justify-between">
          <p className="text-sm text-gray-400">
            Powered by{" "}
            <a
              href="https://www.together.ai/blog/flux-1-kontext"
              target="_blank"
              className="text-gray-200 underline underline-offset-2"
            >
              Flux Kontext
            </a>{" "}
            on{" "}
            <a
              href="https://togetherai.link"
              target="_blank"
              className="text-gray-200 underline underline-offset-2"
            >
              Together AI
            </a>
          </p>
          <div className="flex gap-3 text-sm">
            <a
              href="https://github.com/Nutlope/easyedit"
              target="_blank"
              className="flex h-7 items-center gap-1 rounded border-[0.5px] border-gray-700 px-2.5 text-gray-400 transition-colors hover:border-gray-300 hover:text-gray-300"
            >
              <GitHub className="size-[10px]" />
              GitHub
            </a>
            <a
              href="https://x.com/nutlope"
              target="_blank"
              className="flex h-7 items-center gap-1 rounded border-[0.5px] border-gray-700 px-2.5 text-gray-400 transition-colors hover:border-gray-300 hover:text-gray-300"
            >
              <XformerlyTwitter className="size-[10px]" />
              Twitter
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
