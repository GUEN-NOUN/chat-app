# =============================================================================
# ProGuard rules — مدارك التعليمية (Madarik)
# =============================================================================

# ── Capacitor bridge ─────────────────────────────────────────────────────────
# Keep all Capacitor classes so the JS <-> native bridge survives minification.
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep class com.match.chat.** { *; }

# ── WebView JavaScript interface ─────────────────────────────────────────────
# Any class annotated with @JavascriptInterface must keep all its public members
# so the WebView can call them by name from JavaScript.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# ── AndroidX / AppCompat ─────────────────────────────────────────────────────
-keep class androidx.** { *; }
-keep interface androidx.** { *; }

# ── Stack traces ─────────────────────────────────────────────────────────────
# Preserve line numbers so crash reports are readable.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# ── Suppress warnings for known safe removals ─────────────────────────────────
-dontwarn org.xmlpull.v1.**
-dontwarn okio.**
-dontwarn okhttp3.**
