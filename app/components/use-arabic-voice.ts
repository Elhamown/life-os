"use client";
import { useEffect, useRef, useState } from "react";
export function useArabicVoice(
  transcribe: (blob: Blob, signal: AbortSignal) => Promise<string>,
) {
  const [status, setStatus] = useState<
    "idle" | "permission" | "recording" | "transcribing"
  >("idle");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const callback = useRef(transcribe);
  useEffect(() => {
    callback.current = transcribe;
  }, [transcribe]);
  function cleanup() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }
  function cancel() {
    generation.current++;
    abort.current?.abort();
    if (recorder.current?.state === "recording") recorder.current.stop();
    recorder.current = null;
    cleanup();
    setStatus("idle");
    setTranscript("");
  }
  useEffect(
    () => () => {
      generation.current++;
      abort.current?.abort();
      if (recorder.current?.state === "recording") recorder.current.stop();
      if (timer.current) clearTimeout(timer.current);
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  async function start() {
    if (status !== "idle") return;
    const token = ++generation.current;
    setError("");
    setTranscript("");
    setStatus("permission");
    if (
      !window.isSecureContext ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setError(
        "التسجيل يحتاج متصفحًا يدعم الميكروفون واتصال HTTPS. يمكنك الكتابة مباشرة.",
      );
      setStatus("idle");
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (token !== generation.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      const mime = [
        "audio/webm;codecs=opus",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ].find((t) => MediaRecorder.isTypeSupported(t));
      if (!mime) throw Error();
      const rec = new MediaRecorder(media, { mimeType: mime });
      recorder.current = rec;
      const chunks: Blob[] = [];
      let bytes = 0;
      let oversized = false;
      rec.ondataavailable = (e) => {
        if (e.data.size) {
          chunks.push(e.data);
          bytes += e.data.size;
          if (bytes > 4 * 1024 * 1024) {
            oversized = true;
            rec.stop();
          }
        }
      };
      rec.onerror = () => {
        generation.current++;
        cleanup();
        setStatus("idle");
        setError("تعذّر التسجيل. حاول مجددًا أو اكتب الرسالة.");
      };
      rec.onstop = async () => {
        if (token !== generation.current) return;
        cleanup();
        recorder.current = null;
        if (oversized) {
          setStatus("idle");
          setError("التسجيل أكبر من الحد المسموح؛ سجّل مقطعًا أقصر.");
          return;
        }
        setStatus("transcribing");
        const controller = new AbortController();
        abort.current = controller;
        try {
          const value = await callback.current(
            new Blob(chunks, { type: mime.split(";")[0] }),
            controller.signal,
          );
          if (token === generation.current) setTranscript(value);
        } catch {
          if (token === generation.current)
            setError(
              "تعذّر تفريغ الصوت. قد يكون الاتصال أو إعداد المزوّد غير متاح؛ حاول مجددًا أو اكتب النص.",
            );
        } finally {
          if (token === generation.current) setStatus("idle");
        }
      };
      rec.start(1000);
      setStatus("recording");
      timer.current = setTimeout(() => {
        if (rec.state === "recording") rec.stop();
      }, 60000);
    } catch {
      if (token === generation.current) {
        cleanup();
        setStatus("idle");
        setError(
          "لم يبدأ التسجيل. تحقق من إذن الميكروفون؛ يمكنك الكتابة بدلًا منه.",
        );
      }
    }
  }
  return {
    status,
    transcript,
    setTranscript,
    error,
    start,
    stop: () => {
      if (recorder.current?.state === "recording") recorder.current.stop();
    },
    cancel,
  };
}
