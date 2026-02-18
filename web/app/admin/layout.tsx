'use client'

import { AdminProvider } from './AdminContext'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminProvider>
      <div className="section py-8 max-w-4xl mx-auto">{children}</div>
    </AdminProvider>
  )
}
