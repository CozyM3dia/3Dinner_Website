"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { X, Loader2, Scan, AlertTriangle, RotateCcw } from "lucide-react";
import { fitCameraToModel } from "@/lib/fit-camera";

interface ARSessionProps {
  url: string;
  menuName: string;
  onClose: () => void;
}

type SessionState =
  | "loading"
  | "ready"
  | "unsupported"
  | "active"
  | "overlay_blocked"  // Android overlay apps blocking permission dialog
  | "error";

export default function ARSession({ url, menuName, onClose }: ARSessionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viewerRef = useRef<any>(null);
  const [sessionState, setSessionState] = useState<SessionState>("loading");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function init() {
      if (!containerRef.current) return;

      const arSupported =
        typeof navigator !== "undefined" &&
        !!navigator.xr &&
        (await navigator.xr.isSessionSupported("immersive-ar").catch(() => false));

      const GS = await import("@mkkellogg/gaussian-splats-3d");

      if (!mounted) return;

      if (viewerRef.current) {
        try { viewerRef.current.dispose(); } catch { /* noop */ }
        viewerRef.current = null;
      }
      containerRef.current.innerHTML = "";

      const viewer = new GS.Viewer({
        rootElement: containerRef.current,
        selfDrivenMode: true,
        useBuiltInControls: !arSupported,
        sharedMemoryForWorkers: false,
        cameraUp: [0, -1, 0],
        initialCameraPosition: [0, -0.5, 2],
        initialCameraLookAt: [0, 0, 0],
        ...(arSupported
          ? {
              webXRMode: GS.WebXRMode.AR,
              webXRSessionInit: {
                optionalFeatures: ["hit-test"],
              },
            }
          : {}),
      });

      viewerRef.current = viewer;

      await viewer.addSplatScene(url, {
        splatAlphaRemovalThreshold: 5,
        showLoadingUI: false,
        progressiveLoad: false,
        format: GS.SceneFormat.Ply,
        onProgress: (pct: number) => {
          if (mounted) setProgress(Math.min(100, Math.round(pct)));
        },
      });

      if (!mounted) return;

      viewer.start();

      if (!arSupported) {
        const THREE = await import("three");
        fitCameraToModel(viewer, THREE);
      }

      if (arSupported && viewer.renderer?.xr) {
        viewer.renderer.xr.addEventListener("sessionstart", () => {
          if (mounted) setSessionState("active");
        });
        viewer.renderer.xr.addEventListener("sessionend", () => {
          if (mounted) setSessionState("ready");
        });
      }

      if (mounted) {
        setSessionState(arSupported ? "ready" : "unsupported");
      }
    }

    init().catch((err) => {
      console.error("[ARSession]", err);
      if (mounted) setSessionState("error");
    });

    return () => {
      mounted = false;
      if (viewerRef.current) {
        try { viewerRef.current.dispose(); } catch { /* noop */ }
        viewerRef.current = null;
      }
    };
  }, [url]);

  // Click the library's hidden ARButton (correct session lifecycle),
  // but intercept unhandled rejections so we can show a specific error.
  const triggerAR = useCallback(() => {
    const btn = containerRef.current?.querySelector(
      "#ARButton"
    ) as HTMLButtonElement | null;
    if (!btn) return;

    const handleRejection = (e: PromiseRejectionEvent) => {
      const err = e.reason;
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        e.preventDefault();
        setSessionState("overlay_blocked");
      }
      window.removeEventListener("unhandledrejection", handleRejection);
    };
    window.addEventListener("unhandledrejection", handleRejection);
    // Clean up if nothing goes wrong within 5s
    setTimeout(() => window.removeEventListener("unhandledrejection", handleRejection), 5000);

    btn.click();
  }, []);

  const retryAR = useCallback(() => {
    setSessionState("ready");
  }, []);

  return (
    <div className="fixed inset-0 z-[100] bg-black" style={{ touchAction: "none" }}>
      <style>{`#ARButton { display: none !important; }`}</style>
      <div ref={containerRef} className="absolute inset-0" />

      {/* Loading */}
      {sessionState === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4"
          style={{ background: "rgba(245,230,211,0.96)" }}>
          <button onClick={onClose}
            className="absolute top-4 left-4 w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: "rgba(139,94,60,0.18)" }}>
            <X size={18} color="#8B5E3C" />
          </button>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg"
            style={{ background: "#FFFBF5" }}>
            <Loader2 size={28} color="#8B5E3C" strokeWidth={2} className="animate-spin" />
          </div>
          <p className="text-sm font-semibold" style={{ color: "#8B5E3C" }}>Memuat model AR...</p>
          <div className="w-40 h-1.5 rounded-full overflow-hidden" style={{ background: "#E8D5C0" }}>
            <div className="h-full rounded-full transition-all duration-300"
              style={{ width: `${progress}%`, background: "linear-gradient(90deg, #C4956A, #D4A574)" }} />
          </div>
          <p className="text-xs" style={{ color: "#C4956A" }}>
            {progress > 0 ? `${progress}%` : "Menyiapkan..."}
          </p>
        </div>
      )}

      {/* Ready */}
      {sessionState === "ready" && (
        <>
          <button onClick={onClose}
            className="absolute top-4 left-4 z-[101] w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: "rgba(44,24,16,0.65)", backdropFilter: "blur(6px)" }}>
            <X size={18} color="#FDF6EC" />
          </button>
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[101] px-4 py-2 rounded-full"
            style={{ background: "rgba(44,24,16,0.55)", backdropFilter: "blur(6px)" }}>
            <p className="text-sm font-semibold whitespace-nowrap" style={{ color: "#FDF6EC" }}>
              {menuName}
            </p>
          </div>
          <div className="absolute bottom-0 left-0 right-0 z-[101] px-5 pb-8 pt-12"
            style={{ background: "linear-gradient(to top, rgba(44,24,16,0.88) 0%, transparent 100%)" }}>
            <p className="text-center text-xs mb-3" style={{ color: "rgba(253,246,236,0.65)" }}>
              👆 Drag untuk memutar model
            </p>
            <button onClick={triggerAR}
              className="w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform"
              style={{ background: "linear-gradient(135deg, #8B5E3C, #C4956A)", color: "#FDF6EC",
                boxShadow: "0 4px 24px rgba(139,94,60,0.45)" }}>
              <Scan size={18} strokeWidth={2} />
              Mulai AR — Arahkan ke Permukaan Datar
            </button>
          </div>
        </>
      )}

      {/* Active */}
      {sessionState === "active" && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[101]">
          <button onClick={triggerAR}
            className="px-6 py-3 rounded-full font-semibold text-sm flex items-center gap-2 active:scale-95 transition-transform"
            style={{ background: "rgba(44,24,16,0.75)", color: "#FDF6EC", backdropFilter: "blur(8px)" }}>
            <X size={16} />
            Keluar AR
          </button>
        </div>
      )}

      {/* Overlay blocked — specific helpful message */}
      {sessionState === "overlay_blocked" && (
        <div className="absolute inset-0 z-[101] flex flex-col items-end justify-end"
          style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="w-full rounded-t-3xl px-5 pt-5 pb-8" style={{ background: "#FFFBF5" }}>
            <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "#E8D5C0" }} />
            <div className="flex items-start gap-3 mb-5">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                style={{ background: "#FEF3E8" }}>
                <AlertTriangle size={20} color="#C4956A" />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-base mb-2" style={{ color: "#2C1810" }}>
                  Ada Aplikasi Mengambang
                </h3>
                <p className="text-sm leading-relaxed mb-3" style={{ color: "#5C3D2E" }}>
                  Izin kamera diblokir oleh Android karena ada aplikasi yang tampil di atas layar.
                </p>
                <p className="text-xs leading-relaxed" style={{ color: "#8B5E3C" }}>
                  Tutup terlebih dahulu:
                </p>
                <ul className="text-xs mt-1.5 space-y-1" style={{ color: "#8B5E3C" }}>
                  <li>• Chat bubble WhatsApp / Telegram</li>
                  <li>• Notifikasi mengambang TrueCaller</li>
                  <li>• Floating window aplikasi lain</li>
                </ul>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={onClose}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold"
                style={{ background: "#F5E6D3", color: "#8B5E3C" }}>
                Kembali
              </button>
              <button onClick={retryAR}
                className="flex-1 py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2"
                style={{ background: "#8B5E3C", color: "#FDF6EC" }}>
                <RotateCcw size={14} />
                Coba Lagi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unsupported */}
      {sessionState === "unsupported" && (
        <>
          <button onClick={onClose}
            className="absolute top-4 left-4 z-[101] w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: "rgba(44,24,16,0.65)", backdropFilter: "blur(6px)" }}>
            <X size={18} color="#FDF6EC" />
          </button>
          <div className="absolute bottom-0 left-0 right-0 z-[101] rounded-t-3xl px-5 pt-4 pb-8"
            style={{ background: "#FFFBF5", boxShadow: "0 -4px 32px rgba(44,24,16,0.2)" }}>
            <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: "#E8D5C0" }} />
            <div className="flex items-start gap-3 mb-5">
              <span className="text-2xl mt-0.5">📱</span>
              <div className="flex-1">
                <h3 className="font-bold text-base mb-1"
                  style={{ color: "#2C1810", fontFamily: "var(--font-playfair)" }}>
                  AR Belum Didukung
                </h3>
                <p className="text-xs leading-relaxed" style={{ color: "#8B5E3C" }}>
                  Browser atau perangkat ini belum mendukung WebXR AR.
                  Gunakan <strong>Chrome di Android</strong> untuk pengalaman AR terbaik.
                </p>
              </div>
            </div>
            <button onClick={onClose}
              className="w-full py-3 rounded-2xl text-sm font-semibold"
              style={{ background: "#F5E6D3", color: "#8B5E3C" }}>
              Kembali ke Detail Menu
            </button>
          </div>
        </>
      )}

      {/* Error */}
      {sessionState === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6"
          style={{ background: "rgba(245,230,211,0.97)" }}>
          <p className="font-semibold" style={{ color: "#2C1810" }}>Gagal memuat model</p>
          <p className="text-sm" style={{ color: "#C4956A" }}>Cek koneksi internet kamu</p>
          <button onClick={onClose}
            className="px-8 py-3 rounded-2xl text-sm font-semibold"
            style={{ background: "#8B5E3C", color: "#FDF6EC" }}>
            Kembali
          </button>
        </div>
      )}
    </div>
  );
}
