import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Providers from "@/components/Providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://the-page-that-edits-itself.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "The page that edits itself",
  description:
    "Suggest a change. An AI agent moderates it, generates a patch, opens a GitHub pull request, and ships it. Every edit is traceable.",
  openGraph: {
    title: "The page that edits itself",
    description:
      "Suggest a change. An AI agent moderates it, generates a patch, opens a GitHub pull request, and ships it. Every edit is traceable.",
    url: siteUrl,
    siteName: "The page that edits itself",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "The page that edits itself",
    description:
      "Suggest a change. An AI agent moderates it, generates a patch, opens a GitHub pull request, and ships it. Every edit is traceable.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0e0e14",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
