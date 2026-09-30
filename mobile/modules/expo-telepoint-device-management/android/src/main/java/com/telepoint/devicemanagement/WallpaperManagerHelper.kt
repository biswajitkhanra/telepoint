package com.telepoint.devicemanagement

import android.app.WallpaperManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.drawable.BitmapDrawable
import android.os.Build
import android.util.DisplayMetrics
import java.io.File

/**
 * Branded overdue wallpaper. On lock, cache the customer's current wallpaper and
 * set a red "EMI OVERDUE" wallpaper on home + lock screens. On unlock, restore
 * the cached wallpaper. Uses only WallpaperManager (SET_WALLPAPER, a normal
 * permission). Best-effort — never throws into the caller.
 */
object WallpaperManagerHelper {
  private const val CACHED = "customer_cached_wallpaper.png"

  private fun drawOverdueBitmap(): Bitmap {
    val dm: DisplayMetrics = android.content.res.Resources.getSystem().displayMetrics
    val w = if (dm.widthPixels > 0) dm.widthPixels else 1080
    val h = if (dm.heightPixels > 0) dm.heightPixels else 1920
    val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    val c = Canvas(bmp)
    c.drawColor(Color.rgb(0xB9, 0x1C, 0x1C)) // deep red
    val title = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.WHITE; textAlign = Paint.Align.CENTER; isFakeBoldText = true
      textSize = w * 0.11f
    }
    val sub = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = Color.argb(230, 255, 255, 255); textAlign = Paint.Align.CENTER
      textSize = w * 0.045f
    }
    c.drawText("EMI OVERDUE", w / 2f, h * 0.42f, title)
    c.drawText("TelePoint Financed Device", w / 2f, h * 0.50f, sub)
    c.drawText("Pay your EMI / contact the store to unlock", w / 2f, h * 0.56f, sub)
    return bmp
  }

  fun setOverdueWallpaper(context: Context) {
    val wm = WallpaperManager.getInstance(context)
    try {
      // Cache the current wallpaper once (so we can restore it on unlock).
      val cache = File(context.filesDir, CACHED)
      if (!cache.exists()) {
        val d = try { wm.drawable } catch (_: Exception) { null }
        if (d is BitmapDrawable && d.bitmap != null) {
          cache.outputStream().use { d.bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
        }
      }
      val overdue = drawOverdueBitmap()
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        wm.setBitmap(overdue, null, true, WallpaperManager.FLAG_SYSTEM or WallpaperManager.FLAG_LOCK)
      } else {
        @Suppress("DEPRECATION") wm.setBitmap(overdue)
      }
    } catch (_: Exception) { /* wallpaper is cosmetic — never block the lock */ }
  }

  fun restoreCustomerWallpaper(context: Context) {
    val wm = WallpaperManager.getInstance(context)
    val cache = File(context.filesDir, CACHED)
    try {
      if (cache.exists()) {
        val bmp = BitmapFactory.decodeFile(cache.absolutePath)
        if (bmp != null) {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            wm.setBitmap(bmp, null, true, WallpaperManager.FLAG_SYSTEM or WallpaperManager.FLAG_LOCK)
          } else {
            @Suppress("DEPRECATION") wm.setBitmap(bmp)
          }
        }
        cache.delete()
      } else {
        wm.clear()
      }
    } catch (_: Exception) {
      try { wm.clear() } catch (_: Exception) {}
    }
  }
}
