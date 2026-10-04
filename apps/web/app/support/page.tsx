import {
  PUBLIC_SUPPORT_CATEGORIES,
  type PublicSupportCategory,
} from '@founderchatters/contracts';

import { publicPageMetadata } from '../marketing/public-metadata';
import { InfoCard, PublicPage } from '../marketing/sections';

export const metadata = publicPageMetadata({
  title: 'Support — FounderChatters',
  description:
    'Contact the FounderChatters support team about account, application, safety, privacy, or technical questions.',
  path: '/support',
});

const CATEGORY_COPY: Record<
  PublicSupportCategory,
  { title: string; body: string }
> = {
  account: {
    title: 'Account',
    body: 'Sign-in, email verification, password reset, or account access.',
  },
  application: {
    title: 'Application',
    body: 'Founder application status or how to complete an application.',
  },
  safety: {
    title: 'Safety',
    body: 'Contact the support team about a safety concern. In-product report and block remain the member tools for reports between accounts.',
  },
  privacy: {
    title: 'Privacy',
    body: 'Questions about your own data, deletion, or how private conversations are handled.',
  },
  technical: {
    title: 'Technical',
    body: 'Something in the product is broken or unavailable.',
  },
  other: {
    title: 'Other',
    body: 'A question that does not fit the other categories.',
  },
};

export default function SupportPage() {
  return (
    <PublicPage>
      <section className="fc-mkt-prose">
        <p className="fc-label fc-mkt-kicker">Support</p>
        <h1 className="fc-h1">Contact support</h1>
        <p className="fc-body">
          Send a written request to the support team. This form stores your
          message for the team to review. It does not create an in-product
          report, browse private messages, or promise a response time.
        </p>
      </section>
      <div className="fc-mkt-grid fc-mkt-grid--3">
        {PUBLIC_SUPPORT_CATEGORIES.map((category) => (
          <a
            className="fc-mkt-card-link"
            href={`/support/new?category=${category}`}
            key={category}
          >
            <InfoCard
              kicker={category}
              title={CATEGORY_COPY[category].title}
              body={CATEGORY_COPY[category].body}
            />
          </a>
        ))}
      </div>
    </PublicPage>
  );
}
