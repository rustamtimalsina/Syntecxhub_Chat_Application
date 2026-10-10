export const REACTIONS = [
  { key: 'like', emoji: '👍', label: 'Like' },
  { key: 'love', emoji: '❤️', label: 'Love' },
  { key: 'laugh', emoji: '😂', label: 'Laugh' },
  { key: 'wow', emoji: '😮', label: 'Wow' },
  { key: 'fire', emoji: '🔥', label: 'Fire' },
  { key: 'thanks', emoji: '🙏', label: 'Thanks' },
];

// Count each reaction and note which ones are mine
export const groupReactions = (list = [], myId) =>
  REACTIONS.map((r) => ({
    ...r,
    count: list.filter((x) => x.key === r.key).length,
    mine: list.some((x) => x.key === r.key && String(x.user) === String(myId)),
  })).filter((g) => g.count > 0);