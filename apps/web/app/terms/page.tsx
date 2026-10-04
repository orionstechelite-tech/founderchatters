import { publicPageMetadata } from '../marketing/public-metadata';
import { PublicPage } from '../marketing/sections';

export const metadata = publicPageMetadata({
  title: 'Terms — FounderChatters',
  description:
    'MVP terms for using FounderChatters as a founder-to-founder support network.',
  path: '/terms',
});

export default function TermsPage() {
  return (
    <PublicPage>
      <section className="fc-mkt-prose">
        <p className="fc-label fc-mkt-kicker">Legal</p>
        <h1 className="fc-h1">Terms</h1>
        <p className="fc-body">
          FounderChatters is a founder-to-founder support network. People ask
          for help, discover relevant founders, share advice, make consent-based
          introductions, continue request-linked conversations, and build
          contribution history from confirmed useful help.
        </p>
        <h2 className="fc-title">Access</h2>
        <p className="fc-body">
          Joining requires an application from a founder, co-founder, or person
          actively building a company. Access may be approved, returned for more
          information, rejected, suspended, or removed.
        </p>
        <h2 className="fc-title">Your information</h2>
        <p className="fc-body">
          You are responsible for the accuracy of information you submit,
          including application, profile, request, and support content.
        </p>
        <h2 className="fc-title">Acceptable use</h2>
        <p className="fc-body">
          Do not harass, threaten, spam, impersonate, misrepresent, or solicit
          abusively. Respect consent around introductions. Do not game
          contribution or reputation.
        </p>
        <h2 className="fc-title">Advice and outcomes</h2>
        <p className="fc-body">
          Member-generated advice is another founder’s experience, not a
          guarantee. FounderChatters does not promise that another founder’s
          advice will produce a business outcome.
        </p>
        <h2 className="fc-title">Moderation and deletion</h2>
        <p className="fc-body">
          FounderChatters may moderate, suspend, or remove access for policy
          violations. Account deletion anonymizes public identity. Service
          availability may change.
        </p>
        <p className="fc-small fc-mkt-note">
          Questions about these terms can be sent through{' '}
          <a href="/support">public support</a>.
        </p>
      </section>
    </PublicPage>
  );
}
