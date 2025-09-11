import { SpeedInsights } from "@vercel/speed-insights/next"
import type { Metadata } from "next";
import '@fontsource/inter';
import '@fontsource/raleway';
import "./globals.css";
import Navbar from './Navbar';

export const metadata: Metadata = {
  title: "Inboxly – Effortless Email Analytics & Insights",
  description: "Inboxly helps you understand your email ecosystem with beautiful analytics, security insights, and a stunning, modern UI.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    
    <html lang="en">
      <SpeedInsights/>
      <body className="font-inter antialiased bg-gradient-to-br from-indigo-50 to-purple-100 dark:from-zinc-900 dark:to-indigo-950 min-h-screen flex flex-col">
        <header className="w-full py-3 px-0 sticky top-0 z-30 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-md shadow-lg rounded-b-2xl border-b border-gray-100 dark:border-zinc-800">
          <div className="container mx-auto flex items-center justify-between gap-4 px-4 sm:px-8">
            <Navbar />
          </div>
        </header>
        <main className="flex-grow flex flex-col justify-center items-center w-full">
          {children}
        </main>
        <footer className="w-full py-6 mt-12 bg-white/80 dark:bg-zinc-900/80 text-center text-gray-500 text-sm border-t border-gray-200 dark:border-zinc-800">
          <span>
            &copy; {new Date().getFullYear()} Inboxly. Crafted with <span className="text-pink-500">♥</span> by Himanshu Parihar.
          </span>
        </footer>
      </body>
    </html>
  );
}
