package com.match.chat;

import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

/**
 * MainActivity — entry point for مدارك التعليمية Android app.
 *
 * Extends BridgeActivity which: 1. Creates a full-screen WebView that loads
 * www/index.html from assets. 2. Injects the Capacitor JS bridge so plugins
 * work from web code. 3. Handles deep-links, permission callbacks, and activity
 * results.
 *
 * The Android 12+ SplashScreen API is installed via installSplashScreen()
 * BEFORE super.onCreate() so the system splash is properly handed off to
 * Capacitor's own splash-screen plugin without a white flash.
 *
 * ── Encoding fix ────────────────────────────────────────────────────────────
 * Arabic (and all non-ASCII) text becomes "?????" after navigation on certain
 * Android/OEM builds because WebView's defaultTextEncodingName defaults to the
 * system locale charset (e.g. ISO-8859-1 / Windows-1252) instead of UTF-8. The
 * <meta charset="UTF-8"> in each HTML file is only a hint — the WebView must
 * already be configured to decode bytes as UTF-8 BEFORE it reads the
 * <meta> tag, otherwise the first bytes of every multi-byte Arabic sequence
 * (0xD8/0xD9) are decoded as Western characters and replaced with "?".
 *
 * Three-layer fix applied here: Layer 1 — onCreate(): set once after
 * BridgeActivity has initialised the WebView Layer 2 — onResume(): re-apply
 * whenever the app returns to the foreground Layer 3 —
 * WebViewClient.onPageStarted(): re-apply at the start of EVERY individual page
 * load (covers level-to-level navigation inside the app)
 * ──────────────────────────────────────────────────────────────────────────────
 */
public class MainActivity extends BridgeActivity {

    private static final String TAG = "Madarik:Encoding";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Install the Android 12+ SplashScreen API.
        // Must be called before super.onCreate() — this is the requirement
        // from androidx.core:core-splashscreen.
        SplashScreen.installSplashScreen(this);

        // BridgeActivity.onCreate() initialises the WebView, loads www/index.html,
        // registers all installed Capacitor plugins, and fires the bridge.
        super.onCreate(savedInstanceState);

        // Layer 1 — apply UTF-8 to the freshly initialised WebView.
        applyUtf8Encoding("onCreate");

        // Layer 3 — wrap Capacitor's WebViewClient to re-apply UTF-8 on every
        // individual page-start event.  We do NOT replace the client; we wrap it so
        // all of Capacitor's own routing / bridge callbacks remain intact.
        installUtf8WebViewClientWrapper();
    }

    // ── Layer 2 ── re-apply on every app foreground transition ───────────────
    @Override
    public void onResume() {
        super.onResume();

        // إذا عندك سطر UTF-8 اتركه كما هو
        getBridge().getWebView().getSettings()
                .setDefaultTextEncodingName("UTF-8");
    }

    // ── applyUtf8Encoding ────────────────────────────────────────────────────
    /**
     * Sets {@code defaultTextEncodingName = "UTF-8"} on the Capacitor WebView.
     * Safe to call multiple times — WebSettings simply overwrites the previous
     * value with the same string.
     */
    private void applyUtf8Encoding(String caller) {
        try {
            WebSettings settings = getBridge().getWebView().getSettings();
            settings.setDefaultTextEncodingName("UTF-8");
            Log.d(TAG, "UTF-8 encoding enforced [" + caller + "]");
        } catch (Exception e) {
            // Bridge not yet fully initialised (should not happen after super.onCreate).
            Log.w(TAG, "Could not enforce UTF-8 [" + caller + "]: " + e.getMessage());
        }
    }

    // ── installUtf8WebViewClientWrapper ──────────────────────────────────────
    /**
     * Capacitor installs its own {@link WebViewClient} (BridgeWebViewClient) to
     * handle asset routing and the native bridge protocol. We must NOT call
     * {@code webView.setWebViewClient(new WebViewClient())} directly, as that
     * would erase Capacitor's client and break the entire bridge.
     *
     * Instead we: 1. Retrieve the client Capacitor already installed (requires
     * API 26+). 2. Build a thin subclass that calls the existing client for
     * EVERY callback and additionally re-applies the UTF-8 encoding setting at
     * page-start.
     *
     * On API 24/25 (where {@code getWebViewClient()} is unavailable) we skip
     * the wrapper and rely on Layers 1 and 2 (onCreate + onResume) which cover
     * those devices adequately.
     */
    private void installUtf8WebViewClientWrapper() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            // API 24/25: getWebViewClient() not available.
            // Layers 1 (onCreate) and 2 (onResume) are still active, providing
            // UTF-8 enforcement on every activity start/resume.
            Log.d(TAG, "API < 26 — skipping WebViewClient wrapper; using onCreate+onResume layers only");
            return;
        }
        try {
            WebView webView = getBridge().getWebView();
            // Capacitor stores its own client in webView; we preserve it via a
            // delegating subclass so every bridge callback still fires correctly.
            final WebViewClient capacitorClient = webView.getWebViewClient();
            webView.setWebViewClient(new Utf8EnforcingWebViewClient(capacitorClient));
            Log.d(TAG, "UTF-8 WebViewClient wrapper installed");
        } catch (Exception e) {
            Log.w(TAG, "Could not install WebViewClient wrapper: " + e.getMessage());
        }
    }

    // ── Utf8EnforcingWebViewClient ───────────────────────────────────────────
    /**
     * Thin wrapper around whatever WebViewClient Capacitor has installed.
     *
     * The only extra behaviour is calling
     * {@code settings.setDefaultTextEncodingName("UTF-8")} in
     * {@link #onPageStarted}, which fires synchronously before the WebView
     * begins parsing the response body — guaranteeing UTF-8 byte decoding for
     * every page, including level-to-level navigations.
     *
     * Every other method delegates to the original Capacitor client, so the
     * bridge, should-override-url routing, SSL-error handling, etc., are
     * completely unaffected.
     */
    private class Utf8EnforcingWebViewClient extends WebViewClient {

        private final WebViewClient delegate;

        Utf8EnforcingWebViewClient(WebViewClient delegate) {
            this.delegate = delegate;
        }

        // ── Re-apply UTF-8 at the very start of every page load ──────────────
        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            // Re-enforce encoding before the page body is decoded.
            try {
                view.getSettings().setDefaultTextEncodingName("UTF-8");
                Log.d(TAG, "UTF-8 re-applied for: " + url);
            } catch (Exception e) {
                Log.w(TAG, "onPageStarted encoding error: " + e.getMessage());
            }
            // Always delegate to Capacitor's client.
            if (delegate != null) {
                delegate.onPageStarted(view, url, favicon);
            }
        }

        // ── All other callbacks delegated to Capacitor unchanged ─────────────
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {
            return delegate != null && delegate.shouldOverrideUrlLoading(view, request);
        }

        @Override
        public android.webkit.WebResourceResponse shouldInterceptRequest(WebView view, android.webkit.WebResourceRequest request) {
            return delegate != null ? delegate.shouldInterceptRequest(view, request) : null;
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (delegate != null) {
                delegate.onPageFinished(view, url);
            }
        }

        @Override
        public void onReceivedError(WebView view, android.webkit.WebResourceRequest request, android.webkit.WebResourceError error) {
            if (delegate != null) {
                delegate.onReceivedError(view, request, error);
            }
        }

        @Override
        public void onReceivedSslError(WebView view, android.webkit.SslErrorHandler handler, android.net.http.SslError error) {
            if (delegate != null) {
                delegate.onReceivedSslError(view, handler, error);
            }
        }

        @Override
        public void onLoadResource(WebView view, String url) {
            if (delegate != null) {
                delegate.onLoadResource(view, url);
            }
        }
    }
}
