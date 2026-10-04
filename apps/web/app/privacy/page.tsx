import { publicPageMetadata } from '../marketing/public-metadata';
import { PublicPage } from '../marketing/sections';

export const metadata = publicPageMetadata({
  title: 'Privacy — FounderChatters',
  description:
    'How FounderChatters handles account, profile, conversation, safety, and support data in the current MVP.',
  path: '/privacy',
});

export default function PrivacyPage() {
  return (
    <PublicPage>
      <section className="fc-mkt-prose">
        <p className="fc-label fc-mkt-kicker">Legal</p>
        <h1 className="fc-h1">Privacy</h1>
        <p className="fc-body">
          This page describes how the current FounderChatters product handles
          information.
        </p>
        <h2 className="fc-title">Information the product uses</h2>
        <p className="fc-body">
          Depending on how you use FounderChatters, the product may store
          account and authentication data; email verification, reset, security,
          and session data; founder application details; founder profile and
          company information; requests and responses; request-linked
          conversations and messages; introduction workflow records; help
          confirmation, thank-you, and contribution records; saved founders and
          settings; notifications; reports, blocks, and moderation records;
          support cases; and admin, audit, and security metadata.
        </p>
        <h2 className="fc-title">Private conversations</h2>
        <p className="fc-body">
          Private messages are not globally browseable by Admin. When safety
          review is necessary, access to message evidence is report-scoped and
          audited.
        </p>
        <h2 className="fc-title">Introductions and reports</h2>
        <p className="fc-body">
          Introduction contact details are not exposed without consent. A
          reporter’s identity is protected from the reported member.
        </p>
        <h2 className="fc-title">Account deletion</h2>
        <p className="fc-body">
          Account deletion anonymizes public identity. Some integrity, safety,
          or legal records may be retained where the product needs them to stay
          coherent. Exact retention periods are not published here.
        </p>
        <h2 className="fc-title">Support</h2>
        <p className="fc-body">
          If you contact support, we store the category, subject, message, and
          the email needed to reach you. Signed-in requests are associated with
          the account. Support bodies are not copied into public pages or
          marketing analytics.
        </p>
        <p className="fc-small fc-mkt-note">
          Contact the team through <a href="/support">public support</a> if you
          have a privacy question about your own use of the product.
        </p>
      </section>
    </PublicPage>
  );
}
