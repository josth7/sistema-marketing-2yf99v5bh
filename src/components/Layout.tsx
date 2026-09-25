/* Layout Component - A component that wraps the main content of the app
   - Use this file to add a header, footer, or other elements that should be present on every page
   - This component is used in the App.tsx file to wrap the main content of the app */

import { Outlet } from 'react-router-dom'
import { Rocket } from 'lucide-react'

export default function Layout() {
  const currentYear = new Date().getFullYear()

  return (
    <div className="min-h-screen flex flex-col bg-[#F9FAFB] text-[#1F2937]">
      {/* Top Header */}
      <header className="h-16 border-b border-border bg-white/80 backdrop-blur sticky top-0 z-30 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-[#6C3EF5] to-[#A855F7] flex items-center justify-center text-white shadow-sm">
            <Rocket className="h-5 w-5" />
          </div>
          <span className="font-semibold text-lg tracking-tight text-[#1F2937]">
            SISTEMA MARKETING
          </span>
        </div>
        <div className="text-xs font-medium text-[#6B7280] bg-gray-100 px-2.5 py-1 rounded-full border border-gray-200">
          v1.0.0
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="py-4 border-t border-border bg-white text-center text-xs text-[#6B7280]">
        SISTEMA MARKETING v1.0.0 • {currentYear}
      </footer>
    </div>
  )
}
