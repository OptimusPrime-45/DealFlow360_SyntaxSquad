import "./globals.css";
import { AuthProvider } from "../context/AuthContext.js";
import { SidebarProvider } from "../context/SidebarContext.js";

export const metadata = {
  title: "DealFlow360 — Self-Governing Deal Engine",
  description: "Enterprise multi-line quotation governance, approval chains, and deal execution platform",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col bg-[#F8F9FA] text-[#212529] font-sans">
        <AuthProvider>
          <SidebarProvider>
            {children}
          </SidebarProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

