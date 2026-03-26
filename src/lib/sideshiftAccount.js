const SIDESHIFT_GRAPHQL = 'https://sideshift.ai/graphql';

/**
 * Creates a new SideShift account via public GraphQL. The secret is used as `x-sideshift-secret`;
 * `id` is the affiliate / account id for REST calls.
 *
 * @returns {Promise<{ affiliateId: string; secret: string }>}
 */
export async function createAccountViaGraphql(options = {}) {
  const res = await fetch(SIDESHIFT_GRAPHQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: 'mutation { createAccount { id secret } }',
    }),
    signal: options.signal,
  });

  const text = await res.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('Invalid response from SideShift.');
  }

  if (payload.errors?.length) {
    const msg = payload.errors.map((e) => e.message).join(' ') || 'GraphQL error';
    throw new Error(msg);
  }

  const created = payload.data?.createAccount;
  const affiliateId = created?.id;
  const secret = created?.secret;
  if (typeof affiliateId !== 'string' || typeof secret !== 'string' || !affiliateId || !secret) {
    throw new Error('SideShift did not return account credentials.');
  }

  return { affiliateId, secret };
}
