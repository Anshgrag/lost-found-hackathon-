import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Campus Recovery Hub",
  description: "Empathetic loss and recovery assistance.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        colorScheme: 'dark'
      }}
    >
      <body className="min-h-full flex flex-col bg-neutral-900 text-neutral-100">
        {children}
      </body>
    </html>
  );
}
