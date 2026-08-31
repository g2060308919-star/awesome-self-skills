export function resolveSession(draft, sessionId) {
  const session = draft.sessions.find(
    (candidate) => candidate.id === sessionId && candidate.active
  );
  if (!session) return { session: null, account: null };
  const account = draft.accounts.find(({ id }) => id === session.accountId) ?? null;
  return { session, account };
}

export function invalidateSession(draft, sessionId) {
  const session = draft.sessions.find(
    (candidate) => candidate.id === sessionId && candidate.active
  );
  if (!session) return null;
  session.active = false;
  return session;
}

export function invalidateAccountSessions(draft, accountId) {
  const invalidated = [];
  for (const session of draft.sessions) {
    if (session.accountId === accountId && session.active) {
      session.active = false;
      invalidated.push(session.id);
    }
  }
  return invalidated;
}
