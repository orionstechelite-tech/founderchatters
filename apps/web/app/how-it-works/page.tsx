import { publicPageMetadata } from '../marketing/public-metadata';
import {
  FinalCta,
  InfoCard,
  PublicPage,
  SectionHead,
} from '../marketing/sections';

export const metadata = publicPageMetadata({
  title: 'How it works — FounderChatters',
  description:
    'Useful founder help without the noise: structured asks, relevant discovery, confirmed contribution, and private conversations that stay request-linked.',
  path: '/how-it-works',
});

export default function HowItWorksPage() {
  return (
    <PublicPage>
      <section className="fc-mkt-hero">
        <div className="fc-mkt-hero__copy">
          <p className="fc-label fc-mkt-kicker">How it works</p>
          <h1 className="fc-h1">Useful founder help, without the noise.</h1>
          <p className="fc-body fc-mkt-note">
            FounderChatters makes the need explicit, relevant experience
            discoverable, and the path from first response to trusted
            contribution understandable.
          </p>
          <div className="fc-mkt-actions">
            <a
              className="fc-button fc-button--medium fc-button--primary"
              href="/signup"
            >
              Join FounderChatters
            </a>
            <a
              className="fc-button fc-button--medium fc-button--secondary"
              href="/for-founders"
            >
              For founders
            </a>
          </div>
        </div>
      </section>

      <SectionHead
        kicker="01 — Founder context"
        title="Start with enough context to be useful."
        body="Founder profile, company, location, relevant expertise, current needs, and contribution history—without a follower count."
      />
      <section className="fc-mkt-panel">
        <p className="fc-label fc-mkt-kicker">Founder context</p>
        <h2 className="fc-h2">
          What you’re building + what you know + what you need now.
        </h2>
        <p className="fc-body">
          Profiles support relevance. There is no follower count, no likes, and
          no popularity score.
        </p>
      </section>

      <SectionHead
        kicker="02 — Structured ask"
        title="Create a request another founder can actually answer."
        body="Share the context, timing, and who could help so the next conversation starts with relevance."
      />
      <div className="fc-mkt-grid fc-mkt-grid--3">
        <InfoCard
          kicker="Context"
          title="Explain the real problem"
          body="Write enough background for another founder to understand the decision in front of you."
        />
        <InfoCard
          kicker="Timing"
          title="Say when it matters"
          body="Urgency and timing help people decide whether they can be useful now."
        />
        <InfoCard
          kicker="Who could help"
          title="Name the relevant experience"
          body="Ask for a founder or operator who has already navigated a nearby problem."
        />
      </div>

      <SectionHead
        kicker="03 — Help paths"
        title="Keep help connected to the original need."
        body="Public advice, a consent-based introduction, or a request-linked private conversation."
      />
      <div className="fc-mkt-grid fc-mkt-grid--3">
        <InfoCard
          kicker="Public advice"
          title="Advice with context"
          body="Share useful context where it can benefit the requester and keep the request history intact."
          sand
        />
        <InfoCard
          kicker="Introduction"
          title="Consent before connection"
          body="Offer a specific connection. Get permission before passing anyone’s contact details."
          sand
        />
        <InfoCard
          kicker="Private chat"
          title="Private, request-linked"
          body="Continue 1:1 when context is sensitive. Messaging alone does not create reputation."
          sand
        />
      </div>

      <SectionHead
        kicker="04 — Confirmation"
        title="Reputation only follows a real outcome."
        body="The requester explicitly confirms whether help worked. Still talking does not create reputation yet."
      />
      <article className="fc-mkt-example">
        <p className="fc-label fc-mkt-kicker">Help confirmation</p>
        <h2 className="fc-h2">Did this help?</h2>
        <p className="fc-title">Yes — this helped</p>
        <p className="fc-body fc-mkt-note">
          Only an explicit HELPED confirmation creates contribution reputation
          in the relevant topic.
        </p>
        <p className="fc-title">Still talking</p>
        <p className="fc-body fc-mkt-note">
          The conversation can continue. No contribution record is created yet.
        </p>
      </article>

      <SectionHead
        kicker="05 — Safety"
        title="Useful disagreement is welcome. Abuse, spam, and manipulation are not."
        body="Report, block, and moderation exist. Private messages are not globally browseable by admins. Evidence is report-scoped when needed."
      />
      <div className="fc-mkt-grid fc-mkt-grid--3">
        <InfoCard
          kicker="Report"
          title="Report real problems"
          body="Spam, fraud, impersonation, harassment, or policy violations can be reported in-product."
          sand
        />
        <InfoCard
          kicker="Block"
          title="Control direct access"
          body="Blocking prevents direct interaction while preserving necessary historical context."
          sand
        />
        <InfoCard
          kicker="Moderation"
          title="Reason + audit"
          body="Sensitive actions require reasons and are recorded. Admins do not browse private DMs."
          sand
        />
      </div>

      <FinalCta
        title="Ask when you need help. Help when you can."
        body="Join the network and build a contribution history around the things you genuinely know."
      />
    </PublicPage>
  );
}
