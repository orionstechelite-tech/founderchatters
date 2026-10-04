import type { ReactNode } from 'react';
import { MarketingShell } from '@founderchatters/ui';

export function PublicPage({ children }: { children: ReactNode }) {
  return (
    <MarketingShell>
      <div className="fc-mkt-stack">{children}</div>
    </MarketingShell>
  );
}

export function SectionHead({
  kicker,
  title,
  body,
}: {
  kicker: string;
  title: string;
  body: string;
}) {
  return (
    <div className="fc-mkt-section-head">
      <p className="fc-label fc-mkt-kicker">{kicker}</p>
      <h2 className="fc-h2">{title}</h2>
      <p className="fc-body fc-mkt-note">{body}</p>
    </div>
  );
}

export function InfoCard({
  kicker,
  title,
  body,
  sand = false,
  children,
}: {
  kicker: string;
  title: string;
  body?: string;
  sand?: boolean;
  children?: ReactNode;
}) {
  return (
    <article className={sand ? 'fc-mkt-card fc-mkt-card--sand' : 'fc-mkt-card'}>
      <p className="fc-label fc-mkt-kicker">{kicker}</p>
      <h3 className="fc-title">{title}</h3>
      {body ? <p className="fc-body fc-mkt-note">{body}</p> : null}
      {children}
    </article>
  );
}

export function FinalCta({ title, body }: { title: string; body: string }) {
  return (
    <section className="fc-mkt-cta">
      <p className="fc-label fc-mkt-kicker">Ready when you are</p>
      <h2 className="fc-h2">{title}</h2>
      <p className="fc-body">{body}</p>
      <div className="fc-mkt-actions">
        <a
          className="fc-button fc-button--medium fc-button--primary"
          href="/signup"
        >
          Join FounderChatters
        </a>
      </div>
    </section>
  );
}

export function FaqItem({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) {
  return (
    <details className="fc-mkt-faq">
      <summary>{question}</summary>
      <p className="fc-body">{answer}</p>
    </details>
  );
}
