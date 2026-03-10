import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

// Using Inter — a clean, modern sans-serif
const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Everest Calendar | Product Launch Command Centre",
  description: "Plan, track, and execute your product launch with Everest Calendar by Everest Labs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
