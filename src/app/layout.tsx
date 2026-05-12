import type { Metadata } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://apiq-mvp.vercel.app"),
  title: "APIQ — API Intelligence",
  description:
    "A knowledgeable second opinion for your OpenAPI specs. Detects spec drift, vendor patterns, and architecture issues.",
  openGraph: {
    title: "APIQ — API Intelligence",
    description:
      "A knowledgeable second opinion for your OpenAPI specs. Detects spec drift, vendor patterns, and architecture issues.",
    url: "https://apiq-mvp.vercel.app",
    siteName: "APIQ",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "APIQ — API Intelligence",
    description:
      "A knowledgeable second opinion for your OpenAPI specs.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
