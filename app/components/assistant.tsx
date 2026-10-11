"use client";
import { useState } from "react";
import { Mic, Send, Sparkles } from "lucide-react";
import { type Action, type State, demoDate, number } from "../lib/model";
import { ProposalCard } from "./shared";
export default function Assistant({
  state,
  dispatch,
}: {
  state: State;
  dispatch: (a: Action) => void;
}) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<
    { id: string; text: string; role: "user" | "assistant" }[]
  >([]);
  const [voiceNotice, setVoiceNotice] = useState(false);
  function send(text: string) {
    if (!text.trim()) return;
    const pending = state.tasks.filter((t) => !t.done);
    setMessages((m) => [
      ...m,
      { id: crypto.randomUUID(), text: text.trim(), role: "user" },
      {
        id: crypto.randomUUID(),
        text: `لديك ${number(pending.length)} مهام مفتوحة. أقترح جلسة تركيز قصيرة، ثم استراحة. راجع الاقتراح قبل إضافته؛ لن تتغيّر مهامك دون موافقتك. هذا رد محلي مُعدّ مسبقًا، ولا يحلّل رسالتك باستخدام نموذج ذكاء اصطناعي.`,
        role: "assistant",
      },
    ]);
    dispatch({
      type: "propose",
      proposal: {
        id: crypto.randomUUID(),
        title: `جلسة تركيز: ${pending[0]?.title ?? "ترتيب أفكار اليوم"}`,
        spaceId: pending[0]?.spaceId ?? "life",
        date: demoDate,
        reason: "اقتراح محلي لمدة ٢٥ دقيقة، يمكنك تعديله أو رفضه.",
        status: "pending",
      },
    });
    setInput("");
  }
  return (
    <div className="assistant-layout">
      <section className="conversation">
        <div className="assistant-intro">
          <span className="space-symbol">
            <Sparkles size={24} />
          </span>
          <h2>لنمنح أفكارك بعض الوضوح.</h2>
          <p>مساحة للتخطيط، مع بقاء القرار لك.</p>
          <span className="tag">ذكاء اصطناعي تجريبي · ردود محلية</span>
        </div>
        <div className="prompt-options">
          {[
            "رتّب أولويات اليوم",
            "وازن بين العمل والتعلّم",
            "ساعدني على البدء",
          ].map((t) => (
            <button className="button" key={t} onClick={() => send(t)}>
              {t}
            </button>
          ))}
        </div>
        <div className="messages" aria-live="polite">
          {messages.map((m) => (
            <article key={m.id} className={`message ${m.role}`}>
              <small>{m.role === "user" ? "أنت" : "مدار · ديمو"}</small>
              <p>{m.text}</p>
            </article>
          ))}
        </div>
        {voiceNotice && (
          <p role="status" className="helper">
            الإدخال الصوتي غير متاح بعد. لم يتم تشغيل الميكروفون أو تسجيل صوتك.
          </p>
        )}
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <textarea
            aria-label="رسالتك للمساعد"
            placeholder="ما الذي تريد ترتيبه؟"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={2000}
            rows={2}
          />
          <div>
            <button
              type="button"
              className="quiet-button"
              onClick={() => setVoiceNotice(true)}
            >
              <Mic size={18} />
              الصوت غير متاح
            </button>
            <button
              className="icon-button send-button"
              type="submit"
              disabled={!input.trim()}
              aria-label="إرسال الرسالة"
            >
              <Send size={18} />
            </button>
          </div>
        </form>
        <p className="helper">
          لا توجد اتصالات خارجية. المحادثة والتعديلات مؤقتة في هذه الجلسة.
        </p>
      </section>
      <section className="proposal-column">
        <div className="section-head">
          <div>
            <h2>اقتراحات للمراجعة</h2>
            <p>موافقتك تسبق أي إضافة</p>
          </div>
        </div>
        {state.proposals.map((p) => (
          <ProposalCard key={p.id} proposal={p} dispatch={dispatch} />
        ))}
      </section>
    </div>
  );
}
