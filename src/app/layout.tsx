import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Confirmation Check",
  description:
    "Paste a supplier order confirmation. See what changed and which production run it affects.",
};

// Night mode is the default; a stored "light" preference wins. The inline
// script runs before paint so the page never flashes the wrong theme.
const themeInit = `try { if (localStorage.getItem("theme") === "light") document.documentElement.classList.remove("dark"); } catch {}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-full flex flex-col bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        {children}
      </body>
    </html>
  );
}
