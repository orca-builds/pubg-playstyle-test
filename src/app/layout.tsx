import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import LoadingLayer from "@/components/LoadingLayer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://pubg-playstyle-test.vercel.app"),
  title: "PUBG 플레이스타일 테스트",
  description: "24개의 상황 질문으로 알아보는 나의 PUBG 플레이스타일",
  openGraph: {
    title: "PUBG 플레이스타일 테스트",
    description: "24개의 상황 질문으로 알아보는 나의 PUBG 플레이스타일",
    type: "website",
    siteName: "PUBG 플레이스타일 테스트",
  },
  twitter: {
    card: "summary",
    title: "PUBG 플레이스타일 테스트",
    description: "24개의 상황 질문으로 알아보는 나의 PUBG 플레이스타일",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><LoadingLayer>{children}</LoadingLayer></body>
    </html>
  );
}
