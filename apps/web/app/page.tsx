import { publicPageMetadata } from './marketing/public-metadata';
import {
  FaqItem,
  FinalCta,
  InfoCard,
  PublicPage,
  SectionHead,
} from './marketing/sections';

export const metadata = publicPageMetadata({
  title: 'FounderChatters — Build companies. Not alone.',
  description:
    'A global founder-to-founder support network for useful asks, relevant help, consent-based introductions, and real contribution.',
  path: '/',
});

const needs = [
  'First US customers',
  'Pricing',
  'Hiring',
  'Market entry',
  'Fundraising feedback',
];

const help = [
  'B2B sales',
  'Engineering hiring',
  'GTM',
  'Growth',
  'Partnerships',
];

const loop = [
  ['01', 'ASK', 'Tell founders what you are trying to solve.'],
  ['02', 'DISCOVER', 'Find people with relevant operating experience.'],
  ['03', 'HELP', 'Share advice, context, or offer an introduction.'],
  [
    '04',
    'CONVERSATION',
    'Continue publicly or privately with request context intact.',
  ],
  ['05', 'THANK', 'The requester explicitly confirms what was useful.'],
  [
    '06',
    'REPUTATION',
    'Confirmed help becomes topic-specific contribution history.',
  ],
] as const;

export default function HomePage() {
  return (
    <PublicPage>
      <section className="fc-mkt-hero">
        <div className="fc-mkt-hero__copy">
          <p className="fc-label fc-mkt-kicker">FounderChatters</p>
          <h1 className="fc-h1">Build companies. Not alone.</h1>
          <p className="fc-body fc-mkt-note">
            A global founder-to-founder support network for useful asks,
            relevant help, consent-based introductions, and real contribution.
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
          <p className="fc-small fc-mkt-note">
            Founder-first network · Short application · Useful asks and real
            help
          </p>
        </div>
        <aside className="fc-mkt-hero__aside">
          <p className="fc-label fc-mkt-kicker">Starting from India</p>
          <h2 className="fc-h2">
            Starting from India. Built for founders everywhere.
          </h2>
          <p className="fc-body">
            FounderChatters is being built for useful founder-to-founder support
            across cities and markets. It does not claim a global user base
            today.
          </p>
          <p className="fc-title">Not another founder feed.</p>
          <p className="fc-body">
            The unit of value is a useful founder-to-founder interaction.
          </p>
        </aside>
      </section>

      <SectionHead
        kicker="01 — Need ↔ Help"
        title="Every founder has needs. Every founder has experience."
        body="The network becomes useful when both sides are visible without turning founders into creators, influencers, or lead lists."
      />
      <div className="fc-mkt-grid fc-mkt-grid--2">
        <InfoCard kicker="I need" title="What are you trying to solve?" sand>
          <ul className="fc-mkt-list fc-body">
            {needs.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </InfoCard>
        <InfoCard kicker="I can help" title="What have you already solved?">
          <ul className="fc-mkt-list fc-body">
            {help.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </InfoCard>
      </div>

      <SectionHead
        kicker="02 — How it works"
        title="ASK → DISCOVER → HELP → CONVERSATION → THANK → REPUTATION"
        body="Structured asks make the need clear. Relevant founders can respond publicly, introduce someone with permission, or continue privately."
      />
      <div className="fc-mkt-grid fc-mkt-grid--3">
        {loop.map(([number, title, body]) => (
          <InfoCard key={title} kicker={number} title={title} body={body} />
        ))}
      </div>

      <SectionHead
        kicker="03 — Trust model"
        title="A useful founder network needs boundaries."
        body="Identity, consent, privacy controls, and moderation protect the network without turning it into a surveillance layer."
      />
      <div className="fc-mkt-grid fc-mkt-grid--3">
        <InfoCard
          kicker="Founder-first"
          title="Short founder application"
          body="New members provide enough company and founder context to keep discovery useful."
          sand
        />
        <InfoCard
          kicker="Introductions"
          title="Permission before access"
          body="Introductions are offered with context and require consent before details are passed."
          sand
        />
        <InfoCard
          kicker="Privacy"
          title="Private means private"
          body="Private messages are not an admin browsing surface. Safety review is scoped to relevant reported context."
          sand
        />
      </div>

      <SectionHead
        kicker="04 — Illustrative request"
        title="Understand the ask in seconds."
        body="This is a fictional example of a useful ask. It is not a real FounderChatters request or member."
      />
      <article className="fc-mkt-example">
        <p className="fc-label fc-mkt-kicker">Illustrative request</p>
        <h2 className="fc-h2">
          Looking for someone who has launched B2B SaaS in the UAE.
        </h2>
        <p className="fc-small fc-mkt-note">
          Example founder · Example company · Example location
        </p>
        <p className="fc-body">
          Need context on early customer acquisition, local partnerships, and
          what changed between first conversations and repeatable sales.
        </p>
      </article>

      <SectionHead
        kicker="05 — Contribution"
        title="Followers measure audience. FounderChatters measures contribution."
        body="Reputation is not popularity. It is not likes, star ratings, or an editable score."
      />
      <section className="fc-mkt-panel">
        <div className="fc-mkt-compare">
          <div>
            <p className="fc-label fc-mkt-kicker">Traditional network</p>
            <h2 className="fc-title">Audience · Followers · Posts · Reach</h2>
            <p className="fc-body fc-mkt-note">
              No follower graph, no likes, no pressure to publish for
              visibility.
            </p>
          </div>
          <div>
            <p className="fc-label fc-mkt-kicker">FounderChatters</p>
            <h2 className="fc-title">
              Needs · Experience · Help · Contribution
            </h2>
            <p className="fc-body">
              Reputation grows only when a requester explicitly confirms that
              help was useful in a relevant topic.
            </p>
          </div>
        </div>
      </section>

      <SectionHead
        kicker="06 — FAQ"
        title="Is this another social network?"
        body="A few things to know before you apply."
      />
      <FaqItem
        question="Is this another social network?"
        answer="No. FounderChatters is organized around current needs and useful founder-to-founder support—not a publishing feed, follower count, or likes."
      />

      <FinalCta
        title="Someone has already solved part of the problem you’re facing."
        body="Join FounderChatters. Start with a short founder profile and application."
      />
    </PublicPage>
  );
}
