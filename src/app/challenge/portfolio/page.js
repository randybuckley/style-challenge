'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import jsPDF from 'jspdf'
import exifr from 'exifr'
import { supabase } from '../../../lib/supabaseClient' // keep this path

export default function PortfolioPage() {
  const router = useRouter()

  const [user, setUser] = useState(null)
  const [latestByStep, setLatestByStep] = useState({}) // {1:url,2:url,3:url,4:url}
  const [loading, setLoading] = useState(true)

  const [firstName, setFirstName] = useState('')
  const [secondName, setSecondName] = useState('')
  const [salonName, setSalonName] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(0)
  const [skipNextAutosave, setSkipNextAutosave] = useState(true) // avoids autosave right after load
  const [pdfBusy, setPdfBusy] = useState(false) // 👈 prevent double-clicks while generating

  const frameRef = useRef(null)
  const STORAGE_PREFIX =
    'https://sifluvnvdgszfchtudkv.supabase.co/storage/v1/object/public/uploads/'

  // Load session, uploads (latest per step), and profile
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const sessionUser = sessionData?.session?.user
        if (!sessionUser) {
          router.push('/')
          return
        }
        if (cancelled) return
        setUser(sessionUser)

        // newest first → keep first per step
        const { data: uploads, error: upErr } = await supabase
          .from('uploads')
          .select('step_number, image_url, created_at')
          .eq('user_id', sessionUser.id)
          .in('step_number', [1, 2, 3, 4])
          .order('created_at', { ascending: false })

        if (upErr) console.warn('[uploads] error:', upErr.message)

        const latest = {}
        for (const row of uploads || []) {
          if (!row?.image_url) continue
          const step = row.step_number
          if (!latest[step]) {
            latest[step] = row.image_url.startsWith('http')
              ? row.image_url
              : STORAGE_PREFIX + row.image_url
          }
        }
        if (!cancelled) setLatestByStep(latest)

        // ensure profile row + load fields
        const { error: upsertErr } = await supabase
          .from('profiles')
          .upsert(
            { id: sessionUser.id, email: sessionUser.email ?? null },
            { onConflict: 'id' }
          )
        if (upsertErr) console.warn('[profiles.upsert] error:', upsertErr.message)

        const { data: profile, error: profErr } = await supabase
          .from('profiles')
          .select('first_name, second_name, salon_name')
          .eq('id', sessionUser.id)
          .single()

        if (profErr) {
          console.warn('[profiles.select] error:', profErr.message)
        } else if (profile && !cancelled) {
          setFirstName(profile.first_name || '')
          setSecondName(profile.second_name || '')
          setSalonName(profile.salon_name || '')
          setSkipNextAutosave(true) // skip the initial autosave triggered by these sets
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [router])

  // Debounced autosave (skips the first run after loading the profile)
  useEffect(() => {
    if (!user) return
    if (skipNextAutosave) {
      setSkipNextAutosave(false)
      return
    }
    setSaving(true)
    const t = setTimeout(async () => {
      try {
        const { error } = await supabase.from('profiles').upsert({
          id: user.id,
          email: user.email ?? null,
          first_name: (firstName || '').trim() || null,
          second_name: (secondName || '').trim() || null,
          salon_name: (salonName || '').trim() || null
        })
        if (error) {
          console.warn('[profiles.autosave] error:', error.message)
        } else {
          setSavedAt(Date.now())
        }
      } finally {
        setSaving(false)
      }
    }, 600)
    return () => clearTimeout(t)
  }, [firstName, secondName, salonName, user, skipNextAutosave])

  // ✅ FIXED SYNTAX HERE
  const displayName = useMemo(
    () => `${firstName || ''} ${secondName || ''}`.trim(),
    [firstName, secondName]
  )

  // -------- PDF helpers (EXIF-aware) --------
  const blobToDataURL = (blob) =>
    new Promise((resolve) => {
      const r = new FileReader()
      r.onloadend = () => resolve(r.result)
      r.readAsDataURL(blob)
    })

  const urlToDataURL = async (url) => {
    try {
      const res = await fetch(url, { mode: 'cors' })
      const blob = await res.blob()
      return await blobToDataURL(blob)
    } catch (e) {
      console.warn('[urlToDataURL] fallback for', url, e)
      return 'data:image/gif;base64,R0lGODlhAQABAAAAACw='
    }
  }

  const loadImage = (src) =>
    new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = (err) => reject(err)
      img.src = src
    })

  const drawOriented = (ctx, img, orientation, targetW, targetH) => {
    const c = ctx.canvas
    const swap = () => {
      const tmp = c.width
      c.width = c.height
      c.height = tmp
    }
    c.width = targetW
    c.height = targetH

    switch (orientation) {
      case 2: ctx.translate(c.width, 0); ctx.scale(-1, 1); break
      case 3: ctx.translate(c.width, c.height); ctx.rotate(Math.PI); break
      case 4: ctx.translate(0, c.height); ctx.scale(1, -1); break
      case 5: swap(); ctx.rotate(0.5 * Math.PI); ctx.scale(1, -1); break
      case 6: swap(); ctx.rotate(0.5 * Math.PI); ctx.translate(0, -c.width); break
      case 7: swap(); ctx.rotate(-0.5 * Math.PI); ctx.scale(1, -1); ctx.translate(-c.height, 0); break
      case 8: swap(); ctx.rotate(-0.5 * Math.PI); ctx.translate(-c.height, 0); break
      default: break
    }

    const arImg = img.width / img.height
    const arBox = (orientation >= 5 && orientation <= 8)
      ? c.height / c.width
      : c.width / c.height

    let sx = 0, sy = 0, sw = img.width, sh = img.height
    if (arImg > arBox) {
      const newW = sh * arBox
      sx = (sw - newW) / 2
      sw = newW
    } else {
      const newH = sw / arBox
      sy = (sh - newH) / 2
      sh = newH
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height)
  }

  // --- (rest of your PDF + render code unchanged) ---
  // everything from "const orientedDataURL" down to the end of StepCard remains identical
  // ✅ no other syntax errors

}