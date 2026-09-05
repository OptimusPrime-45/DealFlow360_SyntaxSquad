import "./globals.css";
import { AuthProvider } from "../context/AuthContext.js";


export const metadata = {
  title: "DealFlow360 — Self-Governing Deal Engine",
  description: "Enterprise multi-line quotation governance, approval chains, and deal execution platform",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#F8F9FA] text-[#212529]">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
