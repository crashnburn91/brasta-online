package app.brasta;

import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.view.View;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

import java.util.Collections;
import java.util.Map;

public class MainActivity extends BridgeActivity {
    private static final Map<String, String> PREVIEW_HEADERS =
        Collections.singletonMap("x-vercel-skip-toolbar", "1");
    private static final String HIDE_PREVIEW_CONTROLS =
        "(() => {" +
        "const hide = () => document.querySelectorAll(" +
        "'iframe[src*=\"vercel.live/_next-live/feedback\"],vercel-live-feedback," +
        "[data-vercel-toolbar],#vercel-toolbar,#__next_toolbar'" +
        ").forEach((node) => node.style.setProperty('display','none','important'));" +
        "hide();" +
        "new MutationObserver(hide).observe(document.documentElement,{childList:true,subtree:true});" +
        "})()";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setBackgroundDrawableResource(R.color.brasta_green);
        getWindow().setStatusBarColor(getResources().getColor(R.color.brasta_green));
        getWindow().setNavigationBarColor(getResources().getColor(R.color.brasta_green));
        configureSafeViewport();
        configurePreviewWebView();
        applyImmersiveMode();
    }

    @Override
    public void onResume() {
        super.onResume();
        applyImmersiveMode();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applyImmersiveMode();
    }

    private void configureSafeViewport() {
        View container = (View) getBridge().getWebView().getParent();
        // Reserve physical cutouts even when system bars are hidden. Padding
        // the native container also protects fixed-position web controls.
        ViewCompat.setOnApplyWindowInsetsListener(container, (view, insets) -> {
            Insets safe = insets.getInsets(WindowInsetsCompat.Type.displayCutout()
                | WindowInsetsCompat.Type.systemBars());
            Insets keyboard = insets.getInsets(WindowInsetsCompat.Type.ime());
            view.setPadding(safe.left, safe.top, safe.right,
                Math.max(safe.bottom, keyboard.bottom));
            // The viewport already excludes these areas; prevent CSS safe-area
            // rules and the WebView from reserving the same space twice.
            return new WindowInsetsCompat.Builder(insets)
                .setInsets(WindowInsetsCompat.Type.displayCutout()
                    | WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.ime(), Insets.NONE)
                .setDisplayCutout(null)
                .build();
        });
        ViewCompat.requestApplyInsets(container);
    }

    private void applyImmersiveMode() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(false);
        controller.setAppearanceLightNavigationBars(false);
        controller.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        );
        controller.hide(WindowInsetsCompat.Type.systemBars());
    }

    private void configurePreviewWebView() {
        Bridge capacitorBridge = getBridge();
        if (capacitorBridge == null) return;

        capacitorBridge.setWebViewClient(new BridgeWebViewClient(capacitorBridge) {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (request.isForMainFrame() && isVercelPreview(request.getUrl())) {
                    view.loadUrl(request.getUrl().toString(), PREVIEW_HEADERS);
                    return true;
                }
                return super.shouldOverrideUrlLoading(view, request);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (isVercelPreview(Uri.parse(url))) {
                    view.evaluateJavascript(HIDE_PREVIEW_CONTROLS, null);
                }
            }
        });

        String appUrl = capacitorBridge.getAppUrl();
        if (isVercelPreview(Uri.parse(appUrl))) {
            capacitorBridge.getWebView().loadUrl(appUrl, PREVIEW_HEADERS);
        }
    }

    private boolean isVercelPreview(Uri uri) {
        String host = uri.getHost();
        return host != null && host.endsWith(".vercel.app");
    }
}
