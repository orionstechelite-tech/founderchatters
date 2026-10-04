import { publicPageMetadata } from '../marketing/public-metadata';
import { PublicPage } from '../marketing/sections';

export const metadata = publicPageMetadata({
  title: 'Guidelines — FounderChatters',
  description:
    'Practical guidelines for useful asks, consent, contribution, and respectful founder-to-founder help.',
  path: '/guidelines',
});

export default function GuidelinesPage() {
  return (
    <PublicPage>
      <section className="fc-mkt-prose">
        <p className="fc-label fc-mkt-kicker">Community</p>
        <h1 className="fc-h1">Guidelines</h1>
        <p className="fc-body">
          FounderChatters stays useful when people come with real context, help
          where they have experience, and respect consent.
        </p>
        <h2 className="fc-title">Come with a concrete founder need</h2>
        <p className="fc-body">
          Ask with enough company, timing, and problem context for another
          founder to decide whether they can help.
        </p>
        <h2 className="fc-title">Contribute where you have experience</h2>
        <p className="fc-body">
          Help when you have relevant operating context. Do not present
          speculation as lived experience.
        </p>
        <h2 className="fc-title">Respect consent</h2>
        <p className="fc-body">
          Do not forward someone’s private contact details without permission.
          Introductions stay human and explicit.
        </p>
        <h2 className="fc-title">No harassment, threats, or spam</h2>
        <p className="fc-body">
          Harassment, threats, impersonation, misrepresentation, and abusive
          solicitation are not allowed.
        </p>
        <h2 className="fc-title">Do not game contribution</h2>
        <p className="fc-body">
          Reputation comes only from a requester explicitly confirming that help
          was useful. Do not try to manufacture, trade, or inflate contribution.
        </p>
        <h2 className="fc-title">Use report and block when needed</h2>
        <p className="fc-body">
          In-product report and block are the right tools for safety issues
          between members. FounderChatters may moderate or remove access for
          policy violations.
        </p>
      </section>
    </PublicPage>
  );
}
