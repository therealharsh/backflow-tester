'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { getBrowserClient } from '@/lib/supabase'

interface AdminCtx {
  session: Session | null
  loading: boolean
}

const Ctx = createContext<AdminCtx>({ session: null, loading: true })
export const useAdmin = () => useContext(Ctx)

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = getBrowserClient()
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setLoading(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  return <Ctx.Provider value={{ session, loading }}>{children}</Ctx.Provider>
}
