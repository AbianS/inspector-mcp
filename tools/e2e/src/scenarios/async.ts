async function fetchUserData(
  userId: number,
): Promise<{ id: number; name: string; score: number }> {
  // Simulates an async I/O call (e.g. database/HTTP)
  await delay(50);

  const userData = {
    // line 14 — step into here from runAsync
    id: userId,
    name: `User #${userId}`,
    score: Math.floor(Math.random() * 100),
  };

  console.log('[async] fetched:', userData);
  return userData;
}

async function computeRanking(
  users: Array<{ id: number; name: string; score: number }>,
): Promise<string[]> {
  const sorted = [...users].sort((a, b) => b.score - a.score); // line 26 — inspect sorted
  return sorted.map((u, i) => `#${i + 1} ${u.name} (${u.score})`);
}

export async function runAsync(): Promise<void> {
  const userIds = [1, 2, 3];

  const users = await Promise.all(userIds.map((id) => fetchUserData(id)));
  const ranking = await computeRanking(users); // line 35 — step into this

  console.log('[async] ranking:');
  for (const entry of ranking) {
    console.log('[async]  ', entry);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
