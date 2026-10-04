import { publicPageMetadata } from '../marketing/public-metadata';
import {
  FaqItem,
  FinalCta,
  InfoCard,
  PublicPage,
  SectionHead,
} from '../marketing/sections';

export const metadata = publicPageMetadata({
  title: 'For founders — FounderChatters',
  description:
    'Use FounderChatters for GTM, hiring, pricing, introductions, product, and operations help from founders who have already built nearby.',
  path: '/for-founders',
});

const clusters = [
  {
    kicker: 'GTM',
    title: 'Enter a new market with context.',
    body: 'Market entry, first customers, channels.',
  },
  {
    kicker: 'Hiring',
    title: 'Learn before making the expensive hire.',
    body: 'Engineering, sales, leadership, agencies.',
  },
  {
    kicker: 'Pricing',
    title: 'Pressure-test the business model.',
    body: 'Packaging, enterprise, marketplace economics.',
  },
  {
    kicker: 'Introductions',
    title: 'Ask for a relevant door—not a list.',
    body: 'Partners, customers, domain experts.',
  },
  {
    kicker: 'Product',
    title: 'Get feedback from someone who has built nearby.',
    body: 'Product decisions, tradeoffs, and early user patterns.',
  },
  {
    kicker: 'Operations',
    title: 'Avoid relearning every operational lesson.',
    body: 'Vendors, tooling, and process context.',
  },
] as const;

export default function ForFoundersPage() {
  return (
    <PublicPage>
      <section className="fc-mkt-hero">
        <div className="fc-mkt-hero__copy">
          <p className="fc-label fc-mkt-kicker">For founders</p>
          <h1 className="fc-h1">The right founder can save you weeks.</h1>
          <p className="fc-body fc-mkt-note">
            Use FounderChatters when the next useful step depends on someone who
            has already navigated a similar problem—not on another generic
            article or cold outreach list.
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
              href="/how-it-works"
            >
              How it works
            </a>
          </div>
        </div>
        <aside className="fc-mkt-hero__aside">
          <p className="fc-label fc-mkt-kicker">Great fit</p>
          <h2 className="fc-title">Founders</h2>
          <h2 className="fc-title">Co-founders</h2>
          <h2 className="fc-title">People actively building companies</h2>
          <p className="fc-body">
            Come to ask with context, contribute where you have experience, and
            respect consent.
          </p>
        </aside>
      </section>

      <SectionHead
        kicker="01 — Use cases"
        title="Founder problems are specific. So should the network be."
        body="Six useful MVP clusters. The network is not a jobs board, investor marketplace, or social feed."
      />
      <div className="fc-mkt-grid fc-mkt-grid--3">
        {clusters.map((item) => (
          <InfoCard
            key={item.kicker}
            kicker={item.kicker}
            title={item.title}
            body={item.body}
          />
        ))}
      </div>

      <SectionHead
        kicker="02 — Ask well"
        title="The quality of the ask shapes the quality of the help."
        body="A useful ask has a clear question, context, timing, and who could help."
      />
      <article className="fc-mkt-example">
        <p className="fc-label fc-mkt-kicker">Illustrative ask</p>
        <h2 className="fc-h2">
          Looking for someone who has launched B2B SaaS in the UAE.
        </h2>
        <p className="fc-small fc-mkt-note">
          Clear question · context · timing · who could help
        </p>
        <p className="fc-body">
          Context: We have early inbound interest but need to understand local
          channel behavior and the first repeatable customer acquisition motion.
        </p>
        <p className="fc-body fc-mkt-note">
          Who could help: a founder or operator with UAE B2B SaaS GTM
          experience. This example is fictional.
        </p>
      </article>

      <SectionHead
        kicker="03 — Give back"
        title="A useful founder network cannot be one-way."
        body="Ask when you need help. Help when you can."
      />
      <section className="fc-mkt-panel">
        <p className="fc-label fc-mkt-kicker">What you can give back</p>
        <h2 className="fc-h2">
          You may know the answer someone else needs next week.
        </h2>
        <p className="fc-body">
          B2B sales · Engineering hiring · Marketplace GTM · Partnerships ·
          Growth
        </p>
        <p className="fc-title">Ask when you need help. Help when you can.</p>
      </section>

      <SectionHead
        kicker="04 — Trust"
        title="Useful networks need quality without elitism."
        body="Consent-based introductions, relevant founder context, and contribution only from confirmed useful help."
      />
      <div className="fc-mkt-grid fc-mkt-grid--3">
        <InfoCard
          kicker="Application"
          title="Short founder context"
          body="Enough context to understand who is building what and why they belong in the network."
          sand
        />
        <InfoCard
          kicker="Consent"
          title="Introductions stay human"
          body="No forwarding people’s details without permission and context."
          sand
        />
        <InfoCard
          kicker="Contribution"
          title="Reputation follows help"
          body="Visible contribution is tied to explicit confirmation from founders you helped."
          sand
        />
      </div>

      <SectionHead
        kicker="05 — FAQ"
        title="A few things founders should know before joining."
        body="Access and pricing are not a published commercial offer yet."
      />
      <FaqItem
        question="What is FounderChatters?"
        answer="FounderChatters is a founder-to-founder support network built around structured asks, relevant experience, useful conversations, consent-based introductions, and contribution."
      />
      <FaqItem
        question="Who can join?"
        answer="Founders, co-founders, and people actively building companies who can ask with context and help when they have relevant experience."
      />
      <FaqItem
        question="Is it another social network?"
        answer="No. There is no social feed, follower graph, likes, or star ratings. The loop is ask, discover, help, conversation, thank, and reputation."
      />
      <FaqItem
        question="How much does it cost?"
        answer="Pricing and access details are not yet published."
      />

      <FinalCta
        title="Ask when you need help. Help when you can."
        body="Join FounderChatters and start with the context that makes useful support possible."
      />
    </PublicPage>
  );
}
